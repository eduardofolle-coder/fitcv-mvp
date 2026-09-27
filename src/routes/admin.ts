/**
 * Panel del dueño: salud por portal (E1) y beta cerrada (E6) — invitaciones y
 * planes asignados a mano, sin pasarela de pago. Solo correos en ADMIN_EMAILS.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { db } from '../db/client.js';
import { env } from '../env.js';
import { getPortalHealth, PAUSE_RULE, setPortalOverride, clearPortalOverride } from '../services/portalHealth.js';
import { PLAN_CONFIG } from '../services/planQuota.js';
import { ACTIVE_OFFER } from '../services/profileOffers.js';
import { disconnectMailAccount } from '../services/mailAccounts.js';

const router = Router();

router.use(requireAuth, (req: any, _res, next) => {
  if (!env.ADMIN_EMAILS.includes(String(req.user?.email).toLowerCase())) return next(new AppError(403, 'Forbidden'));
  next();
});

const isPlan = (p: unknown): p is keyof typeof PLAN_CONFIG => typeof p === 'string' && p in PLAN_CONFIG;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Cuentas de prueba: dominios reservados que nunca son de un candidato real.
const isTestEmail = (column: string) =>
  `(${['example.com', 'example.org', 'example.net', 'test.dev'].map(d => `${column} ILIKE '%@${d}'`).join(' OR ')})`;

// GET /api/admin/portal-health
router.get('/portal-health', asyncHandler(async (_req: any, res: any) => {
  res.json({ success: true, data: { rule: PAUSE_RULE, portals: await getPortalHealth(true) } });
}));

// PUT /api/admin/portal-health/:portal { paused, reason? } - pausa o reactiva a mano,
// sin esperar el umbral automático (o forzando activo aunque las estadísticas digan pausar).
router.put('/portal-health/:portal', asyncHandler(async (req: any, res: any) => {
  if (typeof req.body?.paused !== 'boolean') throw new AppError(400, 'paused must be a boolean.');
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) || null : null;
  await setPortalOverride(req.params.portal, req.body.paused, reason);
  res.json({ success: true, data: await getPortalHealth(true) });
}));

// DELETE /api/admin/portal-health/:portal - vuelve a decidirlo solo por las estadísticas
router.delete('/portal-health/:portal', asyncHandler(async (req: any, res: any) => {
  await clearPortalOverride(req.params.portal);
  res.json({ success: true, data: await getPortalHealth(true) });
}));

// GET /api/admin/sources - Cuántas ofertas trae cada portal: si "nuevas 24 h" cae a 0
// varios días, el portal probablemente cambió su HTML.
router.get('/sources', asyncHandler(async (_req: any, res: any) => {
  const rows = (await db.query(`
    SELECT source,
      COUNT(*) FILTER (WHERE ${ACTIVE_OFFER}) AS active,
      COUNT(*) FILTER (WHERE createdAt > CURRENT_TIMESTAMP - INTERVAL '24 hours') AS new24h,
      COUNT(*) FILTER (WHERE createdAt > CURRENT_TIMESTAMP - INTERVAL '7 days') AS new7d,
      MAX(createdAt) AS newest
    FROM offers GROUP BY source ORDER BY active DESC
  `)).rows;
  res.json({ success: true, data: rows });
}));

// GET /api/admin/users - Candidatos con plan y resultados
router.get('/users', asyncHandler(async (_req: any, res: any) => {
  const rows = (await db.query(`
    SELECT u.id, u.email, u.plan, u.createdAt, ${isTestEmail('u.email')} AS isTest,
      COUNT(p.id) FILTER (WHERE p.applyStatus = 'enviada') AS sent,
      COUNT(p.id) FILTER (WHERE p.applyStatus = 'en-cola') AS queued,
      COUNT(p.id) FILTER (WHERE p.applyStatus = 'requiere-atencion') AS attention,
      COUNT(p.id) FILTER (WHERE p.estado = 'Entrevista') AS interviews,
      (SELECT provider FROM mail_accounts m WHERE m.userId = u.id) AS mail
    FROM users u LEFT JOIN postulations p ON p.userId = u.id
    GROUP BY u.id ORDER BY u.createdAt DESC LIMIT 200
  `)).rows;
  // Una cuenta del equipo nunca cuenta como de prueba: el borrado masivo la salta.
  const isAdmin = (email: string) => env.ADMIN_EMAILS.includes(email.toLowerCase());
  res.json({ success: true, data: rows.map((r: any) => ({ ...r, isTest: r.isTest === true && !isAdmin(r.email) })) });
}));

// DELETE /api/admin/test-users - Borra las cuentas de prueba y todos sus datos (nunca una de ADMIN_EMAILS)
router.delete('/test-users', asyncHandler(async (_req: any, res: any) => {
  const users = (await db.query<{ id: string; email: string }>(`SELECT id, email FROM users WHERE ${isTestEmail('email')}`)).rows
    .filter(u => !env.ADMIN_EMAILS.includes(u.email.toLowerCase()));
  for (const u of users) {
    await disconnectMailAccount(u.id); // revoca el permiso de envío si alguna conectó correo
    await db.query('DELETE FROM users WHERE id = $1', [u.id]); // lo del usuario cuelga con ON DELETE CASCADE
  }
  res.json({ success: true, deleted: users.length });
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
