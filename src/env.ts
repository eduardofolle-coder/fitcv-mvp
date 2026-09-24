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

  // Proveedor primario (Gemini, OpenAI-shape)
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_API_URL: process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',

  // Proveedor fallback (DeepSeek, OpenAI-shape)
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
  DEEPSEEK_API_URL: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-chat',

  // MercadoPago — pagos de planes y recargas
  MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN || '',
  MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET || '',

  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:3001').split(','),

  // Cada cuántos minutos traer ofertas de los portales. 0 = apagado.
  // GETONBRD_SYNC_MINUTES es el nombre anterior y se sigue aceptando.
  OFFER_SYNC_MINUTES: parseInt(process.env.OFFER_SYNC_MINUTES || process.env.GETONBRD_SYNC_MINUTES || '0'),

  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',

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
  // WhatsApp del admin para alertas del watchdog (E.164). Vacío = solo Sentry+log.
  ADMIN_WHATSAPP: process.env.ADMIN_WHATSAPP || '',

  // Cada cuántos minutos revisa el watchdog. 0 = apagado.
  WATCHDOG_MINUTES: parseInt(process.env.WATCHDOG_MINUTES || '10'),

  // Con varias instancias del servidor, las tareas programadas (lectura de
  // portales, análisis diario) deben correr en una sola: en las demás, false.
  RUN_SCHEDULERS: process.env.RUN_SCHEDULERS !== 'false'
} as const;

// Validation: al menos un proveedor de IA debe estar configurado
if (env.NODE_ENV === 'production' && !process.env.CLAUDE_API_KEY && !process.env.DEEPSEEK_API_KEY && !process.env.GEMINI_API_KEY) {
  throw new Error('Missing AI provider: set CLAUDE_API_KEY (Kimi/Moonshot), GEMINI_API_KEY or DEEPSEEK_API_KEY');
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

// Si ningún proveedor parece usable, advertir al arrancar.
const noUsableProvider =
  (!env.CLAUDE_API_KEY || env.CLAUDE_API_KEY.length < 20) &&
  (!env.GEMINI_API_KEY || env.GEMINI_API_KEY.length < 20) &&
  (!env.DEEPSEEK_API_KEY || env.DEEPSEEK_API_KEY.length < 20);

if (noUsableProvider) {
  const message = 'No AI provider key looks usable (CLAUDE_API_KEY / GEMINI_API_KEY / DEEPSEEK_API_KEY). CV analysis will fail.';
  if (env.NODE_ENV === 'production') {
    throw new Error(message);
  }
  console.warn(`⚠️  ${message}`);
}
