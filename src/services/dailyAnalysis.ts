/**
 * Análisis diario de ofertas.
 *
 * A la hora que eligió cada candidato (hora de Chile), FITCV revisa las ofertas
 * vigentes de su perfil, las cuenta por calce alto, medio y bajo, destaca las
 * nuevas desde el análisis anterior y le avisa. Las ofertas a las que ya
 * postuló no se cuentan.
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { loadMatchingProfile } from './candidateProfile.js';
import { logger } from './logger.js';
import { createNotification } from './notifications.js';
import type { MatchTier } from './offerMatching.js';
import { ACTIVE_OFFER, countByTier, type RankedOffer, type TierCounts } from './profileOffers.js';
import { getCachedMatch, recomputeUserMatches } from './matchCache.js';
import { runAutoPostulate } from './autoPostulate.js';

export const ANALYSIS_TIME_ZONE = 'America/Santiago';

/** Fecha y hora locales de Chile para un instante. */
export function localClock(date: Date, timeZone = ANALYSIS_TIME_ZONE): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map(part => [part.type, part.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/**
 * Si al candidato le toca su análisis. Si el servidor estuvo apagado a esa
 * hora, corre apenas pueda durante el mismo día, y nunca dos veces el mismo día.
 */
export const isAnalysisDue = (
  hour: number | null,
  lastRunDate: string | null,
  clock: { date: string; hour: number }
): boolean => hour !== null && clock.hour >= hour && lastRunDate !== clock.date;

export interface DigestOffer {
  id: string;
  title: string;
  company: string;
  source: string;
  score: number;
  tier: MatchTier;
  isNew: boolean;
}

export interface OfferDigest {
  id: string;
  runDate: string;
  total: TierCounts;
  fresh: TierCounts;
  top: DigestOffer[];
  createdAt: string;
}

const sum = (counts: TierCounts) => counts.alto + counts.medio + counts.bajo;
const offers = (n: number, singular: string, plural: string) => (n === 1 ? `1 oferta ${singular}` : `${n} ofertas ${plural}`);

export function digestMessage(total: TierCounts, fresh: TierCounts): { title: string; body: string } {
  const title =
    fresh.alto > 0
      ? `${offers(fresh.alto, 'nueva', 'nuevas')} de calce alto para ti`
      : sum(fresh) > 0
        ? `${offers(sum(fresh), 'nueva', 'nuevas')} para tu perfil`
        : 'Tu análisis diario de ofertas';

  if (sum(total) === 0) {
    return { title, body: 'Hoy no hay ofertas vigentes afines a tu perfil. FITCV sigue revisando los portales cada hora.' };
  }

  const freshText = sum(fresh) > 0
    ? `${sum(fresh) === 1 ? 'Una es nueva' : `${sum(fresh)} son nuevas`} desde tu último análisis.`
    : 'No hay nuevas desde tu último análisis.';

  return {
    title,
    body: `Hoy tienes ${offers(sum(total), 'afín', 'afines')}: ${total.alto} de calce alto, ${total.medio} medio y ${total.bajo} bajo. ${freshText}`,
  };
}

/**
 * Corre el análisis de un candidato y le deja el aviso. Devuelve null si todavía
 * no subió su CV. `scheduled` marca el día como hecho para el análisis programado.
 */
export async function runOfferAnalysis(
  userId: string,
  options: { scheduled?: boolean; now?: Date } = {}
): Promise<OfferDigest | null> {
  const now = options.now ?? new Date();
  const profile = await loadMatchingProfile(userId);
  if (!profile) return null;

  // Lee el matching precalculado: recalcularlo aquí tarda ~50s y botaba la petición.
  let cache = await getCachedMatch(userId);
  if (!cache) {
    await recomputeUserMatches(userId);
    cache = await getCachedMatch(userId);
  }

  const applied = new Set(
    (await db.query<{ offerId: string }>('SELECT offerId FROM postulations WHERE userId = $1', [userId])).rows.map(r => r.offerId)
  );
  const pending = (cache?.ranked ?? []).filter(r => !applied.has(r.offerId));
  const rows = pending.length
    ? (await db.query<{ id: string; title: string; company: string; source: string; createdAt: string }>(
        `SELECT id, title, company, source, createdAt FROM offers WHERE id = ANY($1) AND ${ACTIVE_OFFER}`,
        [pending.map(r => r.offerId)]
      )).rows
    : [];
  const byId = new Map(rows.map(o => [o.id, o]));
  const ranked: RankedOffer[] = pending.flatMap(r => {
    const offer = byId.get(r.offerId);
    return offer ? [{ offer, match: { score: r.score, tier: r.tier } as RankedOffer['match'] }] : [];
  });

  const previous = await db.queryOne<{ createdAt: string }>(
    'SELECT createdAt FROM offer_digests WHERE userId = $1 ORDER BY createdAt DESC LIMIT 1',
    [userId]
  );
  const since = previous ? new Date(previous.createdAt).getTime() : null;
  const isNew = (item: RankedOffer) => since === null || new Date(item.offer.createdAt).getTime() > since;

  const fresh = ranked.filter(isNew);
  const total = countByTier(ranked);
  const freshCounts = countByTier(fresh);

  // Primero las nuevas, cada grupo de la más afín a la menos.
  const top = [...fresh, ...ranked.filter(item => !isNew(item))].slice(0, 5).map(({ offer, match }) => ({
    id: offer.id,
    title: offer.title,
    company: offer.company,
    source: offer.source,
    score: match.score,
    tier: match.tier,
    isNew: isNew({ offer, match }),
  }));

  const clock = localClock(now);
  const digest: OfferDigest = {
    id: uuidv4(),
    runDate: clock.date,
    total,
    fresh: freshCounts,
    top,
    createdAt: now.toISOString(),
  };

  await db.query(
    'INSERT INTO offer_digests (id, userId, runDate, summary, createdAt) VALUES ($1, $2, $3, $4, $5)',
    [digest.id, userId, digest.runDate, JSON.stringify({ total, fresh: freshCounts, top }), digest.createdAt]
  );

  const message = digestMessage(total, freshCounts);
  await createNotification({ userId, kind: 'offer-digest', title: message.title, body: message.body, link: '/offers', data: digest });

  if (options.scheduled) {
    await db.query('UPDATE apply_preferences SET lastAnalysisDate = $1 WHERE userId = $2', [clock.date, userId]);
  }

  // Lanza auto-postulaciones basadas en el matching cacheado.
  // Errores no deben cortar el análisis: el digest ya está guardado.
  runAutoPostulate(userId).then(result => {
    if (result.autoQueued > 0) {
      logger.info('Auto-postulate completed', { userId, ...result });
    }
  }).catch(err => {
    logger.error('Auto-postulate failed', { userId, err: String(err) });
  });

  return digest;
}

/** Corre los análisis que ya tocan. Devuelve cuántos candidatos se revisaron. */
export async function runDueAnalyses(now = new Date()): Promise<number> {
  const clock = localClock(now);
  const due = (await db.query<{ userId: string }>(`
    SELECT userId FROM apply_preferences
    WHERE dailyAnalysisHour IS NOT NULL AND dailyAnalysisHour <= $1
      AND (lastAnalysisDate IS NULL OR lastAnalysisDate <> $2)
  `, [clock.hour, clock.date])).rows;

  let reviewed = 0;
  for (const { userId } of due) {
    try {
      const digest = await runOfferAnalysis(userId, { scheduled: true, now });
      // Sin CV no hay nada que analizar; se marca el día para no reintentar cada minuto.
      if (!digest) {
        await db.query('UPDATE apply_preferences SET lastAnalysisDate = $1 WHERE userId = $2', [clock.date, userId]);
      }
      reviewed += 1;
    } catch (err) {
      logger.error('Daily offer analysis failed', { userId, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return reviewed;
}

let running = false;

/** Revisa cada minuto a quién le toca su análisis. */
export function startDailyAnalysis(intervalMs = 60_000): () => void {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const reviewed = await runDueAnalyses();
      if (reviewed > 0) logger.info('Daily offer analyses finished', { reviewed });
    } catch (err) {
      logger.error('Daily offer analysis scheduler failed', { message: err instanceof Error ? err.message : String(err) });
    } finally {
      running = false;
    }
  };

  // tick nunca rechaza (captura todo), así que se puede descartar su promesa.
  const first = setTimeout(() => void tick(), 10_000);
  const every = setInterval(() => void tick(), intervalMs);
  first.unref();
  every.unref();

  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
