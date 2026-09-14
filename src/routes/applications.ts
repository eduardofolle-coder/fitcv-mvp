/**
 * Formularios de postulación y preferencias de envío.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { getApplyPreferences, setApplyPreferences } from '../services/applicationQueue.js';
import { parseFields, parseJob, resolveFields } from '../services/fieldResolver.js';

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
    res.json({ success: true, data: await getApplyPreferences(req.user.id) });
  })
);

// PUT /api/applications/preferences
router.put(
  '/preferences',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const autoSendLinkedIn = req.body?.autoSendLinkedIn;
    if (typeof autoSendLinkedIn !== 'boolean') {
      throw new AppError(400, 'autoSendLinkedIn must be true or false.');
    }

    // LinkedIn prohíbe los plugins que automatizan actividad: activarlo es una
    // decisión del candidato sobre su propia cuenta, y tiene que ser explícita.
    if (autoSendLinkedIn && req.body?.acknowledgeLinkedInRisk !== true) {
      throw new AppError(
        400,
        'LinkedIn prohibits browser plugins that automate activity, so automatic sending there can get the account restricted. Send acknowledgeLinkedInRisk: true to enable it.'
      );
    }

    res.json({ success: true, data: await setApplyPreferences(req.user.id, { autoSendLinkedIn }) });
  })
);

export default router;
