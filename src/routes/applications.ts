/**
 * Formularios de postulación y "Mis respuestas frecuentes".
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { parseFields, parseJob, resolveFields } from '../services/fieldResolver.js';
import { loadAnswerPreferences, updateAnswerPreferences } from '../services/savedAnswers.js';
import { syncQueueWithRegions } from '../services/autoPostulate.js';

const router = Router();

// Cada solicitud puede costar dos llamadas al modelo.
const resolveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.id || req.ip,
  message: { error: 'You have reached the limit of form resolutions for this hour. Please try again later.' },
});

// POST /api/applications/resolve-fields
router.post(
  '/resolve-fields',
  requireAuth,
  resolveLimiter,
  asyncHandler(async (req: any, res: any) => {
    const fields = parseFields(req.body?.fields);
    const result = await resolveFields(fields, parseJob(req.body?.job), req.user.id);
    res.json({ success: true, data: result });
  })
);

// GET /api/applications/preferences
router.get(
  '/preferences',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    res.json({ success: true, data: await loadAnswerPreferences(req.user.id) });
  })
);

// PUT /api/applications/preferences - Actualiza solo los campos enviados
router.put(
  '/preferences',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new AppError(400, 'Send the answers to update as a JSON object.');
    }
    const saved = await updateAnswerPreferences(req.user.id, req.body);
    // Cambió dónde acepta trabajar: la cola se ajusta al tiro, antes de que salga algo.
    const queue = 'workRegions' in req.body || 'acceptRemote' in req.body ? await syncQueueWithRegions(req.user.id) : null;
    res.json({ success: true, data: saved, queue });
  })
);

export default router;
