/**
 * Avisos del candidato: el análisis diario de ofertas y lo que venga después.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../services/notifications.js';

const router = Router();

// GET /api/notifications?limit=N
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    res.json({ success: true, data: await listNotifications(req.user.id, limit) });
  })
);

// POST /api/notifications/read-all
router.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    await markAllNotificationsRead(req.user.id);
    res.json({ success: true });
  })
);

// POST /api/notifications/:id/read
router.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    if (!(await markNotificationRead(req.user.id, req.params.id))) {
      throw new AppError(404, 'Notification not found');
    }
    res.json({ success: true });
  })
);

export default router;
