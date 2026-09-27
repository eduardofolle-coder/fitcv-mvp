/**
 * Aprender de los descartes.
 *
 * Cuando el candidato descarta varias veces lo mismo, FITCV le propone el
 * filtro ("¿Excluir siempre Antofagasta?"). Nunca lo aplica solo: el candidato
 * acepta o rechaza, y lo rechazado no se vuelve a sugerir.
 *
 * - ubicacion: 3 descartes en la misma región → excluir la región.
 * - empresa: 2 descartes de la misma empresa → bloquearla.
 * - cargo: una palabra en 3 cargos descartados y en ninguno que haya dejado
 *   salir → excluir la palabra. Así "logística", que está en todo lo suyo, no se
 *   propone nunca.
 * - renta: 2 descartes por renta en ofertas que dicen cuánto pagan → subir la
 *   renta mínima sobre lo que pagaba la mejor de ellas. No excluye: las que
 *   paguen menos piden autorización antes de salir.
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { AppError } from '../middleware/errorHandler.js';
import { syncQueueWithFilters } from './autoPostulate.js';
import { formatClp } from './fieldClassifier.js';
import { createNotification } from './notifications.js';
import { searchable } from './offerMatching.js';
import { hasTerm, regionName, regionOf, REGIONS, type RegionCode } from './regions.js';
import { loadAnswerPreferences, updateAnswerPreferences, type AnswerPreferences } from './savedAnswers.js';

export type SuggestionKind = 'region' | 'empresa' | 'palabra' | 'renta';

const THRESHOLD: Record<SuggestionKind, number> = { region: 3, empresa: 2, palabra: 3, renta: 2 };

// Palabras que no dicen nada del cargo.
const STOPWORDS = new Set(['para', 'con', 'del', 'las', 'los', 'una', 'por', 'sus', 'que', 'area', 'zona', 'chile', 'santiago']);

const titleWords = (title: string) =>
  new Set(searchable(title).split(' ').filter(w => w.length >= 4 && !/^\d+$/.test(w) && !STOPWORDS.has(w)));

const countBy = <T>(items: T[]) => {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
};

// La renta sugerida sube de a $50.000, sobre lo que pagaba la mejor oferta descartada.
const STEP = 50_000;

/** Regiones donde FITCV sigue postulando: todas si no eligió ninguna. */
const activeRegions = (prefs: AnswerPreferences): RegionCode[] =>
  prefs.workRegions?.length ? prefs.workRegions : REGIONS.map(r => r.code);

/** Lo que los descartes del candidato sugieren y aún no tiene como filtro. */
export async function detectSuggestions(userId: string): Promise<Array<{ kind: SuggestionKind; value: string; evidence: number }>> {
  const prefs = await loadAnswerPreferences(userId);
  const discarded = (await db.query<{ detail: string; title: string; company: string | null; location: string | null; salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null }>(`
    SELECT DISTINCT ON (e.postulationId) e.detail, o.title, o.company, o.location, o.salaryMin, o.salaryMax, o.salaryCurrency
    FROM application_events e
    JOIN postulations p ON p.id = e.postulationId
    JOIN offers o ON o.id = p.offerId
    WHERE e.userId = $1 AND e.reason = 'descartada'
    ORDER BY e.postulationId, e.createdAt DESC
  `, [userId])).rows;

  const found: Array<{ kind: SuggestionKind; value: string; evidence: number }> = [];

  const regions = countBy(discarded.filter(d => d.detail === 'ubicacion').map(d => regionOf(d.location)).filter((r): r is RegionCode => r !== null));
  for (const [region, n] of regions) {
    const active = activeRegions(prefs);
    // Si es la única región donde busca, excluirla lo dejaría sin nada: no se sugiere.
    if (n >= THRESHOLD.region && active.includes(region) && active.length > 1) found.push({ kind: 'region', value: region, evidence: n });
  }

  const companies = countBy(discarded.filter(d => d.detail === 'empresa' && d.company).map(d => d.company!.trim()));
  for (const [company, n] of companies) {
    if (n >= THRESHOLD.empresa && !hasTerm(company, prefs.blockedCompanies)) found.push({ kind: 'empresa', value: company, evidence: n });
  }

  const cargo = discarded.filter(d => d.detail === 'cargo');
  if (cargo.length >= THRESHOLD.palabra) {
    const kept = (await db.query<{ title: string }>(`
      SELECT o.title FROM postulations p JOIN offers o ON o.id = p.offerId
      WHERE p.userId = $1 AND p.applyStatus IN ('por-enviar', 'en-cola', 'enviando', 'enviada')
    `, [userId])).rows;
    const keptWords = new Set(kept.flatMap(k => [...titleWords(k.title)]));
    const words = countBy(cargo.flatMap(d => [...titleWords(d.title)]));
    for (const [word, n] of words) {
      if (n >= THRESHOLD.palabra && !keptWords.has(word) && !hasTerm(word, prefs.excludedWords)) found.push({ kind: 'palabra', value: word, evidence: n });
    }
  }

  const paid = discarded
    .filter(d => d.detail === 'renta' && (d.salaryCurrency ?? 'CLP') === 'CLP')
    .map(d => Number(d.salaryMax ?? d.salaryMin))
    .filter(n => Number.isFinite(n) && n > 0);
  if (paid.length >= THRESHOLD.renta) {
    const proposed = (Math.floor(Math.max(...paid) / STEP) + 1) * STEP;
    // El monto cambia con cada descarte: una renta rechazada (o aún sin responder) no se vuelve a proponer.
    const answeredNo = await db.queryOne(
      "SELECT id FROM filter_suggestions WHERE userId = $1 AND kind = 'renta' AND status IN ('rechazada', 'pendiente')",
      [userId]
    );
    if (!answeredNo && (prefs.salaryMin ?? 0) < proposed) found.push({ kind: 'renta', value: String(proposed), evidence: paid.length });
  }
  return found;
}

const describe = (kind: SuggestionKind, value: string, evidence: number) =>
  kind === 'region'
    ? `Descartaste ${evidence} ofertas en ${regionName(value)} porque quedan lejos. ¿Dejamos de postular ahí?`
    : kind === 'empresa'
      ? `Descartaste ${evidence} ofertas de ${value}. ¿Bloqueamos esa empresa?`
      : kind === 'palabra'
        ? `Descartaste ${evidence} cargos con la palabra "${value}". ¿La excluimos?`
        : `Descartaste ${evidence} ofertas por la renta. ¿Subimos tu renta mínima a ${formatClp(Number(value))}? Las que paguen menos te pedirán autorización antes de enviarse.`;

/** Guarda y avisa las sugerencias nuevas. Lo ya sugerido (aceptado o rechazado) no se repite. */
export async function refreshSuggestions(userId: string): Promise<number> {
  let created = 0;
  for (const s of await detectSuggestions(userId)) {
    const inserted = await db.queryOne<{ id: string }>(`
      INSERT INTO filter_suggestions (id, userId, kind, value, evidence) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (userId, kind, value) DO NOTHING RETURNING id
    `, [uuidv4(), userId, s.kind, s.value, s.evidence]);
    if (!inserted) continue;
    created++;
    await createNotification({ userId, kind: 'sugerencia-filtro', title: 'FITCV aprendió de tus descartes', body: describe(s.kind, s.value, s.evidence), link: '/por-enviar' });
  }
  return created;
}

export async function listSuggestions(userId: string) {
  const rows = (await db.query<{ id: string; kind: SuggestionKind; value: string; evidence: number }>(
    `SELECT id, kind, value, evidence FROM filter_suggestions WHERE userId = $1 AND status = 'pendiente' ORDER BY createdAt ASC`,
    [userId]
  )).rows;
  return rows.map(r => ({ id: r.id, kind: r.kind, value: r.value, text: describe(r.kind, r.value, Number(r.evidence)) }));
}

/** El candidato acepta o rechaza. Aceptar aplica el filtro y ajusta la cola al tiro. */
export async function answerSuggestion(userId: string, id: string, accept: boolean) {
  const s = await db.queryOne<{ kind: SuggestionKind; value: string }>(
    `SELECT kind, value FROM filter_suggestions WHERE id = $1 AND userId = $2 AND status = 'pendiente'`,
    [id, userId]
  );
  if (!s) throw new AppError(404, 'Suggestion not found');

  let queue = null;
  if (accept) {
    const prefs = await loadAnswerPreferences(userId);
    const change =
      s.kind === 'region'
        ? { workRegions: activeRegions(prefs).filter(r => r !== s.value) }
        : s.kind === 'empresa'
          ? { blockedCompanies: [...(prefs.blockedCompanies ?? []), s.value] }
          : s.kind === 'palabra'
            ? { excludedWords: [...(prefs.excludedWords ?? []), s.value] }
            : { salaryMin: Number(s.value), salaryMax: Math.max(prefs.salaryMax ?? 0, Number(s.value)) };
    await updateAnswerPreferences(userId, change);
    queue = await syncQueueWithFilters(userId);
  }
  await db.query(`UPDATE filter_suggestions SET status = $1 WHERE id = $2`, [accept ? 'aceptada' : 'rechazada', id]);
  return { queue };
}
