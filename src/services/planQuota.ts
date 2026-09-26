import { db } from '../db/client.js';
import { AppError } from '../middleware/errorHandler.js';

export const PLAN_CONFIG = {
  free: { quota: 5,   isLifetime: true,  runCap: 5,  dailyCap: 5  },
  pro:  { quota: 150, isLifetime: false, runCap: 10, dailyCap: 20 },
  max:  { quota: 300, isLifetime: false, runCap: 20, dailyCap: 40 },
} as const;

export type Plan = keyof typeof PLAN_CONFIG;

export const OVERAGE_CONFIG = {
  pro: { slots: 30,  priceCLP: 5990  },
  max: { slots: 50,  priceCLP: 10990 },
} as const;

/** Threshold de matching: todo lo que supere esto entra a la cola automática. */
export const QUALITY_GATE = { auto: 40 } as const;

function isPlan(v: unknown): v is Plan {
  return v === 'free' || v === 'pro' || v === 'max';
}

/** Fecha de hoy en zona Chile, formato YYYY-MM-DD. */
const chileToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

export interface PlanState {
  plan: Plan;
  quotaUsed: number;
  quotaTotal: number;
  overageQuota: number;
  effectiveTotal: number;
  quotaRemaining: number;
  dailyUsed: number;
  dailyRemaining: number;
  runCap: number;
  quotaResetAt: string | null;
  overageAvailable: boolean;
  overagePriceCLP: number | null;
}

export async function getPlanState(userId: string): Promise<PlanState> {
  const user = await db.queryOne<{ plan: string }>('SELECT plan FROM users WHERE id = $1', [userId]);
  const plan: Plan = isPlan(user?.plan) ? user.plan : 'free';
  const cfg = PLAN_CONFIG[plan];

  const usage = await db.queryOne<{
    quotaUsed: number; quotaResetAt: string | null;
    dailyUsed: number; dailyDate: string | null; overageQuota: number;
  }>('SELECT quotaUsed, quotaResetAt, dailyUsed, dailyDate, overageQuota FROM plan_usage WHERE userId = $1', [userId]);

  const today = chileToday();
  const quotaUsed = usage?.quotaUsed ?? 0;
  const dailyUsed = usage?.dailyDate === today ? (usage?.dailyUsed ?? 0) : 0;
  const overageQuota = usage?.overageQuota ?? 0;
  const effectiveTotal = cfg.quota + overageQuota;
  const overageCfg = plan !== 'free' ? OVERAGE_CONFIG[plan as 'pro' | 'max'] : null;

  return {
    plan,
    quotaUsed,
    quotaTotal: cfg.quota,
    overageQuota,
    effectiveTotal,
    quotaRemaining: Math.max(0, effectiveTotal - quotaUsed),
    dailyUsed,
    dailyRemaining: Math.max(0, cfg.dailyCap - dailyUsed),
    runCap: cfg.runCap,
    quotaResetAt: usage?.quotaResetAt ?? null,
    overageAvailable: plan !== 'free',
    overagePriceCLP: overageCfg?.priceCLP ?? null,
  };
}

/**
 * Reserva hasta `requested` slots de auto-postulación (respetando runCap,
 * dailyCap y cuota efectiva = mensual + overage). Atómico con optimistic lock.
 *
 * ponytail: sin retry — el worker es periódico, reintenta en el próximo ciclo.
 */
export async function reserveQuota(userId: string, requested: number): Promise<number> {
  if (requested <= 0) return 0;

  const user = await db.queryOne<{ plan: string }>('SELECT plan FROM users WHERE id = $1', [userId]);
  const plan: Plan = isPlan(user?.plan) ? user.plan : 'free';
  const cfg = PLAN_CONFIG[plan];
  const today = chileToday();

  await db.query(
    `INSERT INTO plan_usage (userId, quotaUsed, dailyUsed, dailyDate, overageQuota, updatedAt)
     VALUES ($1, 0, 0, $2, 0, CURRENT_TIMESTAMP)
     ON CONFLICT (userId) DO NOTHING`,
    [userId, today]
  );

  const usage = await db.queryOne<{
    quotaUsed: number; dailyUsed: number; dailyDate: string | null; overageQuota: number;
  }>('SELECT quotaUsed, dailyUsed, dailyDate, overageQuota FROM plan_usage WHERE userId = $1', [userId]);
  if (!usage) return 0;

  const effectiveQuota = cfg.quota + (usage.overageQuota ?? 0);
  const currentDaily = usage.dailyDate === today ? usage.dailyUsed : 0;
  const grant = Math.min(
    requested,
    cfg.runCap,
    Math.max(0, effectiveQuota - usage.quotaUsed),
    Math.max(0, cfg.dailyCap - currentDaily)
  );
  if (grant <= 0) return 0;

  const updated = await db.queryOne<{ userId: string }>(`
    UPDATE plan_usage SET
      quotaUsed = quotaUsed + $1,
      dailyUsed = CASE WHEN dailyDate = $3 THEN dailyUsed + $1 ELSE $1 END,
      dailyDate = $3,
      updatedAt = CURRENT_TIMESTAMP
    WHERE userId = $2
      AND quotaUsed = $4
      AND (CASE WHEN dailyDate = $3 THEN dailyUsed ELSE 0 END) = $5
      AND quotaUsed + $1 <= $6
    RETURNING userId
  `, [grant, userId, today, usage.quotaUsed, currentDaily, effectiveQuota]);

  return updated ? grant : 0;
}

/** Devuelve cupo reservado que no se llegó a usar (la postulación se retiró antes de enviarse). */
export async function releaseQuota(userId: string, count: number): Promise<void> {
  if (count <= 0) return;
  await db.query(`
    UPDATE plan_usage SET
      quotaUsed = GREATEST(0, quotaUsed - $1),
      dailyUsed = CASE WHEN dailyDate = $3 THEN GREATEST(0, dailyUsed - $1) ELSE dailyUsed END,
      updatedAt = CURRENT_TIMESTAMP
    WHERE userId = $2
  `, [count, userId, chileToday()]);
}

/**
 * Agrega un paquete de recarga (overage). Valida que el plan sea Pro o Max.
 * En producción, este método solo debe llamarse tras verificar el pago.
 */
export async function addOverage(userId: string): Promise<{ slotsAdded: number; effectiveTotal: number }> {
  const user = await db.queryOne<{ plan: string }>('SELECT plan FROM users WHERE id = $1', [userId]);
  const plan: Plan = isPlan(user?.plan) ? user.plan : 'free';
  if (plan === 'free') throw new AppError(400, 'El plan Free no admite recargas');

  const packCfg = OVERAGE_CONFIG[plan as 'pro' | 'max'];
  const today = chileToday();

  await db.query(
    `INSERT INTO plan_usage (userId, quotaUsed, dailyUsed, dailyDate, overageQuota, updatedAt)
     VALUES ($1, 0, 0, $2, 0, CURRENT_TIMESTAMP)
     ON CONFLICT (userId) DO NOTHING`,
    [userId, today]
  );

  const updated = await db.queryOne<{ quotaUsed: number; overageQuota: number }>(`
    UPDATE plan_usage SET overageQuota = overageQuota + $1, updatedAt = CURRENT_TIMESTAMP
    WHERE userId = $2
    RETURNING quotaUsed, overageQuota
  `, [packCfg.slots, userId]);

  const cfg = PLAN_CONFIG[plan];
  const effectiveTotal = cfg.quota + (updated?.overageQuota ?? packCfg.slots);
  return { slotsAdded: packCfg.slots, effectiveTotal };
}

/** Reinicia la cuota mensual al renovarse la suscripción. El overage no se renueva. */
export async function resetMonthlyQuota(userId: string, nextResetAt: Date): Promise<void> {
  await db.query(
    `UPDATE plan_usage SET quotaUsed = 0, overageQuota = 0, quotaResetAt = $1, updatedAt = CURRENT_TIMESTAMP
     WHERE userId = $2`,
    [nextResetAt.toISOString(), userId]
  );
}
