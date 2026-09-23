/**
 * Caché del matching por usuario.
 *
 * Puntuar todas las ofertas contra el perfil (rankOffersForProfile) es lo caro:
 * ~50s con decenas de miles de ofertas, y bloquea el hilo. Aquí eso se hace UNA
 * vez en background —al cambiar el perfil o tras cada sync— y se guarda el
 * resultado, para que las páginas de ofertas y diagnóstico sean un SELECT.
 */
import { db } from '../db/client.js';
import { logger } from './logger.js';
import { loadMatchingProfile } from './candidateProfile.js';
import { countByTier, rankOffersForProfile, type TierCounts } from './profileOffers.js';
import { buildDiagnosisFromScored, type Diagnosis } from './diagnosis.js';
import type { MatchTier } from './offerMatching.js';

export interface CachedRankedOffer {
  offerId: string;
  score: number;
  tier: MatchTier;
  reasons: string[];
}

export interface CachedMatch {
  ranked: CachedRankedOffer[];
  tierCounts: TierCounts;
  diagnosis: Diagnosis | null;
}

/** Recalcula y guarda el matching de un usuario. Nunca lanza. */
export async function recomputeUserMatches(userId: string): Promise<void> {
  try {
    const profile = await loadMatchingProfile(userId);
    if (!profile) {
      await db.query('DELETE FROM user_match_cache WHERE userId = $1', [userId]);
      return;
    }

    const scored = await rankOffersForProfile(profile, undefined, undefined, { all: true });
    const recommended = scored.filter(item => item.match.recommended);
    const ranked: CachedRankedOffer[] = recommended.map(({ offer, match }) => ({
      offerId: offer.id,
      score: match.score,
      tier: match.tier,
      reasons: match.reasons,
    }));

    await db.query(
      `INSERT INTO user_match_cache (userId, ranked, tierCounts, diagnosis, computedAt)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT(userId) DO UPDATE SET
         ranked = excluded.ranked,
         tierCounts = excluded.tierCounts,
         diagnosis = excluded.diagnosis,
         computedAt = CURRENT_TIMESTAMP`,
      [
        userId,
        JSON.stringify(ranked),
        JSON.stringify(countByTier(recommended)),
        JSON.stringify(buildDiagnosisFromScored(profile, scored)),
      ]
    );
    logger.info('Match cache recomputed', { userId, ranked: ranked.length });
  } catch (err) {
    logger.error('Match cache recompute failed', { userId, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function getCachedMatch(userId: string): Promise<CachedMatch | null> {
  const row = await db.queryOne<{ ranked: string; tierCounts: string; diagnosis: string | null }>(
    'SELECT ranked, tierCounts, diagnosis FROM user_match_cache WHERE userId = $1 LIMIT 1',
    [userId]
  );
  if (!row) return null;
  return {
    ranked: JSON.parse(row.ranked),
    tierCounts: JSON.parse(row.tierCounts),
    diagnosis: row.diagnosis ? JSON.parse(row.diagnosis) : null,
  };
}

// No solapar recálculos masivos: el sync los dispara cada hora.
let recomputingAll = false;

/**
 * Recalcula a todos los usuarios con perfil, secuencial para no saturar la CPU.
 * ponytail: O(usuarios × ofertas) por sync; sirve para el piloto (pocas cuentas).
 * A miles de usuarios hay que hacerlo incremental (puntuar solo las ofertas
 * nuevas contra cada perfil) y en un worker aparte — es la Fase 2.
 */
export async function recomputeAllUsers(): Promise<void> {
  if (recomputingAll) return;
  recomputingAll = true;
  try {
    const rows = (await db.query<{ userId: string }>('SELECT userId FROM candidate_profiles')).rows;
    for (const { userId } of rows) await recomputeUserMatches(userId);
    if (rows.length) logger.info('Match cache recomputed for all users', { users: rows.length });
  } catch (err) {
    logger.error('Bulk match recompute failed', { message: err instanceof Error ? err.message : String(err) });
  } finally {
    recomputingAll = false;
  }
}
