/**
 * Auto-postulación basada en caché de matching.
 *
 * Crea postulaciones con source='auto' (≥70% match, consume cuota) y con
 * source='suggested' (40-69%, sin consumo de cuota, requiere aprobación manual).
 * Respeta runCap, dailyCap y cuota mensual/vitalicia del plan del usuario.
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { logger } from './logger.js';
import { reserveQuota, QUALITY_GATE } from './planQuota.js';
import { queueApplication } from './applicationQueue.js';
import { safeJsonParse } from '../utils/safeJson.js';
import type { CachedRankedOffer } from './matchCache.js';

export interface AutoPostulateResult {
  autoQueued: number;
  suggested: number;
  skippedQuota: boolean;
}

export async function runAutoPostulate(userId: string): Promise<AutoPostulateResult> {
  const cache = await db.queryOne<{ ranked: string }>(
    'SELECT ranked FROM user_match_cache WHERE userId = $1',
    [userId]
  );
  if (!cache) return { autoQueued: 0, suggested: 0, skippedQuota: false };

  const ranked = safeJsonParse<CachedRankedOffer[]>(cache.ranked, []);

  const existingOffers = new Set(
    (await db.query<{ offerId: string }>(
      'SELECT offerId FROM postulations WHERE userId = $1',
      [userId]
    )).rows.map(r => r.offerId)
  );

  const autoOffers = ranked.filter(r => r.score >= QUALITY_GATE.auto && !existingOffers.has(r.offerId));
  const suggestOffers = ranked.filter(r =>
    r.score >= QUALITY_GATE.suggest && r.score < QUALITY_GATE.auto && !existingOffers.has(r.offerId)
  );

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

  let suggested = 0;
  for (const item of suggestOffers) {
    try {
      const id = uuidv4();
      await db.query(`
        INSERT INTO postulations
          (id, userId, offerId, estado, prioridad, source, matchScore, postulationWeight, createdAt, updatedAt)
        VALUES ($1, $2, $3, 'Por revisar', 'Media', 'suggested', $4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [id, userId, item.offerId, item.score]);
      suggested++;
    } catch (err) {
      logger.warn('Suggested postulation skipped', { userId, offerId: item.offerId, err: String(err) });
    }
  }

  return { autoQueued, suggested, skippedQuota };
}
