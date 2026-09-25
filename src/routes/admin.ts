/**
 * Panel del dueño: salud por portal (E1) y beta cerrada (E6) — invitaciones y
 * planes asignados a mano, sin pasarela de pago. Solo correos en ADMIN_EMAILS.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { db } from '../db/client.js';
import { env } from '../env.js';
import { getPortalHealth, PAUSE_RULE } from '../services/portalHealth.js';
import { PLAN_CONFIG } from '../services/planQuota.js';

const router = Router();

router.use(requireAuth, (req: any, _res, next) => {
  if (!env.ADMIN_EMAILS.includes(String(req.user?.email).toLowerCase())) return next(new AppError(403, 'Forbidden'));
  next();
});

const isPlan = (p: unknown): p is keyof typeof PLAN_CONFIG => typeof p === 'string' && p in PLAN_CONFIG;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/admin/portal-health
router.get('/portal-health', asyncHandler(async (_req: any, res: any) => {
  res.json({ success: true, data: { rule: PAUSE_RULE, portals: await getPortalHealth(true) } });
}));

// GET /api/admin/users - Candidatos con plan y resultados
router.get('/users', asyncHandler(async (_req: any, res: any) => {
  const rows = (await db.query(`
    SELECT u.id, u.email, u.plan, u.createdAt,
      COUNT(p.id) FILTER (WHERE p.applyStatus = 'enviada') AS sent,
      COUNT(p.id) FILTER (WHERE p.applyStatus = 'en-cola') AS queued,
      COUNT(p.id) FILTER (WHERE p.applyStatus = 'requiere-atencion') AS attention,
      COUNT(p.id) FILTER (WHERE p.estado = 'Entrevista') AS interviews,
      (SELECT provider FROM mail_accounts m WHERE m.userId = u.id) AS mail
    FROM users u LEFT JOIN postulations p ON p.userId = u.id
    GROUP BY u.id ORDER BY u.createdAt DESC LIMIT 200
  `)).rows;
  res.json({ success: true, data: rows });
}));

// PUT /api/admin/users/:id/plan { plan }
router.put('/users/:id/plan', asyncHandler(async (req: any, res: any) => {
  if (!isPlan(req.body?.plan)) throw new AppError(400, 'plan must be free, pro or max.');
  const row = await db.queryOne('UPDATE users SET plan = $1 WHERE id = $2 RETURNING id', [req.body.plan, req.params.id]);
  if (!row) throw new AppError(404, 'User not found');
  res.json({ success: true });
}));

// GET /api/admin/invites
router.get('/invites', asyncHandler(async (_req: any, res: any) => {
  const rows = (await db.query('SELECT email, plan, createdAt, usedAt FROM beta_invites ORDER BY createdAt DESC')).rows;
  res.json({ success: true, data: { closed: env.BETA_CLOSED, invites: rows } });
}));

// POST /api/admin/invites { email, plan }
router.post('/invites', asyncHandler(async (req: any, res: any) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const plan = req.body?.plan ?? 'pro';
  if (!EMAIL.test(email)) throw new AppError(400, 'Invalid email.');
  if (!isPlan(plan)) throw new AppError(400, 'plan must be free, pro or max.');
  await db.query(
    `INSERT INTO beta_invites (email, plan) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET plan = $2`,
    [email, plan]
  );
  // Si ya tenía cuenta, el plan se aplica de inmediato.
  await db.query('UPDATE users SET plan = $1 WHERE email = $2', [plan, email]);
  res.status(201).json({ success: true });
}));

// DELETE /api/admin/invites/:email
router.delete('/invites/:email', asyncHandler(async (req: any, res: any) => {
  await db.query('DELETE FROM beta_invites WHERE email = $1', [String(req.params.email).toLowerCase()]);
  res.json({ success: true });
}));

export default router;
