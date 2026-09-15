/**
 * Los datos duros del candidato, tal como se extrajeron de su CV.
 */
import { db } from '../db/client.js';
import { AppError } from '../middleware/errorHandler.js';
import { safeJsonParse } from '../utils/safeJson.js';
import { buildHardData, type HardData } from './cvComposer.js';
import { EncryptionService } from './encryption.js';
import { buildMatchingProfile, type MatchingProfile } from './offerMatching.js';

const toMatchingProfile = (row: any): MatchingProfile =>
  buildMatchingProfile({
    yearsExperience: typeof row.yearsExperience === 'number' ? row.yearsExperience : null,
    experience: safeJsonParse(row.experience, []),
    education: safeJsonParse(row.education, []),
    skills: safeJsonParse(row.skills, {}),
    summary: typeof row.summary === 'string' ? row.summary : null,
  });

/** Términos del perfil para buscar ofertas afines, o null si no hay CV analizado. */
export async function loadMatchingProfile(userId: string): Promise<MatchingProfile | null> {
  const row = await db.queryOne<any>(
    'SELECT yearsExperience, experience, education, skills, summary FROM candidate_profiles WHERE userId = $1 LIMIT 1',
    [userId]
  );
  if (!row) return null;
  const profile = toMatchingProfile(row);
  return profile.terms.length > 0 ? profile : null;
}

/** Perfiles de todos los candidatos, para que los lectores prioricen lo que buscan. */
export async function loadAllMatchingProfiles(limit = 500): Promise<MatchingProfile[]> {
  const rows = (await db.query<any>(
    'SELECT yearsExperience, experience, education, skills, summary FROM candidate_profiles ORDER BY updatedAt DESC LIMIT $1',
    [limit]
  )).rows;
  return rows.map(toMatchingProfile).filter(profile => profile.terms.length > 0);
}

export async function loadHardData(userId: string): Promise<HardData> {
  const profile = await db.queryOne<any>(`
    SELECT fullName, yearsExperience, education, skills, experience, languages, certifications, contactInfo
    FROM candidate_profiles WHERE userId = $1 LIMIT 1
  `, [userId]);

  if (!profile) {
    throw new AppError(404, 'Profile not found. Please upload your CV first.');
  }

  // Un perfil analizado antes de guardar el historial estructurado no tiene de
  // dónde copiar empresas y fechas; usarlo obligaría al modelo a reconstruirlas,
  // que es justo lo que este flujo evita.
  if (profile.experience === null || profile.experience === undefined) {
    throw new AppError(409, 'Your CV was analyzed before FITCV stored your work history in structured form. Please upload it again to enable tailoring.');
  }

  let contact: Record<string, unknown> = {};
  if (profile.contactInfo) {
    try {
      contact = safeJsonParse(EncryptionService.decrypt(profile.contactInfo), {});
    } catch {
      contact = {};
    }
  }

  return buildHardData(profile, contact);
}
