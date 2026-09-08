import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './env.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import { initializeSchema } from './db/schema.js';

const app = express();

// ✅ Initialize database
initializeSchema();

// ✅ Security headers
app.use(helmet());

// ✅ CORS configuration
app.use(cors({
  origin: env.ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));

// ✅ Body parsing
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({limit: '10mb', extended: true}));
app.use(cookieParser());

// ✅ Health check
app.get('/health', (req, res) => {
  res.json({status: 'ok', timestamp: new Date()});
});

// ✅ Routes
app.use('/api/auth', authRoutes);

// ✅ 404 handler
app.use((req, res) => {
  res.status(404).json({error: 'Not found'});
});

// ✅ Error handler (must be last)
app.use(errorHandler);

// ✅ Start server
const PORT = env.PORT;
app.listen(PORT, () => {
  console.log(`🚀 FITCV API running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

export default app;
