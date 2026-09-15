/**
 * Recuperar contraseña con un enlace de un solo uso que vence en 30 minutos.
 * En la BD solo queda el hash del enlace.
 */
import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { env } from '../env.js';
import { AuthService } from './auth.js';
import { emailConfigured, sendEmail } from './email.js';

const RESET_TTL_MINUTES = 30;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * Crea el enlace y lo envía por correo. Devuelve el enlace solo en desarrollo
 * sin proveedor de correo, para poder usarlo igual; en cualquier otro caso null.
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const user = await AuthService.getUserByEmail(email);
  if (!user) return null;

  // Solo vale el último enlace pedido.
  await db.query('DELETE FROM password_resets WHERE userId = $1 AND usedAt IS NULL', [user.id]);

  const token = randomBytes(32).toString('base64url');
  await db.query(`
    INSERT INTO password_resets (id, userId, tokenHash, expiresAt, createdAt)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
  `, [uuidv4(), user.id, hashToken(token), new Date(Date.now() + RESET_TTL_MINUTES * 60_000).toISOString()]);

  const link = `${env.APP_URL.replace(/\/+$/, '')}/reset-password?token=${token}`;
  const sent = await sendEmail(
    user.email,
    'Recupera tu contraseña de FITCV',
    `Hola:\n\nPara crear una nueva contraseña de FITCV entra a este enlace. Vence en ${RESET_TTL_MINUTES} minutos:\n\n${link}\n\nSi no lo pediste, ignora este correo: tu contraseña sigue igual.\n\nFITCV`
  );

  return !sent && !emailConfigured() && env.NODE_ENV !== 'production' ? link : null;
}

/** Cambia la contraseña si el enlace es válido. El enlace no se puede volver a usar. */
export async function resetPassword(token: string, password: string): Promise<boolean> {
  // Canjear y marcar en una sola sentencia: dos envíos simultáneos no pueden usar el mismo enlace.
  const used = await db.queryOne<{ userId: string }>(`
    UPDATE password_resets SET usedAt = CURRENT_TIMESTAMP
    WHERE tokenHash = $1 AND usedAt IS NULL AND expiresAt > CURRENT_TIMESTAMP
    RETURNING userId
  `, [hashToken(token)]);
  if (!used) return false;

  await db.query('UPDATE users SET passwordHash = $1, updatedAt = CURRENT_TIMESTAMP WHERE id = $2', [
    await AuthService.hashPassword(password),
    used.userId,
  ]);
  // Quien cambia la contraseña puede sospechar de un acceso ajeno: se cierran las sesiones.
  await AuthService.invalidateRefreshTokens(used.userId);
  return true;
}
