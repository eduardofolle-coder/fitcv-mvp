/**
 * Guarda ofertas de fuentes externas y las mantiene al día.
 *
 * Cada fuente solo sabe leer y normalizar; aquí se guarda. La misma oferta
 * vuelve en cada pasada, así que se actualiza en vez de duplicarse.
 *
 * Con los portales se lee despacio y solo lo permitido: se respeta robots.txt,
 * se espera entre páginas, se traen solo ofertas nuevas y, si un portal
 * bloquea, se deja de leerlo en esa pasada.
 */
import { db } from '../db/client.js';
import { logger } from './logger.js';
import {
  fetchGetOnBoardCategoryPage,
  GETONBRD_SOURCE,
  listGetOnBoardCategories,
  mapGetOnBoardJob,
  type ExternalOffer,
} from './sources/getOnBoard.js';
import {
  findJobPosting,
  JOB_POSTING_PORTALS,
  looksBlocked,
  mapJobPosting,
  parseSitemap,
  type JobPostingPortal,
  type SitemapEntry,
} from './sources/jobPosting.js';
import { isAllowed, parseRobots, type RobotsRules } from './sources/robots.js';
import { extractOfferLinks, keywordsFromTerms, LISTING_PORTALS, type ListingPortal } from './sources/listingPortals.js';
import { loadAllMatchingProfiles } from './candidateProfile.js';
import { offerSearchColumns, slugPriority, type ProfileTerm } from './offerMatching.js';

export const CRAWLER_NAME = 'FITCV-OfferSync';
const USER_AGENT = `Mozilla/5.0 (compatible; ${CRAWLER_NAME}/0.2; +https://github.com/eduardofolle-coder/fitcv-mvp)`;
const SITEMAP_TIMEOUT_MS = 90_000;

export async function upsertOffers(offers: ExternalOffer[]): Promise<number> {
  for (const o of offers) {
    const search = offerSearchColumns(o);
    await db.query(`
      INSERT INTO offers (
        id, title, company, level, salaryMin, salaryMax, salaryCurrency, location, description,
        requirements, source, url, externalId, applyUrl, country, remoteModality, publishedAt,
        validThrough, searchTitle, searchText, lastSeenAt, createdAt
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        company = EXCLUDED.company,
        salaryMin = EXCLUDED.salaryMin,
        salaryMax = EXCLUDED.salaryMax,
        salaryCurrency = EXCLUDED.salaryCurrency,
        location = COALESCE(EXCLUDED.location, offers.location),
        description = CASE WHEN EXCLUDED.description <> '' THEN EXCLUDED.description ELSE offers.description END,
        url = EXCLUDED.url,
        applyUrl = EXCLUDED.applyUrl,
        remoteModality = COALESCE(EXCLUDED.remoteModality, offers.remoteModality),
        publishedAt = COALESCE(EXCLUDED.publishedAt, offers.publishedAt),
        validThrough = COALESCE(EXCLUDED.validThrough, offers.validThrough),
        searchTitle = EXCLUDED.searchTitle,
        searchText = CASE WHEN EXCLUDED.description <> '' THEN EXCLUDED.searchText ELSE offers.searchText END,
        lastSeenAt = CURRENT_TIMESTAMP
    `, [
      o.id,
      o.title,
      o.company,
      o.level,
      o.salaryMin,
      o.salaryMax,
      o.salaryCurrency,
      o.location,
      o.description,
      JSON.stringify(o.requirements),
      o.source,
      o.url,
      o.externalId,
      o.applyUrl,
      o.country,
      o.remoteModality,
      o.publishedAt,
      o.validThrough ?? null,
      search.searchTitle,
      search.searchText,
    ]);
  }
  return offers.length;
}

/** Completa las columnas de búsqueda de ofertas guardadas antes de que existieran. */
export async function backfillOfferSearch(): Promise<number> {
  const rows = (await db.query<{ id: string; title: string | null; company: string | null; description: string | null }>(
    'SELECT id, title, company, description FROM offers WHERE searchText IS NULL LIMIT 20000'
  )).rows;

  for (const row of rows) {
    const search = offerSearchColumns(row);
    await db.query('UPDATE offers SET searchTitle = $1, searchText = $2 WHERE id = $3', [
      search.searchTitle,
      search.searchText,
      row.id,
    ]);
  }
  return rows.length;
}

export interface SyncOptions {
  countryCode?: string;
  perPage?: number;
  maxPagesPerCategory?: number;
  delayMs?: number;
  fetchImpl?: typeof fetch;
}

export interface SyncReport {
  source: string;
  categories: number;
  fetched: number;
  saved: number;
  skipped: number;
  errors: string[];
  blocked?: boolean;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Recorre las categorías de Get on Board para un país, sin apurar a la API. */
export async function syncGetOnBoard(options: SyncOptions = {}): Promise<SyncReport> {
  const { countryCode = 'CL', perPage = 50, maxPagesPerCategory = 10, delayMs = 1000, fetchImpl = fetch } = options;
  const report: SyncReport = { source: GETONBRD_SOURCE, categories: 0, fetched: 0, saved: 0, skipped: 0, errors: [] };

  const categories = await listGetOnBoardCategories(fetchImpl);
  report.categories = categories.length;

  for (const category of categories) {
    for (let page = 1; page <= maxPagesPerCategory; page++) {
      let lastPage = true;
      try {
        const { jobs, totalPages } = await fetchGetOnBoardCategoryPage(category, countryCode, page, perPage, fetchImpl);
        const offers = jobs
          .map(job => mapGetOnBoardJob(job, countryCode))
          .filter((offer): offer is ExternalOffer => offer !== null);

        report.fetched += jobs.length;
        report.skipped += jobs.length - offers.length;
        report.saved += await upsertOffers(offers);
        lastPage = page >= totalPages;
      } catch (err) {
        report.errors.push(`${category} p${page}: ${err instanceof Error ? err.message : String(err)}`);
      }

      await sleep(delayMs);
      if (lastPage) break;
    }
  }

  return report;
}

async function fetchText(
  url: string,
  encoding: string,
  fetchImpl: typeof fetch,
  timeoutMs = 20_000
): Promise<{ status: number; body: string }> {
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const buffer = await res.arrayBuffer();
  return { status: res.status, body: new TextDecoder(encoding).decode(buffer) };
}

export interface PortalSyncOptions {
  maxNew?: number;
  delayMs?: number;
  maxChildSitemaps?: number;
  fetchImpl?: typeof fetch;
  now?: Date;
  /** Áreas que buscan los candidatos: sus ofertas se leen primero. */
  priorityTerms?: ProfileTerm[];
}

/** Lee las ofertas nuevas de un portal a partir de su sitemap y sus datos JobPosting. */
export async function syncJobPostingPortal(
  portal: JobPostingPortal,
  options: PortalSyncOptions = {}
): Promise<SyncReport> {
  const { maxNew = 100, delayMs = 1500, maxChildSitemaps = 3, fetchImpl = fetch, now = new Date(), priorityTerms = [] } = options;
  const report: SyncReport = { source: portal.source, categories: 0, fetched: 0, saved: 0, skipped: 0, errors: [] };
  const origin = new URL(portal.sitemap).origin;

  let rules: RobotsRules = { allow: [], disallow: [] };
  const robots = await fetchText(`${origin}/robots.txt`, 'utf-8', fetchImpl);
  if (looksBlocked(robots.status, robots.body)) {
    report.blocked = true;
    report.errors.push(`robots.txt respondió ${robots.status}: el portal no admite lectura automática.`);
    return report;
  }
  if (robots.status === 200) rules = parseRobots(robots.body, CRAWLER_NAME);
  // Si el sitio pide más pausa entre páginas que la nuestra, manda el sitio.
  const pause = Math.max(delayMs, (rules.crawlDelay ?? 0) * 1000);

  if (!isAllowed(rules, new URL(portal.sitemap).pathname)) {
    report.errors.push('robots.txt no permite leer el sitemap.');
    return report;
  }

  // Los sitemaps pesan varios MB y algunos servidores son lentos: más margen.
  const sitemap = await fetchText(portal.sitemap, 'utf-8', fetchImpl, SITEMAP_TIMEOUT_MS);
  if (looksBlocked(sitemap.status, sitemap.body) || sitemap.status !== 200) {
    report.blocked = looksBlocked(sitemap.status, sitemap.body);
    report.errors.push(`El sitemap respondió ${sitemap.status}.`);
    return report;
  }

  const index = parseSitemap(sitemap.body);
  let urls = index.urls;
  for (const child of index.sitemaps.slice(0, maxChildSitemaps)) {
    await sleep(pause);
    const response = await fetchText(child, 'utf-8', fetchImpl, SITEMAP_TIMEOUT_MS);
    if (response.status === 200) urls = urls.concat(parseSitemap(response.body).urls);
  }

  const candidates = urls
    .map(entry => ({ entry, match: entry.loc.match(portal.offerUrl) }))
    .filter((c): c is { entry: SitemapEntry; match: RegExpMatchArray } => {
      if (!c.match) return false;
      const url = new URL(c.entry.loc);
      return isAllowed(rules, `${url.pathname}${url.search}`);
    })
    .map(c => ({ ...c, priority: priorityTerms.length > 0 ? slugPriority(c.entry.loc, priorityTerms) : 0 }))
    // Primero las que nombran las áreas de los candidatos; entre iguales, lo más
    // reciente, porque una oferta vieja probablemente ya cerró.
    .sort((a, b) => b.priority - a.priority || (b.entry.lastmod ?? '').localeCompare(a.entry.lastmod ?? ''));

  const known = new Set(
    (await db.query<{ externalId: string }>('SELECT externalId FROM offers WHERE source = $1', [portal.source])).rows.map(
      r => r.externalId
    )
  );
  const fresh = candidates.filter(c => !known.has(c.match[1])).slice(0, maxNew);

  for (const { entry, match } of fresh) {
    await sleep(pause);
    try {
      const page = await fetchText(entry.loc, portal.encoding, fetchImpl);
      report.fetched += 1;

      if (looksBlocked(page.status, page.body)) {
        report.blocked = true;
        report.errors.push(`El portal respondió ${page.status}; se detiene la lectura en esta pasada.`);
        break;
      }

      const posting = page.status === 200 ? findJobPosting(page.body) : null;
      const offer = posting ? mapJobPosting(posting, portal, entry.loc, match[1]) : null;

      // Una oferta vencida no sirve para postular: no se guarda.
      if (!offer || (offer.validThrough && new Date(offer.validThrough) < now)) {
        report.skipped += 1;
        continue;
      }

      report.saved += await upsertOffers([offer]);
    } catch (err) {
      report.errors.push(`${entry.loc}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return report;
}

export interface ListingSyncOptions extends PortalSyncOptions {
  pagesPerKeyword?: number;
  maxKeywords?: number;
}

/**
 * Lee un portal sin sitemap: busca en sus listados las áreas de los candidatos
 * y guarda las ofertas nuevas que encuentra.
 */
export async function syncListingPortal(portal: ListingPortal, options: ListingSyncOptions = {}): Promise<SyncReport> {
  const {
    maxNew = 60,
    delayMs = 2000,
    fetchImpl = fetch,
    now = new Date(),
    priorityTerms = [],
    pagesPerKeyword = 2,
    maxKeywords = 6,
  } = options;
  const report: SyncReport = { source: portal.source, categories: 0, fetched: 0, saved: 0, skipped: 0, errors: [] };

  const robots = await fetchText(`${portal.origin}/robots.txt`, 'utf-8', fetchImpl);
  if (looksBlocked(robots.status, robots.body)) {
    report.blocked = true;
    report.errors.push(`robots.txt respondió ${robots.status}: el portal no admite lectura automática.`);
    return report;
  }
  const rules: RobotsRules = robots.status === 200 ? parseRobots(robots.body, CRAWLER_NAME) : { allow: [], disallow: [] };
  const pause = Math.max(delayMs, (rules.crawlDelay ?? 0) * 1000);

  const keywords: Array<string | null> = keywordsFromTerms(priorityTerms, maxKeywords);
  if (keywords.length === 0) keywords.push(null);

  // Enlaces en orden de prioridad: primero los del área con más peso en los perfiles.
  const links = new Map<string, string>();
  let stopped = false;

  for (const keyword of keywords) {
    for (let page = 1; page <= pagesPerKeyword && !stopped; page++) {
      const listing = portal.listingUrl(keyword, page);
      if (!listing) break;
      const listingPath = new URL(listing);
      if (!isAllowed(rules, `${listingPath.pathname}${listingPath.search}`)) break;

      await sleep(pause);
      const res = await fetchText(listing, portal.encoding, fetchImpl);
      if (looksBlocked(res.status, res.body)) {
        report.blocked = true;
        report.errors.push(`El listado respondió ${res.status}; se detiene la lectura en esta pasada.`);
        stopped = true;
        break;
      }
      if (res.status !== 200) break;

      report.categories += 1;
      const found = extractOfferLinks(res.body, portal);
      for (const link of found) {
        if (!links.has(link.externalId)) links.set(link.externalId, link.url);
      }
      if (found.length === 0) break;
    }
    if (stopped) break;
  }

  const known = new Set(
    (await db.query<{ externalId: string }>('SELECT externalId FROM offers WHERE source = $1', [portal.source])).rows.map(
      r => r.externalId
    )
  );
  const fresh = [...links].filter(([externalId]) => !known.has(externalId)).slice(0, maxNew);

  for (const [externalId, url] of fresh) {
    if (stopped) break;
    if (!isAllowed(rules, new URL(url).pathname)) {
      report.skipped += 1;
      continue;
    }

    await sleep(pause);
    try {
      const page = await fetchText(url, portal.encoding, fetchImpl);
      report.fetched += 1;

      if (looksBlocked(page.status, page.body)) {
        report.blocked = true;
        report.errors.push(`El portal respondió ${page.status}; se detiene la lectura en esta pasada.`);
        break;
      }

      const offer = page.status === 200 ? portal.parseOffer(page.body, url, externalId) : null;
      if (!offer || (offer.validThrough && new Date(offer.validThrough) < now)) {
        report.skipped += 1;
        continue;
      }

      report.saved += await upsertOffers([offer]);
    } catch (err) {
      report.errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return report;
}

/** Una pasada por todas las fuentes, de a una. Si una falla, siguen las demás. */
export async function syncAllSources(): Promise<SyncReport[]> {
  const reports: SyncReport[] = [];

  try {
    reports.push(await syncGetOnBoard());
  } catch (err) {
    reports.push({ source: GETONBRD_SOURCE, categories: 0, fetched: 0, saved: 0, skipped: 0, errors: [String(err)] });
  }

  // Las áreas principales de cada candidato, sin repetir.
  const priorityTerms = new Map<string, ProfileTerm>();
  try {
    for (const profile of await loadAllMatchingProfiles()) {
      for (const term of profile.terms.filter(t => t.kind === 'role').slice(0, 12)) {
        if (!priorityTerms.has(term.key)) priorityTerms.set(term.key, term);
      }
    }
  } catch (err) {
    logger.error('Could not load profiles to prioritise offers', { message: String(err) });
  }

  for (const portal of JOB_POSTING_PORTALS) {
    try {
      reports.push(await syncJobPostingPortal(portal, { priorityTerms: [...priorityTerms.values()] }));
    } catch (err) {
      reports.push({ source: portal.source, categories: 0, fetched: 0, saved: 0, skipped: 0, errors: [String(err)] });
    }
  }

  for (const portal of LISTING_PORTALS) {
    try {
      reports.push(await syncListingPortal(portal, { priorityTerms: [...priorityTerms.values()] }));
    } catch (err) {
      reports.push({ source: portal.source, categories: 0, fetched: 0, saved: 0, skipped: 0, errors: [String(err)] });
    }
  }

  return reports;
}

let running = false;

/** Sincroniza al arrancar y cada `intervalMinutes`. Con 0 queda apagado. */
export function startOfferSync(intervalMinutes: number): () => void {
  if (!(intervalMinutes > 0)) return () => undefined;

  const run = async () => {
    // Una pasada lenta no debe solaparse con la siguiente.
    if (running) return;
    running = true;
    try {
      for (const report of await syncAllSources()) {
        logger.info('Offer sync finished', { ...report, errors: report.errors.slice(0, 5) });
      }
    } catch (err) {
      logger.error('Offer sync failed', { message: err instanceof Error ? err.message : String(err) });
    } finally {
      running = false;
    }
  };

  // run nunca rechaza (captura todo), así que se puede descartar su promesa.
  const first = setTimeout(() => void run(), 5_000);
  const every = setInterval(() => void run(), intervalMinutes * 60_000);
  first.unref();
  every.unref();

  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
