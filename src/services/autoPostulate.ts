/**
 * Auto-postulación basada en caché de matching.
 *
 * Calce alto (≥70%) y calce medio (40-69%) → cola automática, consume cuota.
 * Calce bajo (<40%) → visible en el listado de ofertas para revisión manual.
 * Solo se postula sola donde el candidato acepta trabajar y a lo que no excluyó:
 * una oferta fuera de sus regiones, que no dice dónde es, con una palabra que
 * excluyó o de una empresa que bloqueó, queda en el listado para que decida él.
 * Respeta runCap, dailyCap y cuota mensual/vitalicia del plan del usuario.
 *
 * Salvo en modo automático, lo elegido no va directo a la cola: espera en la
 * bandeja "Por enviar" (ver sendInbox.ts).
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { logger } from './logger.js';
import { freeApplyBlock } from './abuseGuard.js';
import { reserveQuota, releaseQuota, planAllowsPortal, QUALITY_GATE } from './planQuota.js';
import { queueApplication, transitionApplication } from './applicationQueue.js';
import { loadAnswerPreferences, type SendMode } from './savedAnswers.js';
import { offerVerdict } from './regions.js';
import { safeJsonParse } from '../utils/safeJson.js';
import type { CachedRankedOffer } from './matchCache.js';

/** Lo que FITCV eligió solo: a la cola en modo automático, a la bandeja en los otros. */
export async function placeAutoApplication(postulationId: string, userId: string, sendMode: SendMode) {
  if (sendMode === 'automatico') return queueApplication(postulationId, userId);
  // Entra sin hora de salida: se la pone la próxima tanda.
  await db.query('UPDATE postulations SET reviewUntil = NULL WHERE id = $1', [postulationId]);
  return transitionApplication({ postulationId, userId, to: 'por-enviar', mode: 'auto' });
}

export interface AutoPostulateResult {
  autoQueued: number;
  skippedQuota: boolean;
}

export async function runAutoPostulate(userId: string): Promise<AutoPostulateResult> {
  if (await freeApplyBlock(userId)) return { autoQueued: 0, skippedQuota: false };

  const cache = await db.queryOne<{ ranked: string }>(
    'SELECT ranked FROM user_match_cache WHERE userId = $1',
    [userId]
  );
  if (!cache) return { autoQueued: 0, skippedQuota: false };

  const ranked = safeJsonParse<CachedRankedOffer[]>(cache.ranked, []);
  ranked.sort((a, b) => b.score - a.score); // mejores primero, por si la cuota es limitada

  const existingOffers = new Set(
    (await db.query<{ offerId: string }>(
      'SELECT offerId FROM postulations WHERE userId = $1',
      [userId]
    )).rows.map(r => r.offerId)
  );

  const candidates = ranked.filter(r => r.score >= QUALITY_GATE.auto && !existingOffers.has(r.offerId));
  const prefs = await loadAnswerPreferences(userId);
  const plan = (await db.queryOne<{ plan: string | null }>('SELECT plan FROM users WHERE id = $1', [userId]))?.plan;
  const places = candidates.length
    ? (await db.query<{ id: string; title: string; company: string | null; location: string | null; remoteModality: string | null; source: string }>(
        'SELECT id, title, company, location, remoteModality, source FROM offers WHERE id = ANY($1)',
        [candidates.map(c => c.offerId)]
      )).rows
    : [];
  const placeById = new Map(places.map(p => [p.id, p]));
  const autoOffers = candidates.filter(r => {
    const place = placeById.get(r.offerId);
    return place !== undefined && planAllowsPortal(plan, place.source) && offerVerdict(place, prefs) === 'dentro';
  });

  const slots = await reserveQuota(userId, autoOffers.length);
  const skippedQuota = slots < autoOffers.length;

  let autoQueued = 0;
  for (const item of autoOffers.slice(0, slots)) {
    try {
      const id = uuidv4();
      await db.query(`
        INSERT INTO postulations
          (id, userId, offerId, estado, prioridad, source, matchScore, postulationWeight, quotaCharged, createdAt, updatedAt)
        VALUES ($1, $2, $3, 'Preparar postulación', 'Media', 'auto', $4, 1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [id, userId, item.offerId, item.score]);
      // Salary check + queue (puede pasar a 'requiere-autorizacion' si paga bajo rango).
      await placeAutoApplication(id, userId, prefs.sendMode);
      autoQueued++;
    } catch (err) {
      logger.warn('Auto-postulation skipped', { userId, offerId: item.offerId, err: String(err) });
    }
  }

  return { autoQueued, skippedQuota };
}

/**
 * El candidato cambió sus filtros (regiones, palabras, empresas). Lo que FITCV
 * encoló sola y aún no salió se ajusta: lo que quedó fuera vuelve a "pendiente"
 * (y devuelve su cupo); lo que se había retirado por un filtro y ahora calza,
 * vuelve a la cola.
 * Lo que el candidato encoló a mano no se toca: fue su decisión.
 */
export async function syncQueueWithFilters(userId: string): Promise<{ withdrawn: number; requeued: number }> {
  const prefs = await loadAnswerPreferences(userId);
  const rows = (await db.query<{ id: string; applyStatus: string; applyReason: string | null; title: string; company: string | null; location: string | null; remoteModality: string | null }>(`
    SELECT p.id, p.applyStatus, p.applyReason, o.title, o.company, o.location, o.remoteModality
    FROM postulations p JOIN offers o ON o.id = p.offerId
    WHERE p.userId = $1 AND p.source = 'auto'
      AND (p.applyStatus IN ('por-enviar', 'en-cola', 'requiere-autorizacion')
           OR (p.applyStatus = 'pendiente' AND p.applyReason IN ('fuera-de-region', 'excluida-por-filtro')))
  `, [userId])).rows;

  let withdrawn = 0;
  for (const row of rows.filter(r => r.applyStatus !== 'pendiente')) {
    const verdict = offerVerdict(row, prefs);
    if (verdict === 'dentro') continue;
    try {
      await transitionApplication({ postulationId: row.id, userId, to: 'pendiente', reason: verdict === 'excluida' ? 'excluida-por-filtro' : 'fuera-de-region' });
      withdrawn++;
    } catch (err) {
      logger.warn('No se pudo retirar la postulación que quedó fuera de los filtros', { userId, postulationId: row.id, err: String(err) });
    }
  }
  await releaseQuota(userId, withdrawn);

  const back = rows.filter(r => r.applyStatus === 'pendiente' && offerVerdict(r, prefs) === 'dentro');
  const slots = await reserveQuota(userId, back.length);
  let requeued = 0;
  for (const row of back.slice(0, slots)) {
    try {
      await placeAutoApplication(row.id, userId, prefs.sendMode);
      requeued++;
    } catch (err) {
      logger.warn('No se pudo reencolar la postulación que volvió a calzar', { userId, postulationId: row.id, err: String(err) });
    }
  }
  await releaseQuota(userId, slots - requeued);

  return { withdrawn, requeued };
}
