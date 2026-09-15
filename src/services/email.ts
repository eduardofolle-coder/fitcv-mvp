/**
 * Correo transaccional por Resend (https://resend.com), sin dependencias: con
 * RESEND_API_KEY y EMAIL_FROM configurados se envía; sin ellos no se envía nada
 * y queda un aviso en el log.
 */
import { env } from '../env.js';
import { logger } from './logger.js';

export const emailConfigured = (): boolean => Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!emailConfigured()) {
    logger.warn('Email not sent: RESEND_API_KEY and EMAIL_FROM are not configured', { subject });
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.error('Email provider rejected the message', { status: res.status, subject });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('Email could not be sent', { subject, message: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
