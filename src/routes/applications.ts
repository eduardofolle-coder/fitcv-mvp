/**
 * Formularios de postulación y "Mis respuestas frecuentes".
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { parseFields, parseJob, resolveFields } from '../services/fieldResolver.js';
import { loadAnswerPreferences, updateAnswerPreferences } from '../services/savedAnswers.js';
import { syncQueueWithFilters } from '../services/autoPostulate.js';
import { db } from '../db/client.js';
import { EncryptionService } from '../services/encryption.js';
import { safeJsonParse } from '../utils/safeJson.js';
import { answerSuggestion, listSuggestions } from '../services/filterSuggestions.js';
import { approveInbox, clearReviewDeadlines, discardInbox, listInbox, REVIEW_HOURS } from '../services/sendInbox.js';

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
    // El teléfono del CV se ofrece como sugerencia para WhatsApp; nunca se usa sin permiso.
    const profile = await db.queryOne<{ contactInfo: string | null }>('SELECT contactInfo FROM candidate_profiles WHERE userId = $1 LIMIT 1', [req.user.id]);
    let cvPhone: string | null = null;
    try {
      cvPhone = profile?.contactInfo ? safeJsonParse<{ phone?: string }>(EncryptionService.decrypt(profile.contactInfo), {}).phone ?? null : null;
    } catch {
      cvPhone = null;
    }
    res.json({ success: true, data: await loadAnswerPreferences(req.user.id), cvPhone });
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
    const queue = ['workRegions', 'acceptRemote', 'excludedWords', 'blockedCompanies'].some(key => key in req.body) ? await syncQueueWithFilters(req.user.id) : null;
    if ('sendMode' in req.body && saved.sendMode === 'manual') await clearReviewDeadlines(req.user.id);
    res.json({ success: true, data: saved, queue });
  })
);

// GET /api/applications/inbox - Bandeja "Por enviar"
router.get(
  '/inbox',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const prefs = await loadAnswerPreferences(req.user.id);
    res.json({
      success: true,
      data: await listInbox(req.user.id),
      sendMode: prefs.sendMode,
      batchEveryHours: prefs.batchEveryHours,
      dailyAnalysisHour: prefs.dailyAnalysisHour,
      reviewHours: REVIEW_HOURS,
      suggestions: await listSuggestions(req.user.id),
    });
  })
);

// POST /api/applications/inbox/approve { ids } - Sale ya, sin esperar la hora de la tanda
router.post(
  '/inbox/approve',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    res.json({ success: true, approved: await approveInbox(req.user.id, req.body?.ids) });
  })
);

// POST /api/applications/inbox/discard { ids, reason } - No sale; devuelve el cupo
router.post(
  '/inbox/discard',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    res.json({ success: true, discarded: await discardInbox(req.user.id, req.body?.ids, req.body?.reason) });
  })
);

// POST /api/applications/suggestions/:id { accept } - Aplica (o descarta) un filtro sugerido
router.post(
  '/suggestions/:id',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    if (typeof req.body?.accept !== 'boolean') throw new AppError(400, 'accept must be true or false.');
    res.json({ success: true, ...(await answerSuggestion(req.user.id, req.params.id, req.body.accept)) });
  })
);

export default router;
