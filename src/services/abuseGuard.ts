/**
 * Anti-abuso del plan Free (5 postulaciones de por vida). Sin bloquear por IP
 * (falsos positivos por CGNAT, oficinas y VPN): la cuota es por persona.
 *
 * Una cuenta Free solo postula si (1) verificó su correo, (2) su CV muestra
 * experiencia o estudios reales y (3) ninguna cuenta más antigua tiene el mismo
 * CV o el mismo teléfono. Los planes pagos no pasan por aquí: los identifica el pago.
 */
import { createHash } from 'crypto';
import { db } from '../db/client.js';
import { AppError } from '../middleware/errorHandler.js';
import { safeJsonParse } from '../utils/safeJson.js';

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

/** a.b+x@gmail.com y ab@gmail.com son el mismo buzón: comparten huella. */
export function normalizeEmail(email: string): string {
  const [local = '', domain = ''] = email.trim().toLowerCase().split('@');
  const base = (local.split('+')[0] ?? '');
  return domain === 'gmail.com' || domain === 'googlemail.com'
    ? `${base.replace(/\./g, '')}@gmail.com`
    : `${base}@${domain}`;
}

/** Mismo CV con otra puntuación, tildes o mayúsculas → misma huella. */
export function cvFingerprint(text: string): string {
  return sha(text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''));
}

/** Últimos 9 dígitos (celular chileno sin prefijo); null si no hay teléfono utilizable. */
export function phoneFingerprint(phone: unknown): string | null {
  const digits = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
  return digits.length >= 8 ? sha(digits.slice(-9)) : null;
}

const hasItems = (json: string | null): boolean => safeJsonParse<unknown[]>(json ?? '[]', []).length > 0;

/** Motivo por el que una cuenta Free aún no puede postular; null si puede. */
export async function freeApplyBlock(userId: string): Promise<string | null> {
  const user = await db.queryOne<{ plan: string | null; emailVerifiedAt: string | null }>(
    'SELECT plan, emailVerifiedAt FROM users WHERE id = $1',
    [userId]
  );
  if (!user || (user.plan && user.plan !== 'free')) return null;

  if (!user.emailVerifiedAt) return 'Verify your email to apply: we sent you a confirmation link.';

  const profile = await db.queryOne<{ experience: string | null; education: string | null; cvFingerprint: string | null; phoneHash: string | null }>(
    'SELECT experience, education, cvFingerprint, phoneHash FROM candidate_profiles WHERE userId = $1',
    [userId]
  );
  if (!profile) return 'Upload your CV to apply.';
  if (!hasItems(profile.experience) && !hasItems(profile.education)) {
    return 'Your CV shows no work experience or education. Upload a complete CV to apply.';
  }

  // Gana la cuenta más antigua: la nueva no recibe cuota.
  const keys: string[] = [];
  const params: unknown[] = [userId];
  if (profile.cvFingerprint) { params.push(profile.cvFingerprint); keys.push(`c.cvFingerprint = $${params.length}`); }
  if (profile.phoneHash) { params.push(profile.phoneHash); keys.push(`c.phoneHash = $${params.length}`); }
  if (keys.length) {
    const twin = await db.queryOne(`
      SELECT 1 AS found FROM candidate_profiles c JOIN users o ON o.id = c.userId
      WHERE c.userId <> $1 AND (${keys.join(' OR ')})
        AND o.createdAt < (SELECT createdAt FROM users WHERE id = $1)
      LIMIT 1
    `, params);
    if (twin) return 'Another account already uses this CV or phone. The Free plan gives one quota per person: use your original account or upgrade to Pro.';
  }
  return null;
}

export async function assertCanApply(userId: string): Promise<void> {
  const reason = await freeApplyBlock(userId);
  if (reason) throw new AppError(403, reason);
}
