// Nivel de calce de una oferta con el perfil, como lo devuelve la API.
export type MatchTier = 'alto' | 'medio' | 'bajo';

export type TierCounts = Record<MatchTier, number>;

export const MATCH_TIERS: MatchTier[] = ['alto', 'medio', 'bajo'];

export const MATCH_TIER_LABELS: Record<MatchTier, string> = {
  alto: 'Calce alto',
  medio: 'Calce medio',
  bajo: 'Calce bajo',
};

export const MATCH_TIER_STYLES: Record<MatchTier, string> = {
  alto: 'bg-green-100 text-green-800',
  medio: 'bg-amber-100 text-amber-800',
  bajo: 'bg-gray-100 text-gray-700',
};
