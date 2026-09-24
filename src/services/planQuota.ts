import { db } from '../db/client.js';

export const PLAN_CONFIG = {
  free: { quota: 5,   isLifetime: true,  runCap: 5,  dailyCap: 5  },
  pro:  { quota: 150, isLifetime: false, runCap: 10, dailyCap: 20 },
  max:  { quota: 300, isLifetime: false, runCap: 20, dailyCap: 40 },
} as const;

export type Plan = keyof typeof PLAN_CONFIG;

/** Thresholds del score de matching para auto-postular o sugerir. */
export const QUALITY_GATE = { auto: 70, suggest: 40 } as const;

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
  quotaRemaining: number;
  dailyUsed: number;
  dailyRemaining: number;
  runCap: number;
  quotaResetAt: string | null;
}

export async function getPlanState(userId: string): Promise<PlanState> {
  const user = await db.queryOne<{ plan: string }>('SELECT plan FROM users WHERE id = $1', [userId]);
  const plan: Plan = isPlan(user?.plan) ? user.plan : 'free';
  const cfg = PLAN_CONFIG[plan];

  const usage = await db.queryOne<{
    quotaUsed: number; quotaResetAt: string | null;
    dailyUsed: number; dailyDate: string | null;
  }>('SELECT quotaUsed, quotaResetAt, dailyUsed, dailyDate FROM plan_usage WHERE userId = $1', [userId]);

  const today = chileToday();
  const quotaUsed = usage?.quotaUsed ?? 0;
  const dailyUsed = usage?.dailyDate === today ? (usage?.dailyUsed ?? 0) : 0;

  return {
    plan,
    quotaUsed,
    quotaTotal: cfg.quota,
    quotaRemaining: Math.max(0, cfg.quota - quotaUsed),
    dailyUsed,
    dailyRemaining: Math.max(0, cfg.dailyCap - dailyUsed),
    runCap: cfg.runCap,
    quotaResetAt: usage?.quotaResetAt ?? null,
  };
}

/**
 * Reserva hasta `requested` slots de auto-postulación (respetando runCap,
 * dailyCap y cuota mensual/vitalicia). Devuelve cuántos se reservaron.
 * Operación atómica: si hay una escritura concurrente, devuelve 0 y el
 * próximo ciclo del worker lo reintenta.
 *
 * ponytail: optimistic lock sin retry — el worker es periódico, reintenta solo.
 */
export async function reserveQuota(userId: string, requested: number): Promise<number> {
  if (requested <= 0) return 0;

  const user = await db.queryOne<{ plan: string }>('SELECT plan FROM users WHERE id = $1', [userId]);
  const plan: Plan = isPlan(user?.plan) ? user.plan : 'free';
  const cfg = PLAN_CONFIG[plan];
  const today = chileToday();

  await db.query(
    `INSERT INTO plan_usage (userId, quotaUsed, dailyUsed, dailyDate, updatedAt)
     VALUES ($1, 0, 0, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (userId) DO NOTHING`,
    [userId, today]
  );

  const usage = await db.queryOne<{ quotaUsed: number; dailyUsed: number; dailyDate: string | null }>(
    'SELECT quotaUsed, dailyUsed, dailyDate FROM plan_usage WHERE userId = $1',
    [userId]
  );
  if (!usage) return 0;

  const currentDaily = usage.dailyDate === today ? usage.dailyUsed : 0;
  const grant = Math.min(
    requested,
    cfg.runCap,
    Math.max(0, cfg.quota - usage.quotaUsed),
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
    RETURNING userId
  `, [grant, userId, today, usage.quotaUsed, currentDaily]);

  return updated ? grant : 0;
}

/** Reinicia la cuota mensual al renovarse la suscripción. */
export async function resetMonthlyQuota(userId: string, nextResetAt: Date): Promise<void> {
  await db.query(
    `UPDATE plan_usage SET quotaUsed = 0, quotaResetAt = $1, updatedAt = CURRENT_TIMESTAMP
     WHERE userId = $2`,
    [nextResetAt.toISOString(), userId]
  );
}
