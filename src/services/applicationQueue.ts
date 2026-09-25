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
import { formatClp, payBelowMinimum } from './fieldClassifier.js';
import {
  APPLY_STATUS_LABELS,
  CLAIM_LEASE_MINUTES,
  canTransition,
  isApplyStatus,
  mergeResolution,
  type ApplyMode,
  type ApplyStatus,
  type ResolutionRecord,
} from './applyStatus.js';
import { queuePolicy } from './portalHealth.js';
import { extractApplyEmail } from './applyEmail.js';
import { notifyUrgentAttention } from './notifications.js';
import { logger } from './logger.js';

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

  // Fire-and-forget: un aviso que tarda o falla no debe demorar el reporte de la extensión.
  if (to === 'requiere-atencion' && req.reason) {
    notifyUrgentAttention(req.userId, req.reason).catch(err =>
      logger.error('notifyUrgentAttention rejected', { userId: req.userId, err: String(err) })
    );
  }

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
  // Primero lo que más calza en los portales que más salen limpios; los
  // portales en pausa (globales o por racha de CAPTCHA del candidato) esperan.
  const policy = await queuePolicy(userId);
  const candidates = (await db.query<{ id: string }>(`
    SELECT p.id FROM postulations p
    JOIN offers o ON o.id = p.offerId
    WHERE p.userId = $1 AND p.channel = 'portal'
      AND (
        p.applyStatus = 'en-cola'
        OR (p.applyStatus = 'enviando' AND p.applyClaimedAt < CURRENT_TIMESTAMP - make_interval(mins => $2))
      )
      AND NOT (o.source = ANY($3))
    ORDER BY COALESCE(p.matchScore, 50) * COALESCE((($4::jsonb) ->> o.source)::float, 0.5) DESC,
             p.applyQueuedAt ASC NULLS LAST
    LIMIT $5
  `, [userId, CLAIM_LEASE_MINUTES, policy.skip, JSON.stringify(policy.weights), limit])).rows.map(r => r.id);
  if (candidates.length === 0) return [];

  // Se re-verifica el estado al tomarlas: otra pestaña pudo ganar la carrera.
  const claimed = await db.query<{ id: string }>(`
    UPDATE postulations SET
      applyStatus = 'enviando',
      applyClaimedAt = CURRENT_TIMESTAMP,
      applyAttempts = applyAttempts + 1,
      applyResolution = NULL,
      applyUpdatedAt = CURRENT_TIMESTAMP,
      updatedAt = CURRENT_TIMESTAMP
    WHERE id = ANY($1) AND userId = $2
      AND (
        applyStatus = 'en-cola'
        OR (applyStatus = 'enviando' AND applyClaimedAt < CURRENT_TIMESTAMP - make_interval(mins => $3))
      )
    RETURNING id
  `, [candidates, userId, CLAIM_LEASE_MINUTES]);

  const won = new Set(claimed.rows.map(r => r.id));
  const ids = candidates.filter(id => won.has(id));
  if (ids.length === 0) return [];

  const rows = await db.query<any>(`
    SELECT p.id, p.applyAttempts, o.id AS offerId, o.title, o.company, o.source, o.url, o.applyUrl
    FROM postulations p
    JOIN offers o ON o.id = p.offerId
    WHERE p.userId = $1 AND p.id = ANY($2)
  `, [userId, ids]);
  rows.rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

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

/**
 * El candidato resolvió lo que trabó el envío (CAPTCHA, login) en la pestaña que
 * dejó abierta la extensión y pulsó "Continuar": vuelve a "enviando" en el acto,
 * sin esperar turno en la cola.
 */
export async function resumeApplication(postulationId: string, userId: string): Promise<ClaimedApplication> {
  await transitionApplication({ postulationId, userId, to: 'en-cola', mode: 'manual', reason: 'reanudada' });
  const row = await db.queryOne<any>(`
    UPDATE postulations p SET
      applyStatus = 'enviando', applyClaimedAt = CURRENT_TIMESTAMP, applyAttempts = p.applyAttempts + 1,
      applyResolution = NULL, applyUpdatedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
    FROM offers o
    WHERE p.id = $1 AND p.userId = $2 AND p.applyStatus = 'en-cola' AND o.id = p.offerId
    RETURNING p.id, p.applyAttempts, o.id AS offerId, o.title, o.company, o.source, o.url, o.applyUrl
  `, [postulationId, userId]);
  if (!row) throw new AppError(409, 'The application changed while FITCV was resuming it.');
  return {
    postulationId: row.id,
    attempts: Number(row.applyAttempts) || 0,
    offer: { id: row.offerId, title: row.title, company: row.company, source: row.source, url: row.url ?? null, applyUrl: row.applyUrl ?? null },
  };
}

/**
 * Guarda qué resolvió FITCV para el formulario que la extensión está por
 * enviar. Cada paso de un formulario largo se suma al anterior.
 */
export async function recordResolution(
  postulationId: string,
  userId: string,
  step: { autoSendable: boolean; fieldCount: number; summary: Record<string, number> }
): Promise<ResolutionRecord> {
  const notSending = () =>
    new AppError(409, 'Only an application the extension is sending can have its form resolved.');

  const row = await db.queryOne<{ applyStatus: string; applyResolution: string | null }>(
    'SELECT applyStatus, applyResolution FROM postulations WHERE id = $1 AND userId = $2',
    [postulationId, userId]
  );
  if (!row || row.applyStatus !== 'enviando') throw notSending();

  const previous = row.applyResolution
    ? safeJsonParse(row.applyResolution, null as Partial<ResolutionRecord> | null)
    : null;
  const merged = mergeResolution(previous, step);

  // Si otro paso escribió entretanto, no se pisa su resultado.
  const saved = await db.queryOne<{ id: string }>(`
    UPDATE postulations SET applyResolution = $1, applyUpdatedAt = CURRENT_TIMESTAMP
    WHERE id = $2 AND userId = $3 AND applyStatus = 'enviando' AND applyResolution IS NOT DISTINCT FROM $4
    RETURNING id
  `, [JSON.stringify({ ...merged, at: new Date().toISOString() }), postulationId, userId, row.applyResolution]);

  if (!saved) throw notSending();
  return merged;
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

export async function getApplyPreferences(userId: string): Promise<{ autoSendLinkedIn: boolean }> {
  const row = await db.queryOne<{ autoSendLinkedIn: boolean }>(
    'SELECT autoSendLinkedIn FROM apply_preferences WHERE userId = $1',
    [userId]
  );
  return { autoSendLinkedIn: row?.autoSendLinkedIn === true };
}

/**
 * Deja una postulación lista para enviar. Si la oferta paga menos que el mínimo
 * del rango del candidato, no entra a la cola: queda esperando su autorización.
 */
export async function queueApplication(postulationId: string, userId: string): Promise<{ from: ApplyStatus; to: ApplyStatus }> {
  const row = await db.queryOne<any>(`
    SELECT p.salaryAuthorized, o.salaryMin, o.salaryMax, o.salaryCurrency, o.description
    FROM postulations p
    JOIN offers o ON o.id = p.offerId
    WHERE p.id = $1 AND p.userId = $2
  `, [postulationId, userId]);
  if (!row) throw new AppError(404, 'Postulation not found');

  // Si la oferta pide el CV por correo, va por el canal correo y no por la extensión.
  const applyEmail = extractApplyEmail(row.description);
  await db.query(
    `UPDATE postulations SET channel = $1, applyEmail = $2 WHERE id = $3 AND userId = $4`,
    [applyEmail ? 'email' : 'portal', applyEmail, postulationId, userId]
  );

  const prefs = await db.queryOne<{ salaryMin: number | null }>('SELECT salaryMin FROM apply_preferences WHERE userId = $1', [userId]);
  const below = payBelowMinimum(
    { salaryMin: row.salaryMin, salaryMax: row.salaryMax, salaryCurrency: row.salaryCurrency },
    prefs?.salaryMin === null || prefs?.salaryMin === undefined ? null : Number(prefs.salaryMin)
  );

  if (below && row.salaryAuthorized !== true) {
    return transitionApplication({
      postulationId,
      userId,
      to: 'requiere-autorizacion',
      reason: 'renta-bajo-rango',
      detail: `La oferta paga hasta ${formatClp(below.offer)}; tu rango parte en ${formatClp(below.minimum)}.`,
    });
  }

  return transitionApplication({ postulationId, userId, to: 'en-cola' });
}

/** El candidato acepta postular aunque la oferta pague bajo su rango. */
export async function authorizeApplication(postulationId: string, userId: string) {
  const updated = await db.queryOne<{ id: string }>(
    'UPDATE postulations SET salaryAuthorized = TRUE, updatedAt = CURRENT_TIMESTAMP WHERE id = $1 AND userId = $2 RETURNING id',
    [postulationId, userId]
  );
  if (!updated) throw new AppError(404, 'Postulation not found');
  return transitionApplication({ postulationId, userId, to: 'en-cola', mode: 'manual' });
}

/** El candidato no quiere postular a esta oferta. */
export async function declineApplication(postulationId: string, userId: string) {
  const result = await transitionApplication({ postulationId, userId, to: 'pendiente', mode: 'manual' });
  await db.query(
    `UPDATE postulations SET estado = 'Descartado', updatedAt = CURRENT_TIMESTAMP WHERE id = $1 AND userId = $2`,
    [postulationId, userId]
  );
  return result;
}
