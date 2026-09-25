/**
 * Salud de cada portal: cómo terminan los intentos de envío.
 *
 * Cada vez que la extensión (o el canal correo) reporta un envío queda un
 * evento desde "enviando". De ahí sale, por portal y en los últimos 7 días,
 * cuántos salieron limpios, cuántos necesitaron al candidato, cuántos se
 * bloquearon y cuántos fallaron. La salida limpia es la métrica que ordena la
 * cola y la que pausa un portal que se está portando mal.
 */
import { db } from '../db/client.js';

export type Outcome = 'limpia' | 'asistida' | 'bloqueada' | 'atencion' | 'error';

export const PAUSE_RULE = { days: 7, minAttempts: 20, minCleanRate: 0.5 } as const;
export const CAPTCHA_STREAK = 3;

export function classifyOutcome(e: { toStatus: string; mode: string | null; reason: string | null }): Outcome | null {
  if (e.toStatus === 'enviada') return e.mode === 'manual' ? 'asistida' : 'limpia';
  if (e.toStatus === 'requiere-atencion') return e.reason === 'captcha' || e.reason === 'login' ? 'bloqueada' : 'atencion';
  if (e.toStatus === 'error') return 'error';
  return null; // "enviando" → "en-cola" es una reanudación, no un resultado
}

export interface PortalHealth {
  portal: string;
  attempts: number;
  counts: Record<Outcome, number>;
  cleanRate: number | null;
  paused: boolean;
  /** true si `paused` viene de una decisión del dueño, no del umbral automático. */
  manual: boolean;
  manualReason: string | null;
}

/** Suavizado de Laplace: un portal sin historia parte en 50% y no en 0 ni 100. */
export const cleanScore = (h: Pick<PortalHealth, 'attempts' | 'counts'>): number =>
  (h.counts.limpia + 1) / (h.attempts + 2);

export const isPaused = (h: Pick<PortalHealth, 'attempts' | 'counts'>): boolean =>
  h.attempts >= PAUSE_RULE.minAttempts && h.counts.limpia / h.attempts < PAUSE_RULE.minCleanRate;

// El correo es un canal propio: no se mezcla con el portal donde apareció la oferta.
const PORTAL_SQL = `CASE WHEN p.channel = 'email' THEN 'correo' ELSE o.source END`;

let cache: { at: number; data: PortalHealth[] } | null = null;
const CACHE_MS = 5 * 60 * 1000;

/** Pausas y reactivaciones que el dueño fijó a mano, por nombre de portal. */
export async function getPortalOverrides(): Promise<Map<string, { paused: boolean; reason: string | null }>> {
  const rows = (await db.query<{ portal: string; paused: boolean; reason: string | null }>(
    'SELECT portal, paused, reason FROM portal_overrides'
  )).rows;
  return new Map(rows.map(r => [r.portal, { paused: r.paused, reason: r.reason }]));
}

/** Fija o quita una pausa manual. Invalida la caché para que se vea al toque. */
export async function setPortalOverride(portal: string, paused: boolean, reason: string | null): Promise<void> {
  await db.query(`
    INSERT INTO portal_overrides (portal, paused, reason, updatedAt) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    ON CONFLICT (portal) DO UPDATE SET paused = $2, reason = $3, updatedAt = CURRENT_TIMESTAMP
  `, [portal, paused, reason]);
  cache = null;
}

/** Quita la pausa manual: el portal vuelve a decidirse solo por sus estadísticas. */
export async function clearPortalOverride(portal: string): Promise<void> {
  await db.query('DELETE FROM portal_overrides WHERE portal = $1', [portal]);
  cache = null;
}

export async function getPortalHealth(fresh = false): Promise<PortalHealth[]> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const rows = (await db.query<{ portal: string; toStatus: string; mode: string | null; reason: string | null; n: string }>(`
    SELECT ${PORTAL_SQL} AS portal, e.toStatus, e.mode, e.reason, COUNT(*) AS n
    FROM application_events e
    JOIN postulations p ON p.id = e.postulationId
    JOIN offers o ON o.id = p.offerId
    WHERE e.fromStatus = 'enviando'
      AND e.createdAt > CURRENT_TIMESTAMP - make_interval(days => $1)
    GROUP BY 1, 2, 3, 4
  `, [PAUSE_RULE.days])).rows;

  const byPortal = new Map<string, PortalHealth>();
  for (const row of rows) {
    const outcome = classifyOutcome(row);
    if (!outcome) continue;
    const h = byPortal.get(row.portal) ?? {
      portal: row.portal,
      attempts: 0,
      counts: { limpia: 0, asistida: 0, bloqueada: 0, atencion: 0, error: 0 },
      cleanRate: null,
      paused: false,
      manual: false,
      manualReason: null,
    };
    h.counts[outcome] += Number(row.n);
    h.attempts += Number(row.n);
    byPortal.set(row.portal, h);
  }

  const overrides = await getPortalOverrides();
  // Un portal pausado a mano sin ningún intento aún también debe verse en la tabla.
  for (const portal of overrides.keys()) {
    if (!byPortal.has(portal)) {
      byPortal.set(portal, {
        portal,
        attempts: 0,
        counts: { limpia: 0, asistida: 0, bloqueada: 0, atencion: 0, error: 0 },
        cleanRate: null,
        paused: false,
        manual: false,
        manualReason: null,
      });
    }
  }

  const data = [...byPortal.values()]
    .map(h => {
      const override = overrides.get(h.portal);
      return {
        ...h,
        cleanRate: h.attempts ? h.counts.limpia / h.attempts : null,
        paused: override ? override.paused : isPaused(h),
        manual: override !== undefined,
        manualReason: override?.reason ?? null,
      };
    })
    .sort((a, b) => b.attempts - a.attempts);
  cache = { at: Date.now(), data };
  return data;
}

/**
 * Portales en los que este candidato topó con CAPTCHA en sus últimos 3 intentos
 * de las últimas 24 h: se le pausan hasta que la racha salga de la ventana.
 * ponytail: la pausa dura "hasta que el 3.º CAPTCHA cumpla 24 h", no 24 h exactas desde el último.
 */
export async function captchaPausedPortals(userId: string): Promise<string[]> {
  const rows = (await db.query<{ portal: string }>(`
    SELECT portal FROM (
      SELECT ${PORTAL_SQL} AS portal, e.reason,
             ROW_NUMBER() OVER (PARTITION BY ${PORTAL_SQL} ORDER BY e.createdAt DESC) AS rn
      FROM application_events e
      JOIN postulations p ON p.id = e.postulationId
      JOIN offers o ON o.id = p.offerId
      WHERE e.userId = $1 AND e.fromStatus = 'enviando'
        AND e.createdAt > CURRENT_TIMESTAMP - INTERVAL '24 hours'
    ) t
    WHERE rn <= $2
    GROUP BY portal
    HAVING COUNT(*) = $2 AND bool_and(reason = 'captcha')
  `, [userId, CAPTCHA_STREAK])).rows;
  return rows.map(r => r.portal);
}

/** Lo que la cola necesita: qué portales saltarse y cuánto pesa cada uno. */
export async function queuePolicy(userId: string): Promise<{ skip: string[]; weights: Record<string, number> }> {
  const health = await getPortalHealth();
  const weights = Object.fromEntries(health.map(h => [h.portal, cleanScore(h)]));
  const skip = [...health.filter(h => h.paused).map(h => h.portal), ...(await captchaPausedPortals(userId))];
  return { skip, weights };
}
