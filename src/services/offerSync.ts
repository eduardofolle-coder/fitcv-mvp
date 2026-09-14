/**
 * Guarda ofertas de fuentes externas y las mantiene al día.
 *
 * Cada fuente solo sabe leer y normalizar; aquí se guarda. La misma oferta
 * vuelve en cada pasada, así que se actualiza en vez de duplicarse.
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

export async function upsertOffers(offers: ExternalOffer[]): Promise<number> {
  for (const o of offers) {
    await db.query(`
      INSERT INTO offers (
        id, title, company, level, salaryMin, salaryMax, salaryCurrency, location, description,
        requirements, source, url, externalId, applyUrl, country, remoteModality, publishedAt,
        lastSeenAt, createdAt
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
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
    ]);
  }
  return offers.length;
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

let running = false;

/** Sincroniza al arrancar y cada `intervalMinutes`. Con 0 queda apagado. */
export function startOfferSync(intervalMinutes: number): () => void {
  if (!(intervalMinutes > 0)) return () => undefined;

  const run = async () => {
    // Una pasada lenta no debe solaparse con la siguiente.
    if (running) return;
    running = true;
    try {
      const report = await syncGetOnBoard();
      logger.info('Offer sync finished', { ...report, errors: report.errors.slice(0, 10) });
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
