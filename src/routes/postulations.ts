import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { validateRequest, schemas } from '../middleware/validation.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { CVAdapterService } from '../services/cvAdapter.js';
import { EncryptionService } from '../services/encryption.js';
import { AgentInvokerService } from '../services/agentInvoker.js';
import { safeJsonParse } from '../utils/safeJson.js';

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
    const offerStmt = db.prepare('SELECT * FROM offers WHERE id = ? LIMIT 1');
    offerStmt.bind([offerId]);
    const hasOffer = offerStmt.step();
    const offer = hasOffer ? offerStmt.getAsObject() : null;
    offerStmt.free();

    if (!offer) {
      throw new AppError(404, 'Job offer not found');
    }

    // ✅ Calcular peso de postulación según nivel
    let postulationWeight = 1;
    if (offer.level === 'L3' || offer.level === 'L4') postulationWeight = 2;
    if (offer.level === 'L5' || offer.level === 'L6') postulationWeight = 4;

    // ✅ Crear postulación
    const postulationId = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO postulations (
        id, userId, offerId, estado, prioridad, notes, postulationWeight, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    stmt.bind([
      postulationId,
      req.user.id,
      offerId,
      estado,
      prioridad,
      notes || null,
      postulationWeight
    ]);
    stmt.step();
    stmt.free();

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

    let query = `
      SELECT p.*, o.title, o.company, o.level, o.salaryMin, o.salaryMax, o.location
      FROM postulations p
      JOIN offers o ON p.offerId = o.id
      WHERE p.userId = ?
    `;
    const params = [req.user.id];

    if (estado) {
      query += ' AND p.estado = ?';
      params.push(estado);
    }

    if (prioridad) {
      query += ' AND p.prioridad = ?';
      params.push(prioridad);
    }

    query += ' ORDER BY p.createdAt DESC LIMIT ? OFFSET ?';
    params.push(limit, (page - 1) * limit);

    const stmt = db.prepare(query);
    stmt.bind(params);
    const postulations = [];
    while (stmt.step()) {
      postulations.push(stmt.getAsObject());
    }
    stmt.free();

    // ✅ Contar total
    const countStmt = db.prepare(`
      SELECT COUNT(*) as count FROM postulations WHERE userId = ?
    `);
    countStmt.bind([req.user.id]);
    const hasCount = countStmt.step();
    const { count } = hasCount ? countStmt.getAsObject() : { count: 0 };
    countStmt.free();

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

    const stmt = db.prepare(`
      SELECT p.*, o.title, o.company, o.level, o.description, o.requirements
      FROM postulations p
      JOIN offers o ON p.offerId = o.id
      WHERE p.id = ? AND p.userId = ?
    `);

    stmt.bind([id, req.user.id]);
    const hasPostulation = stmt.step();
    const postulation = hasPostulation ? stmt.getAsObject() : null;
    stmt.free();

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
    const checkStmt = db.prepare('SELECT id FROM postulations WHERE id = ? AND userId = ?');
    checkStmt.bind([id, req.user.id]);
    const exists = checkStmt.step();
    checkStmt.free();

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
      fields.push('estado = ?');
      values.push(estado);
    }

    if (prioridad !== undefined) {
      if (!PRIORIDADES.includes(prioridad)) {
        throw new AppError(400, `Invalid prioridad. Must be one of: ${PRIORIDADES.join(', ')}`);
      }
      fields.push('prioridad = ?');
      values.push(prioridad);
    }

    if (notes !== undefined) {
      fields.push('notes = ?');
      values.push(notes === null ? null : String(notes).slice(0, 500));
    }

    if (fields.length === 0) {
      throw new AppError(400, 'No fields to update. Provide estado, prioridad or notes.');
    }

    const stmt = db.prepare(`
      UPDATE postulations
      SET ${fields.join(', ')}, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ? AND userId = ?
    `);

    stmt.bind([...values, id, req.user.id]);
    stmt.step();
    stmt.free();

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
    const checkStmt = db.prepare('SELECT id FROM postulations WHERE id = ? AND userId = ?');
    checkStmt.bind([id, req.user.id]);
    const exists = checkStmt.step();
    checkStmt.free();

    if (!exists) {
      throw new AppError(404, 'Postulation not found');
    }

    // ✅ Eliminar
    const stmt = db.prepare('DELETE FROM postulations WHERE id = ? AND userId = ?');
    stmt.bind([id, req.user.id]);
    stmt.step();
    stmt.free();

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
    const postStmt = db.prepare(`
      SELECT p.*, o.title, o.company, o.description
      FROM postulations p
      JOIN offers o ON p.offerId = o.id
      WHERE p.id = ? AND p.userId = ?
    `);
    postStmt.bind([id, req.user.id]);
    const hasPost = postStmt.step();
    const postulation = hasPost ? postStmt.getAsObject() : null;
    postStmt.free();

    if (!postulation) {
      throw new AppError(404, 'Postulation not found');
    }

    // ✅ Obtener CV original
    const profileStmt = db.prepare(`
      SELECT cvOriginalContent FROM candidate_profiles WHERE userId = ? LIMIT 1
    `);
    profileStmt.bind([req.user.id]);
    const hasProfile = profileStmt.step();
    const profile = hasProfile ? profileStmt.getAsObject() : null;
    profileStmt.free();

    if (!profile) {
      throw new AppError(404, 'Profile not found. Please upload your CV first.');
    }

    // ✅ Desencriptar CV
    const cvContent = EncryptionService.decrypt(profile.cvOriginalContent);

    // ✅ Adaptar CV con Agent
    const agentResult = await AgentInvokerService.invoke('cv-adapter', {
      originalCV: cvContent,
      jobDescription: postulation.description,
      jobTitle: postulation.title,
      company: postulation.company
    }, req.user.id);

    if (!agentResult.success || !agentResult.output) {
      throw new AppError(500, 'Failed to adapt CV');
    }

    const adaptation = agentResult.output.adaptation || agentResult.output;

    // ✅ Encriptar CV adaptado
    const encryptedAdaptedCV = EncryptionService.encrypt(adaptation.adaptedCV);

    // ✅ Guardar CV adaptado
    const cvId = uuidv4();
    const cvStmt = db.prepare(`
      INSERT INTO adapted_cvs (
        id, postulationId, userId, offerId, htmlContent, atsScore, changesHighlights, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    cvStmt.bind([
      cvId,
      id,
      req.user.id,
      postulation.offerId,
      encryptedAdaptedCV,
      adaptation.atsScore,
      JSON.stringify(adaptation.changes)
    ]);
    cvStmt.step();
    cvStmt.free();

    // ✅ Actualizar postulación con referencia a CV adaptado
    const updateStmt = db.prepare(`
      UPDATE postulations SET cvAdaptedId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?
    `);
    updateStmt.bind([cvId, id]);
    updateStmt.step();
    updateStmt.free();

    res.json({
      success: true,
      data: {
        cvId,
        atsScore: adaptation.atsScore,
        changes: adaptation.changes,
        keywords: adaptation.keywords
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
    const stmt = db.prepare(`
      SELECT ac.htmlContent, ac.atsScore, ac.changesHighlights, o.title, o.company
      FROM adapted_cvs ac
      JOIN postulations p ON ac.postulationId = p.id
      JOIN offers o ON p.offerId = o.id
      WHERE p.id = ? AND p.userId = ?
    `);

    stmt.bind([id, req.user.id]);
    const hasCv = stmt.step();
    const cv = hasCv ? stmt.getAsObject() : null;
    stmt.free();

    if (!cv) {
      throw new AppError(404, 'Adapted CV not found. Please generate it first.');
    }

    // ✅ Desencriptar
    const decryptedContent = EncryptionService.decrypt(cv.htmlContent);

    res.json({
      success: true,
      data: {
        content: decryptedContent,
        atsScore: cv.atsScore,
        changes: safeJsonParse(cv.changesHighlights, []),
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
    const postStmt = db.prepare(`
      SELECT p.*, o.title, o.company, o.description
      FROM postulations p
      JOIN offers o ON p.offerId = o.id
      WHERE p.id = ? AND p.userId = ?
    `);
    postStmt.bind([id, req.user.id]);
    const hasPost = postStmt.step();
    const postulation = hasPost ? postStmt.getAsObject() : null;
    postStmt.free();

    if (!postulation) {
      throw new AppError(404, 'Postulation not found');
    }

    // ✅ Obtener CV original
    const profileStmt = db.prepare(`
      SELECT cvOriginalContent FROM candidate_profiles WHERE userId = ? LIMIT 1
    `);
    profileStmt.bind([req.user.id]);
    const hasProfile = profileStmt.step();
    const profile = hasProfile ? profileStmt.getAsObject() : null;
    profileStmt.free();

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
    const matchStmt = db.prepare(`
      INSERT INTO postulation_matches (
        id, postulationId, userId, matchScore, matchPercentage, strengths, gaps, recommendation, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    matchStmt.bind([
      matchId,
      id,
      req.user.id,
      matchAnalysis.scores?.overallMatch || matchAnalysis.matchPercentile || 0,
      matchAnalysis.matchPercentage || 0,
      JSON.stringify(matchAnalysis.strengths || []),
      JSON.stringify(matchAnalysis.gaps || []),
      matchAnalysis.recommendation || matchAnalysis.verdict || ''
    ]);
    matchStmt.step();
    matchStmt.free();

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
