/**
 * Cola de envío de postulaciones y su historial.
 *
 * Todo cambio de estado pasa por transitionApplication: valida la transición,
 * la aplica solo si nadie la cambió entretanto y deja registro. Es también la
 * última defensa del "sin mentiras": una postulación no queda como enviada
 * automáticamente si FITCV no resolvió todo el formulario con datos del CV.
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { AppError } from '../middleware/errorHandler.js';
import { safeJsonParse } from '../utils/safeJson.js';
import {
  APPLY_STATUS_LABELS,
  CLAIM_LEASE_MINUTES,
  canTransition,
  isApplyStatus,
  type ApplyMode,
  type ApplyStatus,
} from './applyStatus.js';

export interface TransitionRequest {
  postulationId: string;
  userId: string;
  to: ApplyStatus;
  mode?: ApplyMode | null;
  reason?: string | null;
  detail?: string | null;
  applyUrl?: string | null;
}

export async function transitionApplication(req: TransitionRequest): Promise<{ from: ApplyStatus; to: ApplyStatus }> {
  const row = await db.queryOne<{ applyStatus: string; applyResolution: string | null }>(
    'SELECT applyStatus, applyResolution FROM postulations WHERE id = $1 AND userId = $2',
    [req.postulationId, req.userId]
  );
  if (!row) throw new AppError(404, 'Postulation not found');

  const from: ApplyStatus = isApplyStatus(row.applyStatus) ? row.applyStatus : 'pendiente';
  const { to } = req;
  const mode = req.mode ?? null;

  if (!canTransition(from, to)) {
    throw new AppError(409, `An application that is "${APPLY_STATUS_LABELS[from]}" cannot move to "${APPLY_STATUS_LABELS[to]}".`);
  }

  if (to === 'enviada' && mode === 'auto') {
    const resolution = row.applyResolution
      ? safeJsonParse(row.applyResolution, null as { autoSendable?: boolean } | null)
      : null;
    if (from !== 'enviando' || resolution?.autoSendable !== true) {
      throw new AppError(
        409,
        'This application had answers FITCV could not verify against the CV, so it cannot be recorded as sent automatically.'
      );
    }
  }

  const sent = to === 'enviada';
  const updated = await db.queryOne<{ id: string }>(`
    UPDATE postulations SET
      applyStatus = $1,
      applyReason = $2,
      applyDetail = $3,
      applyUrl = COALESCE($4, applyUrl),
      applyQueuedAt = CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE applyQueuedAt END,
      sentAt = CASE WHEN $6 THEN CURRENT_TIMESTAMP ELSE sentAt END,
      postuladoAt = CASE WHEN $6 THEN CURRENT_TIMESTAMP ELSE postuladoAt END,
      estado = CASE WHEN $6 THEN 'Aplicado' ELSE estado END,
      applyUpdatedAt = CURRENT_TIMESTAMP,
      updatedAt = CURRENT_TIMESTAMP
    WHERE id = $7 AND userId = $8 AND applyStatus = $9
    RETURNING id
  `, [
    to,
    req.reason ?? null,
    req.detail ?? null,
    req.applyUrl ?? null,
    to === 'en-cola',
    sent,
    req.postulationId,
    req.userId,
    from,
  ]);

  if (!updated) {
    throw new AppError(409, 'The application changed while FITCV was updating it. Reload and try again.');
  }

  await db.query(`
    INSERT INTO application_events (id, postulationId, userId, fromStatus, toStatus, mode, reason, detail, createdAt)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
  `, [uuidv4(), req.postulationId, req.userId, from, to, mode, req.reason ?? null, req.detail ?? null]);

  return { from, to };
}

export interface ClaimedApplication {
  postulationId: string;
  attempts: number;
  offer: {
    id: string;
    title: string;
    company: string;
    source: string;
    url: string | null;
    applyUrl: string | null;
  };
}

/**
 * Entrega a la extensión las próximas postulaciones en cola y las marca como
 * "enviando". Las que quedaron tomadas sin reporte más allá del plazo vuelven
 * a entregarse.
 */
export async function claimQueuedApplications(userId: string, limit: number): Promise<ClaimedApplication[]> {
  const claimed = await db.query<{ id: string }>(`
    UPDATE postulations SET
      applyStatus = 'enviando',
      applyClaimedAt = CURRENT_TIMESTAMP,
      applyAttempts = applyAttempts + 1,
      applyResolution = NULL,
      applyUpdatedAt = CURRENT_TIMESTAMP,
      updatedAt = CURRENT_TIMESTAMP
    WHERE id IN (
      SELECT id FROM postulations
      WHERE userId = $1
        AND (
          applyStatus = 'en-cola'
          OR (applyStatus = 'enviando' AND applyClaimedAt < CURRENT_TIMESTAMP - make_interval(mins => $2))
        )
      ORDER BY applyQueuedAt ASC NULLS LAST, createdAt ASC
      LIMIT $3
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `, [userId, CLAIM_LEASE_MINUTES, limit]);

  const ids = claimed.rows.map(r => r.id);
  if (ids.length === 0) return [];

  const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ');
  const rows = await db.query<any>(`
    SELECT p.id, p.applyAttempts, o.id AS offerId, o.title, o.company, o.source, o.url, o.applyUrl
    FROM postulations p
    JOIN offers o ON o.id = p.offerId
    WHERE p.userId = $1 AND p.id IN (${placeholders})
    ORDER BY p.applyQueuedAt ASC NULLS LAST, p.createdAt ASC
  `, [userId, ...ids]);

  return rows.rows.map(r => ({
    postulationId: r.id,
    attempts: Number(r.applyAttempts) || 0,
    offer: {
      id: r.offerId,
      title: r.title,
      company: r.company,
      source: r.source,
      url: r.url ?? null,
      applyUrl: r.applyUrl ?? null,
    },
  }));
}

/** Guarda qué resolvió FITCV para el formulario que la extensión está por enviar. */
export async function recordResolution(
  postulationId: string,
  userId: string,
  resolution: { autoSendable: boolean; fieldCount: number; summary: Record<string, number> }
): Promise<void> {
  const saved = await db.queryOne<{ id: string }>(`
    UPDATE postulations SET applyResolution = $1, applyUpdatedAt = CURRENT_TIMESTAMP
    WHERE id = $2 AND userId = $3 AND applyStatus = 'enviando'
    RETURNING id
  `, [JSON.stringify({ ...resolution, at: new Date().toISOString() }), postulationId, userId]);

  if (!saved) {
    throw new AppError(409, 'Only an application the extension is sending can have its form resolved.');
  }
}

export async function getApplicationEvents(postulationId: string, userId: string) {
  const owned = await db.queryOne('SELECT id FROM postulations WHERE id = $1 AND userId = $2', [postulationId, userId]);
  if (!owned) throw new AppError(404, 'Postulation not found');

  const result = await db.query(`
    SELECT fromStatus, toStatus, mode, reason, detail, createdAt
    FROM application_events
    WHERE postulationId = $1 AND userId = $2
    ORDER BY createdAt ASC
  `, [postulationId, userId]);
  return result.rows;
}

/** Postulación del candidato para una oferta; reutiliza la existente si ya la tiene. */
export async function createPostulationForOffer(userId: string, offerId: string): Promise<{ id: string; created: boolean }> {
  const existing = await db.queryOne<{ id: string }>(
    'SELECT id FROM postulations WHERE userId = $1 AND offerId = $2 ORDER BY createdAt DESC LIMIT 1',
    [userId, offerId]
  );
  if (existing) return { id: existing.id, created: false };

  const id = uuidv4();
  await db.query(`
    INSERT INTO postulations (id, userId, offerId, estado, prioridad, postulationWeight, createdAt, updatedAt)
    VALUES ($1, $2, $3, 'Preparar postulación', 'Media', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [id, userId, offerId]);
  return { id, created: true };
}

export interface ApplyPreferences {
  autoSendLinkedIn: boolean;
}

export async function getApplyPreferences(userId: string): Promise<ApplyPreferences> {
  const row = await db.queryOne<{ autoSendLinkedIn: boolean }>(
    'SELECT autoSendLinkedIn FROM apply_preferences WHERE userId = $1',
    [userId]
  );
  return { autoSendLinkedIn: row?.autoSendLinkedIn === true };
}

export async function setApplyPreferences(userId: string, prefs: ApplyPreferences): Promise<ApplyPreferences> {
  await db.query(`
    INSERT INTO apply_preferences (userId, autoSendLinkedIn, updatedAt)
    VALUES ($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT (userId) DO UPDATE SET autoSendLinkedIn = EXCLUDED.autoSendLinkedIn, updatedAt = CURRENT_TIMESTAMP
  `, [userId, prefs.autoSendLinkedIn]);
  return getApplyPreferences(userId);
}
