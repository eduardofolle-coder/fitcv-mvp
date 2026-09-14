/**
 * Vinculación de la extensión de Chrome con la cuenta.
 *
 * La extensión nunca ve la contraseña: el candidato genera un código de un solo
 * uso en la web y lo escribe en la extensión, que lo canjea por un token propio,
 * revocable y distinto del JWT de la web. En la BD solo quedan hashes.
 */
import { createHash, randomBytes, randomInt } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const EXTENSION_TOKEN_PREFIX = 'fitcv_ext_';
export const PAIRING_CODE_TTL_MINUTES = 10;

// Sin 0/O ni 1/I: el código se lee en una pantalla y se tipea a mano.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export const hashSecret = (secret: string): string => createHash('sha256').update(secret).digest('hex');

export function generatePairingCode(): string {
  let raw = '';
  for (let i = 0; i < CODE_LENGTH; i++) raw += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export const normalizePairingCode = (code: string): string => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function createPairingCode(userId: string): Promise<{ code: string; expiresAt: string }> {
  // Solo vale el último código mostrado: generar uno nuevo invalida los anteriores.
  await db.query('DELETE FROM extension_pairing_codes WHERE userId = $1 AND usedAt IS NULL', [userId]);

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60_000).toISOString();
  await db.query(`
    INSERT INTO extension_pairing_codes (id, userId, codeHash, expiresAt, createdAt)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
  `, [uuidv4(), userId, hashSecret(normalizePairingCode(code)), expiresAt]);

  return { code, expiresAt };
}

export async function redeemPairingCode(
  code: string,
  deviceName: string | null
): Promise<{ token: string; tokenId: string } | null> {
  const normalized = normalizePairingCode(code);
  if (normalized.length !== CODE_LENGTH) return null;

  // Canjear y marcar en una sola sentencia: dos canjes simultáneos no pueden
  // usar el mismo código.
  const used = await db.queryOne<{ userId: string }>(`
    UPDATE extension_pairing_codes SET usedAt = CURRENT_TIMESTAMP
    WHERE codeHash = $1 AND usedAt IS NULL AND expiresAt > CURRENT_TIMESTAMP
    RETURNING userId
  `, [hashSecret(normalized)]);
  if (!used) return null;

  const token = EXTENSION_TOKEN_PREFIX + randomBytes(32).toString('base64url');
  const tokenId = uuidv4();
  await db.query(`
    INSERT INTO extension_tokens (id, userId, tokenHash, deviceName, createdAt)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
  `, [tokenId, used.userId, hashSecret(token), deviceName]);

  return { token, tokenId };
}

export async function listExtensionTokens(userId: string) {
  const result = await db.query(`
    SELECT id, deviceName, createdAt, lastUsedAt FROM extension_tokens
    WHERE userId = $1 AND revokedAt IS NULL
    ORDER BY createdAt DESC
  `, [userId]);
  return result.rows;
}

export async function revokeExtensionToken(userId: string, tokenId: string): Promise<boolean> {
  const revoked = await db.queryOne<{ id: string }>(`
    UPDATE extension_tokens SET revokedAt = CURRENT_TIMESTAMP
    WHERE id = $1 AND userId = $2 AND revokedAt IS NULL
    RETURNING id
  `, [tokenId, userId]);
  return revoked !== null;
}

/** Autentica las llamadas de la extensión. Un JWT de la web no sirve aquí, ni al revés. */
export const requireExtension = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token.startsWith(EXTENSION_TOKEN_PREFIX)) {
    return res.status(401).json({ error: 'This endpoint needs a paired FITCV extension.' });
  }

  const row = await db.queryOne<{ id: string; userId: string; email: string }>(`
    SELECT t.id, t.userId, u.email
    FROM extension_tokens t
    JOIN users u ON u.id = t.userId
    WHERE t.tokenHash = $1 AND t.revokedAt IS NULL
    LIMIT 1
  `, [hashSecret(token)]);

  if (!row) {
    return res.status(401).json({ error: 'The extension is not paired or was disconnected. Pair it again from FITCV.' });
  }

  await db.query('UPDATE extension_tokens SET lastUsedAt = CURRENT_TIMESTAMP WHERE id = $1', [row.id]);

  (req as any).user = { id: row.userId, email: row.email };
  (req as any).extensionTokenId = row.id;
  next();
});
