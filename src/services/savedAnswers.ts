/**
 * "Mis respuestas frecuentes": lo que el candidato decide una vez y FITCV usa
 * en todos los formularios. RUT y dirección se guardan cifrados.
 */
import { db } from '../db/client.js';
import { AppError } from '../middleware/errorHandler.js';
import { EncryptionService } from './encryption.js';
import type { SavedAnswers } from './fieldClassifier.js';

export interface AnswerPreferences extends SavedAnswers {
  autoSendLinkedIn: boolean;
  acceptPortalTermsAt: string | null;
}

const EMPTY: AnswerPreferences = {
  autoSendLinkedIn: false,
  salaryMin: null,
  salaryMax: null,
  availability: null,
  rut: null,
  address: null,
  comuna: null,
  region: null,
  nationality: null,
  driverLicense: null,
  willingToTravel: null,
  shiftWork: null,
  relocation: null,
  workPermit: null,
  acceptPortalTerms: false,
  acceptPortalTermsAt: null,
};

const decrypt = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value) return null;
  try {
    return EncryptionService.decrypt(value);
  } catch {
    return null;
  }
};

const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);
const int = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

/** RUT chileno con dígito verificador correcto (módulo 11). */
export function isValidRut(value: string): boolean {
  const compact = value.replace(/[.\s-]/g, '').toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(compact)) return false;

  const body = compact.slice(0, -1);
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  const expected = rest === 11 ? '0' : rest === 10 ? 'K' : String(rest);
  return expected === compact.slice(-1);
}

/** "12345678k" -> "12.345.678-K". */
export function formatRut(value: string): string {
  const compact = value.replace(/[.\s-]/g, '').toUpperCase();
  const body = compact.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${body}-${compact.slice(-1)}`;
}

export async function loadAnswerPreferences(userId: string): Promise<AnswerPreferences> {
  const row = await db.queryOne<any>('SELECT * FROM apply_preferences WHERE userId = $1', [userId]);
  if (!row) return { ...EMPTY };

  return {
    autoSendLinkedIn: row.autoSendLinkedIn === true,
    salaryMin: int(row.salaryMin),
    salaryMax: int(row.salaryMax),
    availability: row.availability ?? null,
    rut: decrypt(row.rut),
    address: decrypt(row.address),
    comuna: row.comuna ?? null,
    region: row.region ?? null,
    nationality: row.nationality ?? null,
    driverLicense: row.driverLicense ?? null,
    willingToTravel: bool(row.willingToTravel),
    shiftWork: bool(row.shiftWork),
    relocation: bool(row.relocation),
    workPermit: bool(row.workPermit),
    acceptPortalTerms: row.acceptPortalTerms === true,
    acceptPortalTermsAt: row.acceptPortalTermsAt ? new Date(row.acceptPortalTermsAt).toISOString() : null,
  };
}

const TEXT_LIMITS: Record<string, number> = {
  availability: 60,
  address: 200,
  comuna: 100,
  region: 100,
  nationality: 60,
  driverLicense: 30,
};

/** Actualiza solo los campos enviados; lo que no viene se conserva. */
export async function updateAnswerPreferences(userId: string, body: Record<string, unknown>): Promise<AnswerPreferences> {
  const current = await loadAnswerPreferences(userId);
  const next: AnswerPreferences = { ...current };
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

  for (const key of ['salaryMin', 'salaryMax'] as const) {
    if (!has(key)) continue;
    const value = body[key];
    if (value === null) {
      next[key] = null;
    } else if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 100_000_000) {
      next[key] = value;
    } else {
      throw new AppError(400, `${key} must be a whole amount in pesos, or null.`);
    }
  }
  if ((next.salaryMin === null) !== (next.salaryMax === null)) {
    throw new AppError(400, 'Declare both ends of the salary range, or neither.');
  }
  if (next.salaryMin !== null && next.salaryMax !== null && next.salaryMin > next.salaryMax) {
    throw new AppError(400, 'salaryMin cannot be greater than salaryMax.');
  }

  for (const [key, limit] of Object.entries(TEXT_LIMITS) as Array<[keyof typeof TEXT_LIMITS & keyof AnswerPreferences, number]>) {
    if (!has(key)) continue;
    const value = body[key];
    if (value !== null && typeof value !== 'string') throw new AppError(400, `${key} must be text or null.`);
    (next as any)[key] = typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null;
  }

  if (has('rut')) {
    const value = body.rut;
    if (value === null || value === '') {
      next.rut = null;
    } else if (typeof value === 'string' && isValidRut(value)) {
      next.rut = formatRut(value);
    } else {
      throw new AppError(400, 'The RUT is not valid. Check the verification digit.');
    }
  }

  for (const key of ['willingToTravel', 'shiftWork', 'relocation', 'workPermit'] as const) {
    if (!has(key)) continue;
    const value = body[key];
    if (value !== null && typeof value !== 'boolean') throw new AppError(400, `${key} must be true, false or null.`);
    next[key] = value as boolean | null;
  }

  if (has('acceptPortalTerms')) {
    if (typeof body.acceptPortalTerms !== 'boolean') throw new AppError(400, 'acceptPortalTerms must be true or false.');
    // La fecha registra cuándo se dio el consentimiento; se conserva mientras siga vigente.
    if (body.acceptPortalTerms && !current.acceptPortalTerms) next.acceptPortalTermsAt = new Date().toISOString();
    if (!body.acceptPortalTerms) next.acceptPortalTermsAt = null;
    next.acceptPortalTerms = body.acceptPortalTerms;
  }

  if (has('autoSendLinkedIn')) {
    if (typeof body.autoSendLinkedIn !== 'boolean') throw new AppError(400, 'autoSendLinkedIn must be true or false.');
    // LinkedIn prohíbe los plugins que automatizan actividad: activarlo es una
    // decisión del candidato sobre su propia cuenta, y tiene que ser explícita.
    if (body.autoSendLinkedIn && body.acknowledgeLinkedInRisk !== true) {
      throw new AppError(
        400,
        'LinkedIn prohibits browser plugins that automate activity, so automatic sending there can get the account restricted. Send acknowledgeLinkedInRisk: true to enable it.'
      );
    }
    next.autoSendLinkedIn = body.autoSendLinkedIn;
  }

  await db.query(`
    INSERT INTO apply_preferences (
      userId, autoSendLinkedIn, salaryMin, salaryMax, availability, rut, address, comuna, region, nationality,
      driverLicense, willingToTravel, shiftWork, relocation, workPermit, acceptPortalTerms, acceptPortalTermsAt, updatedAt
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP)
    ON CONFLICT (userId) DO UPDATE SET
      autoSendLinkedIn = EXCLUDED.autoSendLinkedIn,
      salaryMin = EXCLUDED.salaryMin,
      salaryMax = EXCLUDED.salaryMax,
      availability = EXCLUDED.availability,
      rut = EXCLUDED.rut,
      address = EXCLUDED.address,
      comuna = EXCLUDED.comuna,
      region = EXCLUDED.region,
      nationality = EXCLUDED.nationality,
      driverLicense = EXCLUDED.driverLicense,
      willingToTravel = EXCLUDED.willingToTravel,
      shiftWork = EXCLUDED.shiftWork,
      relocation = EXCLUDED.relocation,
      workPermit = EXCLUDED.workPermit,
      acceptPortalTerms = EXCLUDED.acceptPortalTerms,
      acceptPortalTermsAt = EXCLUDED.acceptPortalTermsAt,
      updatedAt = CURRENT_TIMESTAMP
  `, [
    userId,
    next.autoSendLinkedIn,
    next.salaryMin,
    next.salaryMax,
    next.availability,
    next.rut ? EncryptionService.encrypt(next.rut) : null,
    next.address ? EncryptionService.encrypt(next.address) : null,
    next.comuna,
    next.region,
    next.nationality,
    next.driverLicense,
    next.willingToTravel,
    next.shiftWork,
    next.relocation,
    next.workPermit,
    next.acceptPortalTerms,
    next.acceptPortalTermsAt,
  ]);

  return loadAnswerPreferences(userId);
}
