import express from 'express';
import { existsSync, unlinkSync } from 'fs';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './services/logger.js';
import { initErrorTracking, captureException } from './services/errorTracking.js';
import { db } from './db/client.js';
import authRoutes from './routes/auth.js';
import cvRoutes from './routes/cv.js';
import cvAgentRoutes from './routes/cv-agent.js';
import postulationsRoutes from './routes/postulations.js';
import postulationsAgentRoutes from './routes/postulations-agent.js';
import offersRoutes from './routes/offers.js';
import learningRoutes from './routes/learning.js';
import applicationsRoutes from './routes/applications.js';
import extensionRoutes from './routes/extension.js';
import { backfillOfferSearch, startOfferSync } from './services/offerSync.js';
import { startDailyAnalysis } from './services/dailyAnalysis.js';
import { startWatchdog, getHealthReport } from './services/watchdog.js';
import notificationsRoutes from './routes/notifications.js';
import plansRoutes from './routes/plans.js';
import mailRoutes from './routes/mail.js';
import adminRoutes from './routes/admin.js';
import { startChannelJobs } from './services/channelJobs.js';
import { initializeSchema } from './db/schema.js';
import { initializeSeedData, SEED_OFFERS } from './db/seedData.js';
import passport from 'passport';
import { initGoogleAuth } from './services/googleAuth.js';

// Lo primero: si algo falla durante el arranque, queremos que quede reportado.
initErrorTracking();

const app = express();

// En Render (y cualquier hosting con proxy) la IP real viene en X-Forwarded-For.
// Sin esto, los límites de intentos contarían a todos los usuarios como uno solo.
if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

// ✅ Database initialization. El servidor NO acepta tráfico hasta que termina:
// antes se llamaba sin await y app.listen() arrancaba en paralelo, de modo que
// las primeras requests de un arranque en frío pegaban contra una BD inexistente.
async function initializeDatabase() {
  await db.init();
  await initializeSchema();
  await initializeSeedData();
  const backfilled = await backfillOfferSearch();
  if (backfilled > 0) console.log(`✅ Search columns filled for ${backfilled} offers`);
  console.log('✅ Database ready');
}

// ✅ CORS configuration (must be before helmet)
app.use(cors({
  origin: env.ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  // Sin exponerlo, la web no puede leer el nombre del PDF del CV que descarga.
  exposedHeaders: ['Content-Disposition'],
  maxAge: 86400
}));

// ✅ Security headers
app.use(helmet());

// ✅ Body parsing
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({limit: '10mb', extended: true}));
app.use(cookieParser());
initGoogleAuth();
app.use(passport.initialize());

// ✅ Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'FITCV MVP',
    version: '0.2.1',
    status: 'running',
    description: 'Intelligent CV Posting Assistant',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      cv: '/api/cv',
      offers: '/api/offers',
      postulations: '/api/postulations'
    }
  });
});

// ✅ Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    version: '0.2.1',
    offersCount: SEED_OFFERS.length
  });
});

// Diagnóstico del watchdog: BD, cantidad de ofertas y frescura del sync.
// 503 si algo está en falla, para que un monitor externo lo detecte.
app.get('/status', (req, res) => {
  const report = getHealthReport();
  if (!report) return res.json({ status: 'starting' });
  res.status(report.ok ? 200 : 503).json(report);
});

// ✅ Routes
app.use('/api/auth', authRoutes);
app.use('/api/cv', cvRoutes);
app.use('/api/cv', cvAgentRoutes); // Agent-integrated CV routes
// Agent routes first: they use literal paths ('/ranked', '/match') that the
// base router's '/:id' would otherwise swallow.
app.use('/api/postulations', postulationsAgentRoutes);
app.use('/api/postulations', postulationsRoutes);
app.use('/api/offers', offersRoutes);
app.use('/api/learning', learningRoutes); // Continuous learning routes
app.use('/api/applications', applicationsRoutes);
app.use('/api/extension', extensionRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/mail', mailRoutes);
app.use('/api/admin', adminRoutes);

// ✅ 404 handler
app.use((req, res) => {
  res.status(404).json({error: 'Not found'});
});

// ✅ Error handler (must be last)
app.use(errorHandler);

// ✅ Start server
const PORT = env.PORT;
let server: import('http').Server | undefined;

let shuttingDown = false;

/**
 * Síncrono y reentrante a propósito: si el cierre fuera async y su promesa
 * fallara, dispararía unhandledRejection, que vuelve a llamar aquí. Una señal
 * repetida o un error durante el cierre tampoco deben reiniciar el proceso.
 */
function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;

  // Cerrar la BD antes de salir: PGlite escribe en disco y un corte a medias
  // puede dejar el directorio de datos inservible. La promesa nunca rechaza.
  const exit = () => {
    db.close()
      .catch(err => console.error('Error closing the database:', err))
      .finally(() => process.exit(code));
  };

  if (!server) {
    exit();
    return;
  }

  // Si las conexiones abiertas no drenan, no se puede quedar colgado para siempre.
  const force = setTimeout(() => process.exit(code), 10_000);
  force.unref();

  server.close(() => {
    clearTimeout(force);
    exit();
  });
}

// En Windows no hay forma práctica de mandarle SIGINT a un proceso sin consola,
// y matarlo a la fuerza arriesga la BD. En desarrollo, crear este archivo pide
// un cierre ordenado.
if (env.NODE_ENV !== 'production') {
  const shutdownFile = path.resolve('data', `.shutdown-${PORT}`);
  // Un pedido de cierre que quedó de una ejecución anterior no debe apagar esta.
  try {
    unlinkSync(shutdownFile);
  } catch {
    // No había archivo: lo normal.
  }
  const watcher = setInterval(() => {
    if (!existsSync(shutdownFile)) return;
    try {
      unlinkSync(shutdownFile);
    } catch {
      // Si no se pudo borrar igual se cierra; al arrancar de nuevo se ignora.
    }
    console.log('🛑 Shutdown requested through', shutdownFile);
    shutdown(0);
  }, 1000);
  watcher.unref();
}

// Un throw fuera de un handler de Express mataba el proceso sin dejar rastro ni
// guardar la BD. Se registra, se persiste y recién ahí se sale.
process.on('uncaughtException', err => {
  console.error('💥 Uncaught exception:', err);
  logger.error('Uncaught exception', {message: err?.message, stack: err?.stack});
  captureException(err, {source: 'uncaughtException'});
  shutdown(1);
});

process.on('unhandledRejection', reason => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error('💥 Unhandled rejection:', err);
  logger.error('Unhandled rejection', {message: err.message, stack: err.stack});
  captureException(err, {source: 'unhandledRejection'});
  shutdown(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => shutdown(0));
}

// Arrancar solo con la BD lista. Si no lo está, se sale con código de error en
// vez de servir 500s en silencio para siempre.
initializeDatabase()
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`🚀 FITCV API running on http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`📋 Available offers: ${SEED_OFFERS.length}`);
      // Apagado salvo que se configure: los tests y CI no deben salir a internet.
      if (env.RUN_SCHEDULERS) {
        startOfferSync(env.OFFER_SYNC_MINUTES);
        // Solo trabaja para candidatos que eligieron una hora: sin eso no hace nada.
        startDailyAnalysis();
        // Vigila BD y frescura del sync; auto-recupera y alerta lo que no.
        startWatchdog(env.WATCHDOG_MINUTES, env.OFFER_SYNC_MINUTES);
        startChannelJobs();
      }
    });
  })
  .catch(err => {
    console.error('❌ Failed to initialize database, refusing to start:', err);
    process.exit(1);
  });

export default app;
