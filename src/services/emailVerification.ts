/**
 * Verificación de correo con un enlace de un solo uso que vence en 24 horas.
 * En la BD solo queda el hash del enlace (mismo esquema que passwordReset.ts).
 */
import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { env } from '../env.js';
import { emailConfigured, sendEmail } from './email.js';

const TTL_HOURS = 24;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Cuentas de Google llegan con el correo ya verificado por Google. */
export async function markEmailVerified(userId: string): Promise<void> {
  await db.query('UPDATE users SET emailVerifiedAt = COALESCE(emailVerifiedAt, CURRENT_TIMESTAMP) WHERE id = $1', [userId]);
}

/**
 * Envía el enlace de verificación. Devuelve el enlace solo en desarrollo sin
 * proveedor de correo, para poder usarlo igual; en cualquier otro caso null.
 */
export async function sendVerificationEmail(userId: string, email: string): Promise<string | null> {
  await db.query('DELETE FROM email_verifications WHERE userId = $1 AND usedAt IS NULL', [userId]);

  const token = randomBytes(32).toString('base64url');
  await db.query(`
    INSERT INTO email_verifications (id, userId, tokenHash, expiresAt, createdAt)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
  `, [uuidv4(), userId, hashToken(token), new Date(Date.now() + TTL_HOURS * 3_600_000).toISOString()]);

  const link = `${env.APP_URL.replace(/\/+$/, '')}/verify-email?token=${token}`;
  const sent = await sendEmail(
    email,
    'Confirma tu correo en FITCV',
    `Hola:\n\nPara empezar a postular con FITCV confirma tu correo en este enlace. Vence en ${TTL_HOURS} horas:\n\n${link}\n\nSi no creaste una cuenta, ignora este correo.\n\nFITCV`
  );

  return !sent && !emailConfigured() && env.NODE_ENV !== 'production' ? link : null;
}

/** Canjear y marcar en una sola sentencia: el enlace no se puede usar dos veces. */
export async function verifyEmail(token: string): Promise<boolean> {
  const used = await db.queryOne<{ userId: string }>(`
    UPDATE email_verifications SET usedAt = CURRENT_TIMESTAMP
    WHERE tokenHash = $1 AND usedAt IS NULL AND expiresAt > CURRENT_TIMESTAMP
    RETURNING userId
  `, [hashToken(token)]);
  if (!used) return false;
  await markEmailVerified(used.userId);
  return true;
}
