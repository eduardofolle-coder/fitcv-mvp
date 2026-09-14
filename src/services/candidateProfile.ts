/**
 * Los datos duros del candidato, tal como se extrajeron de su CV.
 */
import { db } from '../db/client.js';
import { AppError } from '../middleware/errorHandler.js';
import { safeJsonParse } from '../utils/safeJson.js';
import { buildHardData, type HardData } from './cvComposer.js';
import { EncryptionService } from './encryption.js';

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
