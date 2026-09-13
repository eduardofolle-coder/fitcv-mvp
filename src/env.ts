import 'dotenv/config';

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000'),
  DATABASE_URL: process.env.DATABASE_URL || 'sqlite://./data/fitcv.db',

  JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY || 'dev-private-key',
  JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY || 'dev-public-key',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',

  DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY || 'dev-encryption-key-32bytes-min!!!',

  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || '',
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',

  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:3001').split(','),

  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
} as const;

// Validation
const requiredVars = ['CLAUDE_API_KEY'];
const missing = requiredVars.filter(v => !process.env[v]);
if (missing.length > 0 && env.NODE_ENV === 'production') {
  throw new Error(`Missing required env vars: ${missing.join(', ')}`);
}

// Una key con forma de placeholder falla recién al primer análisis de CV, que
// es tarde y confuso. Se avisa al arrancar.
const keyLooksUnusable =
  !env.CLAUDE_API_KEY ||
  env.CLAUDE_API_KEY.length < 50 ||
  /your|xxx|placeholder|here|changeme/i.test(env.CLAUDE_API_KEY);

if (keyLooksUnusable) {
  const message =
    'CLAUDE_API_KEY does not look like a usable key. CV analysis, ranking and CV adaptation will fail until it is set.';
  if (env.NODE_ENV === 'production') {
    throw new Error(message);
  }
  console.warn(`⚠️  ${message}`);
}
