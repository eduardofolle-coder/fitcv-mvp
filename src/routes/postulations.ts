import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { validateRequest, schemas } from '../middleware/validation.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { CVAdapterService } from '../services/cvAdapter.js';
import { EncryptionService } from '../services/encryption.js';

const router = Router();

// ✅ POST /api/postulations - Crear postulación
router.post(
  '/',
  requireAuth,
  validateRequest(schemas.postulation),
  asyncHandler(async (req: any, res: any) => {
    const { offerId, estado, prioridad, notes } = req.body;

    // ✅ Verificar que la oferta existe
    const offerStmt = db.prepare('SELECT * FROM offers WHERE id = ? LIMIT 1');
    const offer = offerStmt.get(offerId);

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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      postulationId,
      req.user.id,
      offerId,
      estado,
      prioridad,
      notes || null,
      postulationWeight,
      new Date(),
      new Date()
    );

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
    const postulations = stmt.all(...params);

    // ✅ Contar total
    const countStmt = db.prepare(`
      SELECT COUNT(*) as count FROM postulations WHERE userId = ?
    `);
    const { count } = countStmt.get(req.user.id) as any;

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

    const postulation = stmt.get(id, req.user.id);

    if (!postulation) {
      throw new AppError(404, 'Postulation not found');
    }

    res.json({
      success: true,
      data: {
        ...postulation,
        requirements: JSON.parse(postulation.requirements)
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
    if (!checkStmt.get(id, req.user.id)) {
      throw new AppError(404, 'Postulation not found');
    }

    // ✅ Actualizar
    const stmt = db.prepare(`
      UPDATE postulations
      SET estado = ?, prioridad = ?, notes = ?, updatedAt = ?
      WHERE id = ? AND userId = ?
    `);

    stmt.run(estado || null, prioridad || null, notes || null, new Date(), id, req.user.id);

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
    if (!checkStmt.get(id, req.user.id)) {
      throw new AppError(404, 'Postulation not found');
    }

    // ✅ Eliminar
    const stmt = db.prepare('DELETE FROM postulations WHERE id = ? AND userId = ?');
    stmt.run(id, req.user.id);

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
    const postulation = postStmt.get(id, req.user.id);

    if (!postulation) {
      throw new AppError(404, 'Postulation not found');
    }

    // ✅ Obtener CV original
    const profileStmt = db.prepare(`
      SELECT cvOriginalContent FROM candidate_profiles WHERE userId = ? LIMIT 1
    `);
    const profile = profileStmt.get(req.user.id) as any;

    if (!profile) {
      throw new AppError(404, 'Profile not found. Please upload your CV first.');
    }

    // ✅ Desencriptar CV
    const cvContent = EncryptionService.decrypt(profile.cvOriginalContent);

    // ✅ Adaptar CV con Claude
    const adaptation = await CVAdapterService.adaptCV({
      originalCV: cvContent,
      jobOffer: postulation.description,
      jobTitle: postulation.title,
      company: postulation.company
    });

    // ✅ Encriptar CV adaptado
    const encryptedAdaptedCV = EncryptionService.encrypt(adaptation.adaptedCV);

    // ✅ Guardar CV adaptado
    const cvId = uuidv4();
    const cvStmt = db.prepare(`
      INSERT INTO adapted_cvs (
        id, postulationId, userId, offerId, htmlContent, atsScore, changesHighlights, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    cvStmt.run(
      cvId,
      id,
      req.user.id,
      postulation.offerId,
      encryptedAdaptedCV,
      adaptation.atsScore,
      JSON.stringify(adaptation.changes),
      new Date()
    );

    // ✅ Actualizar postulación con referencia a CV adaptado
    const updateStmt = db.prepare(`
      UPDATE postulations SET cvAdaptedId = ?, updatedAt = ? WHERE id = ?
    `);
    updateStmt.run(cvId, new Date(), id);

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

    const cv = stmt.get(id, req.user.id) as any;

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
        changes: JSON.parse(cv.changesHighlights),
        job: `${cv.title} at ${cv.company}`
      }
    });
  })
);

export default router;
