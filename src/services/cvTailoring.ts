/**
 * Adapta el CV del candidato a una postulación y lo recupera.
 *
 * Lo usan la web y la extensión: los datos duros se copian del perfil, el
 * modelo solo propone la narrativa y un verificador independiente la revisa
 * antes de guardarla.
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { AppError } from '../middleware/errorHandler.js';
import { safeJsonParse } from '../utils/safeJson.js';
import { AgentInvokerService } from './agentInvoker.js';
import { loadHardData } from './candidateProfile.js';
import { composeCV, hardDataForPrompt, sanitizeNarrative } from './cvComposer.js';
import { EncryptionService } from './encryption.js';
import { verifyNarrative } from './narrativeVerifier.js';

export interface TailoredCv {
  cvId: string;
  atsScore: number | null;
  keywordMatches: string[];
  rationale: string;
  adjustments: string[];
  changes: string[];
}

export interface AdaptedCv {
  content: string;
  atsScore: number | null;
  changes: unknown;
  narrative: unknown;
  job: string;
}

export async function tailorCv(postulationId: string, userId: string): Promise<TailoredCv> {
  const postulation = await db.queryOne<any>(`
    SELECT p.offerId, o.title, o.company, o.description
    FROM postulations p
    JOIN offers o ON p.offerId = o.id
    WHERE p.id = $1 AND p.userId = $2
  `, [postulationId, userId]);

  if (!postulation) {
    throw new AppError(404, 'Postulation not found');
  }

  const hard = await loadHardData(userId);

  const agentResult = await AgentInvokerService.invoke('cv-adapter', {
    hardData: hardDataForPrompt(hard),
    job: {
      title: postulation.title,
      company: postulation.company,
      description: postulation.description,
    },
  }, userId);

  if (!agentResult.success || !agentResult.output) {
    throw new AppError(502, `Could not tailor the CV: ${agentResult.error ?? 'the AI returned an unusable response'}`);
  }

  // Primero lo estructural (a qué dato apunta cada logro), después el sentido
  // (si la reformulación afirma más, o menos, de lo que dice el original).
  const sanitized = sanitizeNarrative(agentResult.output.narrative, hard);
  const verified = await verifyNarrative(sanitized.narrative, hard, userId);
  const narrative = verified.narrative;
  const adjustments = [...sanitized.adjustments, ...verified.adjustments];
  const content = composeCV(hard, narrative);

  const rawScore = Number(agentResult.output.atsScore);
  const atsScore = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : null;
  const keywordMatches: string[] = Array.isArray(agentResult.output.keywordMatches)
    ? agentResult.output.keywordMatches.filter((k: unknown): k is string => typeof k === 'string')
    : [];

  // Contenido, narrativa y ajustes derivan del CV (los ajustes citan qué se
  // corrigió y por qué), así que los tres se guardan cifrados.
  const cvId = uuidv4();
  await db.query(`
    INSERT INTO adapted_cvs (
      id, postulationId, userId, offerId, htmlContent, atsScore, changesHighlights, narrative, createdAt
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
  `, [
    cvId,
    postulationId,
    userId,
    postulation.offerId,
    EncryptionService.encrypt(content),
    atsScore,
    EncryptionService.encrypt(JSON.stringify(adjustments)),
    EncryptionService.encrypt(JSON.stringify({ ...narrative, keywordMatches })),
  ]);

  await db.query(`
    UPDATE postulations SET cvAdaptedId = $1, updatedAt = CURRENT_TIMESTAMP WHERE id = $2
  `, [cvId, postulationId]);

  return {
    cvId,
    atsScore,
    keywordMatches,
    rationale: narrative.rationale,
    adjustments,
    changes: [narrative.rationale, ...adjustments].filter(Boolean),
  };
}

/** El CV adaptado más reciente de la postulación, o null si nunca se adaptó. */
export async function getAdaptedCv(postulationId: string, userId: string): Promise<AdaptedCv | null> {
  // Volver a adaptar agrega una fila nueva: sin ordenar, se podía mostrar una versión vieja.
  const cv = await db.queryOne<any>(`
    SELECT ac.htmlContent, ac.atsScore, ac.changesHighlights, ac.narrative, o.title, o.company
    FROM adapted_cvs ac
    JOIN postulations p ON ac.postulationId = p.id
    JOIN offers o ON p.offerId = o.id
    WHERE p.id = $1 AND p.userId = $2
    ORDER BY ac.createdAt DESC
    LIMIT 1
  `, [postulationId, userId]);

  if (!cv) return null;

  let narrative: unknown = null;
  if (cv.narrative) {
    try {
      narrative = safeJsonParse(EncryptionService.decrypt(cv.narrative), null);
    } catch {
      narrative = null;
    }
  }

  // Los CVs adaptados antes de cifrar los ajustes los tienen como JSON plano.
  let changes: unknown = [];
  if (cv.changesHighlights) {
    try {
      changes = safeJsonParse(EncryptionService.decrypt(cv.changesHighlights), []);
    } catch {
      changes = safeJsonParse(cv.changesHighlights, []);
    }
  }

  return {
    content: EncryptionService.decrypt(cv.htmlContent),
    atsScore: cv.atsScore,
    changes,
    narrative,
    job: `${cv.title} at ${cv.company}`,
  };
}
