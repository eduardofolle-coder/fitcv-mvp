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

// El enlace lo genera el servidor (base64url + APP_URL): no lleva datos del usuario, no hace falta escapar.
const verificationHtml = (link: string): string => `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:28px">
    <tr><td>
      <p style="margin:0 0 6px;font-size:20px;font-weight:bold;color:#0f172a">fitcv</p>
      <p style="margin:18px 0 8px;font-size:16px;font-weight:bold">Confirma tu correo</p>
      <p style="margin:0 0 22px;font-size:14px;line-height:1.5">Para empezar a postular con FITCV, confirma que este correo es tuyo. El enlace vence en ${TTL_HOURS} horas.</p>
      <a href="${link}" style="display:inline-block;background:#e0a323;color:#1f2937;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 22px;border-radius:6px">Confirmar mi correo</a>
      <p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#6b7280">Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all">${link}</span></p>
      <p style="margin:18px 0 0;font-size:12px;color:#6b7280">Si no creaste una cuenta, ignora este correo.</p>
    </td></tr>
  </table>
</body></html>`;

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
    `Hola:\n\nPara empezar a postular con FITCV confirma tu correo en este enlace. Vence en ${TTL_HOURS} horas:\n\n${link}\n\nSi no creaste una cuenta, ignora este correo.\n\nFITCV`,
    { html: verificationHtml(link) }
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
