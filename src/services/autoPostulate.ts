/**
 * Auto-postulación basada en caché de matching.
 *
 * Calce alto (≥70%) y calce medio (40-69%) → cola automática, consume cuota.
 * Calce bajo (<40%) → visible en el listado de ofertas para revisión manual.
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

  const autoOffers = ranked.filter(r => r.score >= QUALITY_GATE.auto && !existingOffers.has(r.offerId));

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
