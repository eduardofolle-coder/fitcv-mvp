import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest, schemas } from '../middleware/validation.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { EncryptionService } from '../services/encryption.js';
import { AgentInvokerService } from '../services/agentInvoker.js';
import { safeJsonParse } from '../utils/safeJson.js';
import { getAdaptedCv, tailorCv } from '../services/cvTailoring.js';
import { asciiFileName, pdfFileName, renderCvPdf } from '../services/cvPdf.js';
import {
  authorizeApplication,
  declineApplication,
  getApplicationEvents,
  queueApplication,
  transitionApplication,
} from '../services/applicationQueue.js';

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
    const { page = 1, limit = 20, estado, prioridad, source } = req.query;

    const params: any[] = [req.user.id];
    let query = `
      SELECT p.id, p.userId, p.offerId, p.estado, p.prioridad, p.notes, p.cvAdaptedId,
             p.postulationWeight, p.postuladoAt, p.createdAt, p.updatedAt,
             p.applyStatus, p.applyReason, p.applyDetail,
             p.source AS postulationSource, p.matchScore,
             o.title, o.company, o.level, o.salaryMin, o.salaryMax, o.location,
             o.source AS offerSource
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

    if (source) {
      params.push(source);
      query += ` AND p.source = $${params.length}`;
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
      SELECT p.*, o.title, o.company, o.level, o.description, o.requirements, o.url,
             o.source AS offerSource, p.source AS postulationSource
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

// POST /api/postulations/:id/queue - Dejar la postulación lista para que la extensión la envíe
router.post(
  '/:id/queue',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const result = await queueApplication(req.params.id, req.user.id);
    res.json({ success: true, data: { applyStatus: result.to } });
  })
);

// POST /api/postulations/:id/authorize - Postular aunque la oferta pague bajo el rango
router.post(
  '/:id/authorize',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const result = await authorizeApplication(req.params.id, req.user.id);
    res.json({ success: true, data: { applyStatus: result.to } });
  })
);

// POST /api/postulations/:id/decline - No postular a esta oferta
router.post(
  '/:id/decline',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const result = await declineApplication(req.params.id, req.user.id);
    res.json({ success: true, data: { applyStatus: result.to } });
  })
);

// POST /api/postulations/:id/approve-suggested - El usuario aprueba una sugerida (la pone en cola)
router.post(
  '/:id/approve-suggested',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const row = await db.queryOne<{ source: string }>(
      'SELECT source FROM postulations WHERE id = $1 AND userId = $2',
      [id, req.user.id]
    );
    if (!row) throw new AppError(404, 'Postulation not found');
    if (row.source !== 'suggested') throw new AppError(409, 'Only suggested postulations can be approved this way');
    await db.query(
      'UPDATE postulations SET source = $1, updatedAt = CURRENT_TIMESTAMP WHERE id = $2 AND userId = $3',
      ['manual', id, req.user.id]
    );
    const result = await queueApplication(id, req.user.id);
    res.json({ success: true, data: { applyStatus: result.to } });
  })
);

// POST /api/postulations/:id/unqueue - Sacarla de la cola
router.post(
  '/:id/unqueue',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const result = await transitionApplication({ postulationId: req.params.id, userId: req.user.id, to: 'pendiente' });
    res.json({ success: true, data: { applyStatus: result.to } });
  })
);

// POST /api/postulations/:id/mark-sent - El candidato postuló por su cuenta
router.post(
  '/:id/mark-sent',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const result = await transitionApplication({
      postulationId: req.params.id,
      userId: req.user.id,
      to: 'enviada',
      mode: 'manual',
    });
    res.json({ success: true, data: { applyStatus: result.to } });
  })
);

// GET /api/postulations/:id/events - Historial de envío
router.get(
  '/:id/events',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    res.json({ success: true, data: await getApplicationEvents(req.params.id, req.user.id) });
  })
);

// ✅ POST /api/postulations/:id/generate-cv - Generar CV adaptado
router.post(
  '/:id/generate-cv',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    res.json({ success: true, data: await tailorCv(req.params.id, req.user.id) });
  })
);

// GET /api/postulations/:id/cv.pdf - CV adaptado como PDF para descargar
router.get(
  '/:id/cv.pdf',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const cv = await getAdaptedCv(req.params.id, req.user.id);
    if (!cv) {
      throw new AppError(404, 'Adapted CV not found. Please generate it first.');
    }

    const fileName = pdfFileName(cv.content);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFileName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.send(renderCvPdf(cv.content, { title: cv.job }));
  })
);

// ✅ GET /api/postulations/:id/cv - CV adaptado más reciente
router.get(
  '/:id/cv',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const cv = await getAdaptedCv(req.params.id, req.user.id);
    if (!cv) {
      throw new AppError(404, 'Adapted CV not found. Please generate it first.');
    }
    res.json({ success: true, data: cv });
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
