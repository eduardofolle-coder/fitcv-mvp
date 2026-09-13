/**
 * Reporte de errores a Sentry.
 *
 * Sin DSN configurado todo queda en no-op: en desarrollo no se reporta nada y
 * la ausencia de credenciales nunca puede tumbar el arranque.
 */
import * as Sentry from '@sentry/node';
import { env } from '../env.js';

let enabled = false;

/** Campos que jamás deben salir del servidor hacia un tercero. */
const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'cvcontent',
  'cvoriginalcontent',
  'adaptedcv',
  'apikey',
  'claude_api_key',
];

function isSensitive(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, '');
  return SENSITIVE_KEYS.some(s => normalized.includes(s.replace(/[-_]/g, '')));
}

/** Reemplaza valores sensibles en profundidad antes de enviar nada. */
export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map(v => scrub(v, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitive(key) ? '[redacted]' : scrub(val, depth + 1);
    }
    return out;
  }

  return value;
}

export function initErrorTracking(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    if (env.NODE_ENV === 'production') {
      console.warn('⚠️  SENTRY_DSN is not set: production errors will not be reported.');
    }
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: env.NODE_ENV,
      release: process.env.RELEASE_VERSION,
      // Un porcentaje bajo de trazas alcanza para ver latencia sin inflar costo.
      tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 0,
      // La app maneja CVs: datos personales por definición.
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          if (event.request.headers) {
            event.request.headers = scrub(event.request.headers) as Record<string, string>;
          }
        }
        if (event.extra) {
          event.extra = scrub(event.extra) as Record<string, unknown>;
        }
        return event;
      },
    });

    enabled = true;
    console.log(`✅ Error tracking enabled (${env.NODE_ENV})`);
  } catch (err) {
    // Que falle el reporte de errores no puede impedir que la app arranque.
    console.error('Failed to initialize error tracking:', err);
  }
}

export function captureException(
  error: unknown,
  context?: Record<string, unknown>
): void {
  if (!enabled) return;

  try {
    Sentry.captureException(error, {
      extra: context ? (scrub(context) as Record<string, unknown>) : undefined,
    });
  } catch {
    // Nunca propagar un fallo del reporter.
  }
}

/** Asocia el error a un usuario sin exponer su email. */
export function setUserContext(userId: string | undefined): void {
  if (!enabled) return;
  try {
    Sentry.setUser(userId ? { id: userId } : null);
  } catch {
    // no-op
  }
}

export function isErrorTrackingEnabled(): boolean {
  return enabled;
}
