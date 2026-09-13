import 'dotenv/config';

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000'),
  // postgres:// en producción; pglite:// corre el mismo Postgres en proceso
  // para desarrollo, y memory:// para tests.
  DATABASE_URL: process.env.DATABASE_URL || 'pglite://./data/fitcv-pg',

  JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY || 'dev-private-key',
  JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY || 'dev-public-key',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',

  DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY || 'dev-encryption-key-32bytes-min!!!',

  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || '',
  CLAUDE_API_URL: process.env.CLAUDE_API_URL || 'https://api.anthropic.com/v1/messages',
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

// Los secretos tienen defaults de desarrollo. Arrancar en producción con ellos
// significa firmar tokens con una clave pública conocida: cualquiera podría
// falsificar sesiones. Se prefiere no arrancar.
const DEV_SECRET_DEFAULTS: Record<string, string> = {
  JWT_PRIVATE_KEY: 'dev-private-key',
  JWT_PUBLIC_KEY: 'dev-public-key',
  DATA_ENCRYPTION_KEY: 'dev-encryption-key-32bytes-min!!!',
};

if (env.NODE_ENV === 'production') {
  const insecure = Object.entries(DEV_SECRET_DEFAULTS)
    .filter(([name, devValue]) => {
      const actual = process.env[name];
      return !actual || actual === devValue || actual.length < 32;
    })
    .map(([name]) => name);

  if (insecure.length > 0) {
    throw new Error(
      `Refusing to start: ${insecure.join(', ')} must be set to a unique value of at least 32 characters in production.`
    );
  }

  if (env.ALLOWED_ORIGINS.some(o => o.includes('localhost'))) {
    console.warn('⚠️  ALLOWED_ORIGINS still contains localhost in production.');
  }
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
