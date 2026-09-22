/**
 * Ofertas vigentes afines al perfil del candidato, de la más afín a la menos y
 * con su nivel de calce. Lo usan la página de ofertas y el análisis diario.
 */
import { db } from '../db/client.js';
import { likePatterns, scoreOffer, type MatchingProfile, type MatchTier, type OfferMatch } from './offerMatching.js';

// Ofertas candidatas que se puntúan por consulta: las más recientes que
// mencionan algún término del perfil.
const MAX_MATCH_CANDIDATES = 3000;

/** Una oferta vencida ya no recibe postulaciones. */
export const ACTIVE_OFFER = '(validThrough IS NULL OR validThrough > CURRENT_TIMESTAMP)';

export interface RankedOffer {
  offer: any;
  match: OfferMatch;
}

export type TierCounts = Record<MatchTier, number>;

/**
 * `where` y `params` son filtros adicionales del llamador (portal, búsqueda...),
 * con sus parámetros ya numerados desde $1.
 */
export async function rankOffersForProfile(
  profile: MatchingProfile,
  where: string[] = [ACTIVE_OFFER],
  params: unknown[] = [],
  // `all` conserva también las que no se recomiendan: el diagnóstico necesita
  // saber qué se descartó y por qué, no solo lo que quedó.
  options: { all?: boolean } = {}
): Promise<RankedOffer[]> {
  const values = [...params];
  const termFilter = likePatterns(profile).map(pattern => {
    values.push(pattern);
    return `searchText LIKE $${values.length}`;
  });
  if (termFilter.length === 0) return [];

  const clauses = [...where, `(${termFilter.join(' OR ')})`];
  const candidates = (await db.query(`
    SELECT * FROM offers WHERE ${clauses.join(' AND ')}
    ORDER BY publishedAt DESC NULLS LAST, createdAt DESC
    LIMIT ${MAX_MATCH_CANDIDATES}
  `, values)).rows;

  const time = (offer: any) => (offer.publishedAt ? new Date(offer.publishedAt).getTime() : 0);
  return candidates
    .map((offer: any) => ({ offer, match: scoreOffer(offer, profile) }))
    .filter(item => options.all || item.match.recommended)
    .sort((a, b) => b.match.score - a.match.score || time(b.offer) - time(a.offer));
}

export const countByTier = (ranked: RankedOffer[]): TierCounts =>
  ranked.reduce<TierCounts>(
    (acc, { match }) => {
      acc[match.tier] += 1;
      return acc;
    },
    { alto: 0, medio: 0, bajo: 0 }
  );
