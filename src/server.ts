import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './env.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import cvRoutes from './routes/cv.js';
import cvAgentRoutes from './routes/cv-agent.js';
import postulationsRoutes from './routes/postulations.js';
import postulationsAgentRoutes from './routes/postulations-agent.js';
import offersRoutes from './routes/offers.js';
import learningRoutes from './routes/learning.js';
import { initializeSchema } from './db/schema.js';
import { initializeSeedData, SEED_OFFERS } from './db/seedData.js';

const app = express();

// ✅ Database initialization on deployment (async)
(async () => {
  try {
    await import('./db/client.js').then(m => m.db.init());
    initializeSchema();
    await initializeSeedData();
    console.log('✅ Database ready');
  } catch (err) {
    console.error('❌ Failed to initialize database:', err);
  }
})();

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
const server = app.listen(PORT, () => {
  console.log(`🚀 FITCV API running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📋 Available offers: ${SEED_OFFERS.length}`);
});

// Writes are flushed on a short debounce, so drain them before exiting.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    const { db } = await import('./db/client.js');
    db.flush();
    server.close(() => process.exit(0));
  });
}

export default app;
