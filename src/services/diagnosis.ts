/**
 * Diagnóstico del candidato: por qué su CV alcanza las ofertas que alcanza.
 *
 * No genera nada ni opina sobre la persona. Compara lo que dice su CV contra lo
 * que piden las ofertas vigentes de su área, y devuelve hechos contables:
 * cuántas ofertas alcanza, qué términos suyos aparecen en ellas, qué piden esas
 * mismas ofertas que su CV no menciona, y qué dice su CV que ahí nadie pide.
 *
 * Todo es determinista y sale de la base: no hay llamadas a la IA. Un "vacío"
 * significa que el CV no lo dice, nunca que el candidato no lo sepa hacer; la
 * diferencia importa y la redacción de la interfaz la respeta.
 */
import { loadMatchingProfile } from './candidateProfile.js';
import { isEntryLevel, offerTopics, profileCovers } from './offerMatching.js';
import { countByTier, rankOffersForProfile, type TierCounts } from './profileOffers.js';

// Ofertas afines sobre las que se cuentan términos. Las más afines primero, así
// que el diagnóstico habla del mercado al que el candidato apunta de verdad.
const SAMPLE_SIZE = 200;

// Un término tiene que repetirse para ser señal y no ruido de una sola oferta.
const MIN_OFFERS = 2;
// Un cuarto de las ofertas: por debajo de eso aparecen temas que la descripción
// menciona de pasada y que el candidato leería como un vacío suyo sin serlo.
const MIN_GAP_SHARE = 0.25;
// Para fortalezas basta con una décima parte: es presencia, no una carencia que
// alguien vaya a corregir a partir de un dato flojo.
const MIN_STRENGTH_SHARE = 0.1;

export interface TopicCount {
  term: string;
  offers: number;
}

export interface Diagnosis {
  /** Ofertas vigentes afines al perfil. */
  matched: number;
  reach: TierCounts;
  /** En su área pero descartadas por poca coincidencia. */
  nearMisses: number;
  /** De esas, cargos de entrada para alguien con años de experiencia. */
  entryLevelDiscarded: number;
  /** Ofertas sobre las que se contaron los términos. */
  analyzed: number;
  /** Términos del CV que aparecen en esas ofertas, del más presente al menos. */
  strengths: TopicCount[];
  /** Lo que esas ofertas piden y el CV no menciona. */
  gaps: TopicCount[];
  /** Lo que el CV menciona y ninguna de esas ofertas pide. */
  unused: string[];
}

/** Devuelve null si el candidato todavía no tiene un CV analizado. */
export async function buildDiagnosis(userId: string): Promise<Diagnosis | null> {
  const profile = await loadMatchingProfile(userId);
  if (!profile) return null;

  const scored = await rankOffersForProfile(profile, undefined, undefined, { all: true });
  const matched = scored.filter(item => item.match.recommended);
  const discarded = scored.filter(item => !item.match.recommended);

  const years = profile.yearsExperience ?? 0;
  const entryLevelDiscarded =
    years >= 5 ? discarded.filter(item => isEntryLevel(item.offer.title ?? '')).length : 0;

  const sample = matched.slice(0, SAMPLE_SIZE);
  const byOffers = (a: TopicCount, b: TopicCount) => b.offers - a.offers || a.term.localeCompare(b.term);
  const floor = (share: number) => Math.max(MIN_OFFERS, Math.ceil(sample.length * share));

  // Fortalezas y peso muerto salen de los aciertos que `scoreOffer` ya calculó
  // al puntuar cada oferta: ahí están también las habilidades duras que solo
  // aparecen en el cuerpo del aviso (SAP, Excel). Mirando solo los títulos se
  // habrían reportado como "nadie las pide", que es falso.
  const present = new Map<string, number>();
  for (const { match } of sample) {
    for (const key of match.hits) present.set(key, (present.get(key) ?? 0) + 1);
  }
  const display = new Map(profile.terms.map(term => [term.key, term.display]));

  // Los vacíos salen del otro lado: lo que piden las ofertas.
  const asked = new Map<string, number>();
  for (const { offer } of sample) {
    for (const topic of offerTopics(offer)) asked.set(topic, (asked.get(topic) ?? 0) + 1);
  }

  return {
    matched: matched.length,
    reach: countByTier(matched),
    nearMisses: discarded.length,
    entryLevelDiscarded,
    analyzed: sample.length,
    strengths: [...present]
      .filter(([, offers]) => offers >= floor(MIN_STRENGTH_SHARE))
      .map(([key, offers]) => ({ term: display.get(key) ?? key, offers }))
      .sort(byOffers)
      .slice(0, 8),
    gaps: [...asked]
      .filter(([term, offers]) => offers >= floor(MIN_GAP_SHARE) && !profileCovers(profile, term))
      .map(([term, offers]) => ({ term, offers }))
      .sort(byOffers)
      .slice(0, 8),
    unused: profile.terms
      .filter(term => !present.has(term.key))
      .map(term => term.display)
      .slice(0, 8),
  };
}
