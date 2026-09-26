/**
 * Auto-postulación basada en caché de matching.
 *
 * Calce alto (≥70%) y calce medio (40-69%) → cola automática, consume cuota.
 * Calce bajo (<40%) → visible en el listado de ofertas para revisión manual.
 * Solo se postula sola donde el candidato acepta trabajar: una oferta fuera de
 * sus regiones, o que no dice dónde es, queda en el listado para que decida él.
 * Respeta runCap, dailyCap y cuota mensual/vitalicia del plan del usuario.
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { logger } from './logger.js';
import { reserveQuota, releaseQuota, QUALITY_GATE } from './planQuota.js';
import { queueApplication, transitionApplication } from './applicationQueue.js';
import { loadAnswerPreferences } from './savedAnswers.js';
import { regionVerdict } from './regions.js';
import { safeJsonParse } from '../utils/safeJson.js';
import type { CachedRankedOffer } from './matchCache.js';

export interface AutoPostulateResult {
  autoQueued: number;
  skippedQuota: boolean;
}

export async function runAutoPostulate(userId: string): Promise<AutoPostulateResult> {
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
  const places = candidates.length
    ? (await db.query<{ id: string; location: string | null; remoteModality: string | null }>(
        'SELECT id, location, remoteModality FROM offers WHERE id = ANY($1)',
        [candidates.map(c => c.offerId)]
      )).rows
    : [];
  const placeById = new Map(places.map(p => [p.id, p]));
  const autoOffers = candidates.filter(r => {
    const place = placeById.get(r.offerId);
    return place !== undefined && regionVerdict(place, prefs) === 'dentro';
  });

  const slots = await reserveQuota(userId, autoOffers.length);
  const skippedQuota = slots < autoOffers.length;

  let autoQueued = 0;
  for (const item of autoOffers.slice(0, slots)) {
    try {
      const id = uuidv4();
      await db.query(`
        INSERT INTO postulations
          (id, userId, offerId, estado, prioridad, source, matchScore, postulationWeight, createdAt, updatedAt)
        VALUES ($1, $2, $3, 'Preparar postulación', 'Media', 'auto', $4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [id, userId, item.offerId, item.score]);
      // Salary check + queue (puede pasar a 'requiere-autorizacion' si paga bajo rango).
      await queueApplication(id, userId);
      autoQueued++;
    } catch (err) {
      logger.warn('Auto-postulation skipped', { userId, offerId: item.offerId, err: String(err) });
    }
  }

  return { autoQueued, skippedQuota };
}

/**
 * El candidato cambió dónde acepta trabajar. Lo que FITCV encoló sola y aún no
 * salió se ajusta: lo que quedó fuera vuelve a "pendiente" (y devuelve su
 * cupo); lo que se había retirado por región y ahora calza, vuelve a la cola.
 * Lo que el candidato encoló a mano no se toca: fue su decisión.
 */
export async function syncQueueWithRegions(userId: string): Promise<{ withdrawn: number; requeued: number }> {
  const prefs = await loadAnswerPreferences(userId);
  const rows = (await db.query<{ id: string; applyStatus: string; applyReason: string | null; location: string | null; remoteModality: string | null }>(`
    SELECT p.id, p.applyStatus, p.applyReason, o.location, o.remoteModality
    FROM postulations p JOIN offers o ON o.id = p.offerId
    WHERE p.userId = $1 AND p.source = 'auto'
      AND (p.applyStatus IN ('en-cola', 'requiere-autorizacion')
           OR (p.applyStatus = 'pendiente' AND p.applyReason = 'fuera-de-region'))
  `, [userId])).rows;

  let withdrawn = 0;
  for (const row of rows.filter(r => r.applyStatus !== 'pendiente' && regionVerdict(r, prefs) !== 'dentro')) {
    try {
      await transitionApplication({ postulationId: row.id, userId, to: 'pendiente', reason: 'fuera-de-region' });
      withdrawn++;
    } catch (err) {
      logger.warn('No se pudo retirar la postulación fuera de región', { userId, postulationId: row.id, err: String(err) });
    }
  }
  await releaseQuota(userId, withdrawn);

  const back = rows.filter(r => r.applyStatus === 'pendiente' && regionVerdict(r, prefs) === 'dentro');
  const slots = await reserveQuota(userId, back.length);
  let requeued = 0;
  for (const row of back.slice(0, slots)) {
    try {
      await queueApplication(row.id, userId);
      requeued++;
    } catch (err) {
      logger.warn('No se pudo reencolar la postulación que volvió a calzar', { userId, postulationId: row.id, err: String(err) });
    }
  }
  await releaseQuota(userId, slots - requeued);

  return { withdrawn, requeued };
}
