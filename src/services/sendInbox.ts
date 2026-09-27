/**
 * Bandeja "Por enviar".
 *
 * Lo que FITCV elige solo no sale directo: se junta en una tanda que el
 * candidato ve en su bandeja. Según su modo:
 * - revision (por defecto): la tanda sale sola REVIEW_HOURS después de
 *   avisarle, salvo lo que descarte. El silencio es un sí.
 * - manual: nada sale sin que lo apruebe.
 * - automatico: no hay bandeja; lo que quede en ella sale en el próximo minuto.
 *
 * La tanda sale una vez al día, a la hora del análisis diario, o cada
 * batchEveryHours horas si el candidato lo eligió. Todo es leer la caché de
 * matching ya calculada: barato aunque corra cada minuto.
 */
import { db } from '../db/client.js';
import { env } from '../env.js';
import { AppError } from '../middleware/errorHandler.js';
import { queueApplication, transitionApplication } from './applicationQueue.js';
import { runAutoPostulate } from './autoPostulate.js';
import { localClock } from './dailyAnalysis.js';
import { sendEmail } from './email.js';
import { logger } from './logger.js';
import { createNotification } from './notifications.js';
import { releaseQuota } from './planQuota.js';

export const REVIEW_HOURS = 3;

export const DISCARD_REASONS = ['empresa', 'ubicacion', 'cargo', 'renta', 'otro'] as const;
export type DiscardReason = (typeof DISCARD_REASONS)[number];

interface BatchSchedule {
  batchEveryHours: number | null;
  dailyAnalysisHour: number | null;
  lastBatchAt: string | Date | null;
}

/** Si al candidato le toca su tanda. Una al día (a la hora de su análisis) o cada N horas. */
export function isBatchDue(s: BatchSchedule, now: Date): boolean {
  const last = s.lastBatchAt ? new Date(s.lastBatchAt) : null;
  if (s.batchEveryHours) return !last || now.getTime() - last.getTime() >= s.batchEveryHours * 3_600_000;
  if (s.dailyAnalysisHour === null) return false;
  const clock = localClock(now);
  return clock.hour >= s.dailyAnalysisHour && (!last || localClock(last).date !== clock.date);
}

const hhmm = (date: Date) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' }).format(date);

async function announceBatch(userId: string, count: number, manual: boolean, sendsAt: Date) {
  const title = manual
    ? `${count === 1 ? '1 postulación espera' : `${count} postulaciones esperan`} tu aprobación`
    : `Tu tanda de ${count === 1 ? '1 postulación' : `${count} postulaciones`} sale a las ${hhmm(sendsAt)}`;
  const body = manual
    ? 'FITCV no envía nada sin tu aprobación. Revisa la bandeja "Por enviar".'
    : 'Revisa la bandeja "Por enviar" y descarta lo que no quieras. Si no haces nada, FITCV la envía a esa hora.';
  await createNotification({ userId, kind: 'tanda-por-enviar', title, body, link: '/por-enviar' });
  const user = await db.queryOne<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
  if (user?.email) await sendEmail(user.email, title, `${body}\n\n${env.APP_URL}/por-enviar`);
}

/** Arma y anuncia las tandas que tocan. Devuelve cuántos candidatos tuvieron tanda. */
export async function runDueBatches(now = new Date()): Promise<number> {
  const users = (await db.query<BatchSchedule & { userId: string; sendMode: string }>(`
    SELECT userId, sendMode, batchEveryHours, dailyAnalysisHour, lastBatchAt
    FROM apply_preferences WHERE sendMode IN ('revision', 'manual')
  `)).rows.filter(u => isBatchDue(u, now));

  for (const u of users) {
    try {
      // Se marca antes: si algo falla, se reintenta en la próxima tanda y no cada minuto.
      await db.query('UPDATE apply_preferences SET lastBatchAt = $1 WHERE userId = $2', [now.toISOString(), u.userId]);
      const { autoQueued } = await runAutoPostulate(u.userId);
      const manual = u.sendMode === 'manual';
      const sendsAt = new Date(now.getTime() + REVIEW_HOURS * 3_600_000);
      const count = manual
        ? autoQueued
        : (await db.query(
            `UPDATE postulations SET reviewUntil = $1
             WHERE userId = $2 AND applyStatus = 'por-enviar' AND reviewUntil IS NULL RETURNING id`,
            [sendsAt.toISOString(), u.userId]
          )).rows.length;
      if (count > 0) await announceBatch(u.userId, count, manual, sendsAt);
    } catch (err) {
      logger.error('Send batch failed', { userId: u.userId, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return users.length;
}

/** Envía a la cola lo que el candidato no descartó a tiempo (y todo, si pasó a automático). */
export async function releaseDueBatches(now = new Date()): Promise<number> {
  const due = (await db.query<{ id: string; userId: string }>(`
    SELECT p.id, p.userId FROM postulations p
    JOIN apply_preferences a ON a.userId = p.userId
    WHERE p.applyStatus = 'por-enviar'
      AND ((a.sendMode = 'revision' AND p.reviewUntil <= $1) OR a.sendMode = 'automatico')
  `, [now.toISOString()])).rows;

  let released = 0;
  for (const row of due) {
    try {
      await queueApplication(row.id, row.userId);
      released++;
    } catch (err) {
      logger.warn('No se pudo soltar la postulación de la bandeja', { postulationId: row.id, err: String(err) });
    }
  }
  return released;
}

/** Al pasar a manual, lo que tenía hora de salida deja de tenerla. */
export async function clearReviewDeadlines(userId: string): Promise<void> {
  await db.query(
    `UPDATE postulations SET reviewUntil = NULL WHERE userId = $1 AND applyStatus = 'por-enviar'`,
    [userId]
  );
}

export async function listInbox(userId: string) {
  const rows = (await db.query<any>(`
    SELECT p.id, p.matchScore, p.reviewUntil, o.id AS offerId, o.title, o.company, o.location, o.source, o.url
    FROM postulations p JOIN offers o ON o.id = p.offerId
    WHERE p.userId = $1 AND p.applyStatus = 'por-enviar'
    ORDER BY p.matchScore DESC NULLS LAST, p.createdAt ASC
  `, [userId])).rows;
  return rows.map(r => ({
    id: r.id,
    matchScore: r.matchScore === null ? null : Number(r.matchScore),
    reviewUntil: r.reviewUntil ? new Date(r.reviewUntil).toISOString() : null,
    offer: { id: r.offerId, title: r.title, company: r.company, location: r.location, source: r.source, url: r.url },
  }));
}

/** Solo se actúa sobre lo que sigue en la bandeja: lo demás ya salió o se descartó. */
async function inInbox(userId: string, ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || !ids.every(id => typeof id === 'string')) {
    throw new AppError(400, 'Send ids as a list of up to 200 application ids.');
  }
  return (await db.query<{ id: string }>(
    `SELECT id FROM postulations WHERE userId = $1 AND id = ANY($2) AND applyStatus = 'por-enviar'`,
    [userId, ids]
  )).rows.map(r => r.id);
}

export async function approveInbox(userId: string, ids: unknown): Promise<number> {
  let approved = 0;
  for (const id of await inInbox(userId, ids)) {
    await queueApplication(id, userId);
    approved++;
  }
  return approved;
}

export async function discardInbox(userId: string, ids: unknown, reason: unknown): Promise<number> {
  if (!(DISCARD_REASONS as readonly unknown[]).includes(reason)) {
    throw new AppError(400, `reason must be one of: ${DISCARD_REASONS.join(', ')}.`);
  }
  let discarded = 0;
  for (const id of await inInbox(userId, ids)) {
    // El motivo queda guardado: más adelante FITCV sugiere filtros a partir de él.
    await transitionApplication({ postulationId: id, userId, to: 'pendiente', mode: 'manual', reason: 'descartada', detail: reason as string });
    await db.query(`UPDATE postulations SET estado = 'Descartado', reviewUntil = NULL, updatedAt = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
    discarded++;
  }
  await releaseQuota(userId, discarded);
  return discarded;
}
