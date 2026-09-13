import express from 'express';
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
import { initializeSchema } from './db/schema.js';
import { initializeSeedData, SEED_OFFERS } from './db/seedData.js';

// Lo primero: si algo falla durante el arranque, queremos que quede reportado.
initErrorTracking();

const app = express();

// ✅ Database initialization. El servidor NO acepta tráfico hasta que termina:
// antes se llamaba sin await y app.listen() arrancaba en paralelo, de modo que
// las primeras requests de un arranque en frío pegaban contra una BD inexistente.
async function initializeDatabase() {
  await db.init();
  await initializeSchema();
  await initializeSeedData();
  console.log('✅ Database ready');
}

// ✅ CORS configuration (must be before helmet)
app.use(cors({
  origin: env.ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));

// ✅ Security headers
app.use(helmet());

// ✅ Body parsing
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({limit: '10mb', extended: true}));
app.use(cookieParser());

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

  if (!server) {
    process.exit(code);
    return;
  }

  // Si las conexiones abiertas no drenan, no se puede quedar colgado para siempre.
  const force = setTimeout(() => process.exit(code), 10_000);
  force.unref();

  server.close(() => {
    clearTimeout(force);
    process.exit(code);
  });
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
    });
  })
  .catch(err => {
    console.error('❌ Failed to initialize database, refusing to start:', err);
    process.exit(1);
  });

export default app;
