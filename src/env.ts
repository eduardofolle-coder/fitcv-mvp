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
  CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
  CLAUDE_ORCHESTRATOR_MODEL: process.env.CLAUDE_ORCHESTRATOR_MODEL || 'claude-opus-5',
  CLAUDE_TIMEOUT_MS: parseInt(process.env.CLAUDE_TIMEOUT_MS || '120000'),
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',

  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:3001').split(','),

  // Cada cuántos minutos traer ofertas de los portales. 0 = apagado.
  // GETONBRD_SYNC_MINUTES es el nombre anterior y se sigue aceptando.
  OFFER_SYNC_MINUTES: parseInt(process.env.OFFER_SYNC_MINUTES || process.env.GETONBRD_SYNC_MINUTES || '0'),

  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Dirección pública de la web: arma los enlaces de los correos.
  APP_URL: process.env.APP_URL || 'http://localhost:3001',

  // Correo transaccional (Resend). Sin estas dos no se envían correos.
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  EMAIL_FROM: process.env.EMAIL_FROM || '',

  // WhatsApp por Twilio. Sin las tres, el envío es un no-op y los avisos solo
  // quedan en el tablero. TWILIO_WHATSAPP_FROM en el sandbox es whatsapp:+14155238886.
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM || '',

  // Con varias instancias del servidor, las tareas programadas (lectura de
  // portales, análisis diario) deben correr en una sola: en las demás, false.
  RUN_SCHEDULERS: process.env.RUN_SCHEDULERS !== 'false'
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

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.warn('⚠️  RESEND_API_KEY / EMAIL_FROM are not set: password reset emails will not be sent.');
  }
  if (env.APP_URL.includes('localhost')) {
    console.warn('⚠️  APP_URL still points to localhost in production: email links will be broken.');
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
