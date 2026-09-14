import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest, schemas } from '../middleware/validation.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { EncryptionService } from '../services/encryption.js';
import { AgentInvokerService } from '../services/agentInvoker.js';
import { safeJsonParse } from '../utils/safeJson.js';
import { buildHardData, composeCV, hardDataForPrompt, sanitizeNarrative } from '../services/cvComposer.js';
import { verifyNarrative } from '../services/narrativeVerifier.js';

const router = Router();

const ESTADOS = ['Por revisar', 'Preparar postulación', 'Descartado', 'Aplicado', 'En revisión', 'Entrevista'];
const PRIORIDADES = ['Alta', 'Media', 'Baja'];

// ✅ POST /api/postulations - Crear postulación
router.post(
  '/',
  requireAuth,
  validateRequest(schemas.postulation),
  asyncHandler(async (req: any, res: any) => {
    const { offerId, estado, prioridad, notes } = req.body;

    // ✅ Verificar que la oferta existe
    const offer = await db.queryOne('SELECT * FROM offers WHERE id = $1 LIMIT 1', [offerId]);

    if (!offer) {
      throw new AppError(404, 'Job offer not found');
    }

    // ✅ Calcular peso de postulación según nivel
    let postulationWeight = 1;
    if (offer.level === 'L3' || offer.level === 'L4') postulationWeight = 2;
    if (offer.level === 'L5' || offer.level === 'L6') postulationWeight = 4;

    // ✅ Crear postulación
    const postulationId = uuidv4();
    await db.query(`
      INSERT INTO postulations (
        id, userId, offerId, estado, prioridad, notes, postulationWeight, createdAt, updatedAt
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
      postulationId,
      req.user.id,
      offerId,
      estado,
      prioridad,
      notes || null,
      postulationWeight
    ]);

    res.status(201).json({
      success: true,
      data: {
        postulationId,
        offerId,
        estado,
        prioridad,
        postulationWeight
      }
    });
  })
);

// ✅ GET /api/postulations - Listar postulaciones del usuario
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const { page = 1, limit = 20, estado, prioridad } = req.query;

    // Los filtros son opcionales, así que el número de parámetros varía y los
    // $n se numeran sobre la marcha en vez de estar fijos en el texto.
    const params: any[] = [req.user.id];
    let query = `
      SELECT p.*, o.title, o.company, o.level, o.salaryMin, o.salaryMax, o.location
      FROM postulations p
      JOIN offers o ON p.offerId = o.id
      WHERE p.userId = $1
    `;

    if (estado) {
      params.push(estado);
      query += ` AND p.estado = $${params.length}`;
    }

    if (prioridad) {
      params.push(prioridad);
      query += ` AND p.prioridad = $${params.length}`;
    }

    const limitNum = Math.min(Number(limit) || 20, 100);
    const pageNum = Math.max(Number(page) || 1, 1);

    params.push(limitNum, (pageNum - 1) * limitNum);
    query += ` ORDER BY p.createdAt DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const postulations = (await db.query(query, params)).rows;

    // ✅ Contar total
    const countRow = await db.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM postulations WHERE userId = $1',
      [req.user.id]
    );
    const count = Number(countRow?.count ?? 0);

    res.json({
      success: true,
      data: postulations,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  })
);

// ✅ GET /api/postulations/:id - Obtener detalles de postulación
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const postulation = await db.queryOne<any>(`
      SELECT p.*, o.title, o.company, o.level, o.description, o.requirements
      FROM postulations p
      JOIN offers o ON p.offerId = o.id
      WHERE p.id = $1 AND p.userId = $2
    `, [id, req.user.id]);

    if (!postulation) {
      throw new AppError(404, 'Postulation not found');
    }

    res.json({
      success: true,
      data: {
        ...postulation,
        requirements: safeJsonParse(postulation.requirements, [])
      }
    });
  })
);

// ✅ PUT /api/postulations/:id - Actualizar postulación
router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const { estado, prioridad, notes } = req.body;

    // ✅ Verificar que la postulación pertenece al usuario
    const exists = await db.queryOne(
      'SELECT id FROM postulations WHERE id = $1 AND userId = $2',
      [id, req.user.id]
    );

    if (!exists) {
      throw new AppError(404, 'Postulation not found');
    }

    // ✅ Actualización parcial: solo se tocan los campos enviados. Escribir los
    // omitidos como NULL rompía las columnas NOT NULL (estado, prioridad).
    const fields: string[] = [];
    const values: any[] = [];

    if (estado !== undefined) {
      if (!ESTADOS.includes(estado)) {
        throw new AppError(400, `Invalid estado. Must be one of: ${ESTADOS.join(', ')}`);
      }
      values.push(estado);
      fields.push(`estado = $${values.length}`);
    }

    if (prioridad !== undefined) {
      if (!PRIORIDADES.includes(prioridad)) {
        throw new AppError(400, `Invalid prioridad. Must be one of: ${PRIORIDADES.join(', ')}`);
      }
      values.push(prioridad);
      fields.push(`prioridad = $${values.length}`);
    }

    if (notes !== undefined) {
      values.push(notes === null ? null : String(notes).slice(0, 500));
      fields.push(`notes = $${values.length}`);
    }

    if (fields.length === 0) {
      throw new AppError(400, 'No fields to update. Provide estado, prioridad or notes.');
    }

    await db.query(`
      UPDATE postulations
      SET ${fields.join(', ')}, updatedAt = CURRENT_TIMESTAMP
      WHERE id = $${values.length + 1} AND userId = $${values.length + 2}
    `, [...values, id, req.user.id]);

    res.json({
      success: true,
      message: 'Postulation updated successfully'
    });
  })
);

// ✅ DELETE /api/postulations/:id - Eliminar postulación
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    // ✅ Verificar que la postulación pertenece al usuario
    const exists = await db.queryOne(
      'SELECT id FROM postulations WHERE id = $1 AND userId = $2',
      [id, req.user.id]
    );

    if (!exists) {
      throw new AppError(404, 'Postulation not found');
    }

    // ✅ Eliminar
    await db.query('DELETE FROM postulations WHERE id = $1 AND userId = $2', [id, req.user.id]);

    res.json({
      success: true,
      message: 'Postulation deleted successfully'
    });
  })
);

// ✅ POST /api/postulations/:id/generate-cv - Generar CV adaptado
router.post(
  '/:id/generate-cv',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    // ✅ Obtener postulación
    const postulation = await db.queryOne<any>(`
      SELECT p.*, o.title, o.company, o.description
      FROM postulations p
      JOIN offers o ON p.offerId = o.id
      WHERE p.id = $1 AND p.userId = $2
    `, [id, req.user.id]);

    if (!postulation) {
      throw new AppError(404, 'Postulation not found');
    }

    // ✅ Datos duros del perfil: FITCV los copia tal cual, el modelo nunca los escribe.
    const profile = await db.queryOne<any>(`
      SELECT fullName, yearsExperience, education, skills, experience, languages, certifications, contactInfo
      FROM candidate_profiles WHERE userId = $1 LIMIT 1
    `, [req.user.id]);

    if (!profile) {
      throw new AppError(404, 'Profile not found. Please upload your CV first.');
    }

    // Un perfil analizado antes de guardar el historial estructurado no tiene de
    // dónde copiar empresas y fechas; adaptarlo obligaría al modelo a
    // reconstruirlas, que es justo lo que este flujo evita.
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

    const hard = buildHardData(profile, contact);

    const agentResult = await AgentInvokerService.invoke('cv-adapter', {
      hardData: hardDataForPrompt(hard),
      job: {
        title: postulation.title,
        company: postulation.company,
        description: postulation.description
      }
    }, req.user.id);

    if (!agentResult.success || !agentResult.output) {
      throw new AppError(502, `Could not tailor the CV: ${agentResult.error ?? 'the AI returned an unusable response'}`);
    }

    // Primero lo estructural (a qué dato apunta cada logro), después el sentido
    // (si la reformulación afirma más de lo que dice el original).
    const sanitized = sanitizeNarrative(agentResult.output.narrative, hard);
    const verified = await verifyNarrative(sanitized.narrative, hard, req.user.id);
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
      id,
      req.user.id,
      postulation.offerId,
      EncryptionService.encrypt(content),
      atsScore,
      EncryptionService.encrypt(JSON.stringify(adjustments)),
      EncryptionService.encrypt(JSON.stringify({ ...narrative, keywordMatches }))
    ]);

    // ✅ Actualizar postulación con referencia a CV adaptado
    await db.query(`
      UPDATE postulations SET cvAdaptedId = $1, updatedAt = CURRENT_TIMESTAMP WHERE id = $2
    `, [cvId, id]);

    res.json({
      success: true,
      data: {
        cvId,
        atsScore,
        keywordMatches,
        rationale: narrative.rationale,
        adjustments,
        changes: [narrative.rationale, ...adjustments].filter(Boolean)
      }
    });
  })
);

// ✅ GET /api/postulations/:id/cv - Descargar CV adaptado
router.get(
  '/:id/cv',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    // ✅ Obtener CV adaptado
    const cv = await db.queryOne<any>(`
      SELECT ac.htmlContent, ac.atsScore, ac.changesHighlights, ac.narrative, o.title, o.company
      FROM adapted_cvs ac
      JOIN postulations p ON ac.postulationId = p.id
      JOIN offers o ON p.offerId = o.id
      WHERE p.id = $1 AND p.userId = $2
    `, [id, req.user.id]);

    if (!cv) {
      throw new AppError(404, 'Adapted CV not found. Please generate it first.');
    }

    // ✅ Desencriptar
    const decryptedContent = EncryptionService.decrypt(cv.htmlContent);

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

    res.json({
      success: true,
      data: {
        content: decryptedContent,
        atsScore: cv.atsScore,
        changes,
        narrative,
        job: `${cv.title} at ${cv.company}`
      }
    });
  })
);

// ✅ POST /api/postulations/:id/match - Hacer match entre CV y oferta
router.post(
  '/:id/match',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    // ✅ Obtener postulación y oferta
    const postulation = await db.queryOne(`
      SELECT p.*, o.title, o.company, o.description
      FROM postulations p
      JOIN offers o ON p.offerId = o.id
      WHERE p.id = $1 AND p.userId = $2
    `, [id, req.user.id]);

    if (!postulation) {
      throw new AppError(404, 'Postulation not found');
    }

    // ✅ Obtener CV original
    const profile = await db.queryOne(`
      SELECT cvOriginalContent FROM candidate_profiles WHERE userId = $1 LIMIT 1
    `, [req.user.id]);

    if (!profile) {
      throw new AppError(404, 'Profile not found. Please upload your CV first.');
    }

    // ✅ Desencriptar CV
    const cvContent = EncryptionService.decrypt(profile.cvOriginalContent);

    // ✅ Invocar agent de matching
    const agentResult = await AgentInvokerService.invoke('postulation-matcher', {
      cvText: cvContent,
      jobDescription: postulation.description
    }, req.user.id);

    if (!agentResult.success || !agentResult.output) {
      throw new AppError(500, 'Failed to match postulation');
    }

    const matchAnalysis = agentResult.output.matchAnalysis || agentResult.output;

    // ✅ Guardar resultado de matching
    const matchId = uuidv4();
    await db.query(`
      INSERT INTO postulation_matches (
        id, postulationId, userId, matchScore, matchPercentage, strengths, gaps, recommendation, createdAt
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
    `, [
      matchId,
      id,
      req.user.id,
      matchAnalysis.scores?.overallMatch || matchAnalysis.matchPercentile || 0,
      matchAnalysis.matchPercentage || 0,
      JSON.stringify(matchAnalysis.strengths || []),
      JSON.stringify(matchAnalysis.gaps || []),
      matchAnalysis.recommendation || matchAnalysis.verdict || ''
    ]);

    res.json({
      success: true,
      data: {
        matchId,
        score: matchAnalysis.scores?.overallMatch || matchAnalysis.matchPercentile || 0,
        strengths: matchAnalysis.strengths || [],
        gaps: matchAnalysis.gaps || [],
        recommendation: matchAnalysis.recommendation || matchAnalysis.verdict || ''
      }
    });
  })
);

export default router;
