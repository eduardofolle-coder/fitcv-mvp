/**
 * Ofertas desde la API pública de Get on Board.
 *
 * Es la fuente más limpia: una API oficial y abierta con las mismas ofertas que
 * se ven sin iniciar sesión. Aquí solo se lee y se normaliza; guardar es tarea
 * de offerSync.
 */
import { createHash } from 'crypto';

export const GETONBRD_SOURCE = 'getonbrd';

const API = 'https://www.getonbrd.com/api/v0';
const USER_AGENT = 'FITCV-OfferSync/0.2 (+https://github.com/eduardofolle-coder/fitcv-mvp)';
const REQUEST_TIMEOUT_MS = 20_000;

export interface ExternalOffer {
  id: string;
  externalId: string;
  source: string;
  title: string;
  company: string;
  level: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  location: string | null;
  description: string;
  requirements: string[];
  url: string;
  applyUrl: string | null;
  country: string;
  remoteModality: string | null;
  publishedAt: string | null;
  /** Hasta cuándo recibe postulaciones, si el portal lo informa. */
  validThrough?: string | null;
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

/** Texto legible desde el HTML de la oferta, conservando párrafos y viñetas. */
export function htmlToText(html: string): string {
  return html
    .replace(/\r\n?/g, '\n')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    // </li> no agrega salto: el <li> siguiente ya abre su propia línea.
    .replace(/<\/(p|div|ul|ol|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|lt|gt|quot|#39|apos);/g, m => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // &amp; al final: decodificarlo antes convertiría "&amp;lt;" en "<".
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Id estable y corto: los slugs de Get on Board superan el largo que acepta la API. */
export const offerIdFor = (prefix: string, externalId: string): string =>
  `${prefix}-${createHash('sha1').update(externalId).digest('hex').slice(0, 20)}`;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const salary = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;

const MODALITY_LABELS: Record<string, string> = {
  hybrid: 'Híbrido',
  no_remote: 'Presencial',
  remote_local: 'Remoto',
  fully_remote: 'Remoto',
  temporarily_remote: 'Remoto temporal',
};

/** Normaliza un job de la API. Devuelve null si le falta lo mínimo para postular. */
export function mapGetOnBoardJob(job: unknown, countryCode: string): ExternalOffer | null {
  if (!job || typeof job !== 'object') return null;
  const j = job as Record<string, any>;
  const a = j.attributes && typeof j.attributes === 'object' ? j.attributes : null;

  const externalId = text(j.id);
  const title = text(a?.title);
  const url = text(j.links?.public_url ?? a?.links?.public_url);
  if (!a || !externalId || !title || !/^https:\/\/(www\.)?getonbrd\.com\//.test(url)) return null;

  const sections: Array<[unknown, unknown]> = [
    [a.description_headline, a.description],
    [a.functions_headline, a.functions],
    [a.desirable_headline, a.desirable],
    [a.benefits_headline, a.benefits],
  ];
  const description = sections
    .map(([headline, body]) => {
      const content = htmlToText(text(body));
      if (!content) return '';
      const heading = text(headline);
      return heading ? `${heading}\n${content}` : content;
    })
    .filter(Boolean)
    .join('\n\n');

  const min = salary(a.min_salary);
  const max = salary(a.max_salary);
  const countries = Array.isArray(a.countries) ? a.countries.filter((c: unknown) => typeof c === 'string') : [];
  const modality = text(a.remote_modality) || null;
  const location = [countries.join(', '), modality ? MODALITY_LABELS[modality] ?? modality : '']
    .filter(Boolean)
    .join(' · ');

  return {
    id: offerIdFor('gob', externalId),
    externalId,
    source: GETONBRD_SOURCE,
    title,
    company: text(a.company?.data?.attributes?.name) || 'Empresa no informada',
    level: 'N/A',
    salaryMin: min,
    salaryMax: max,
    salaryCurrency: min !== null || max !== null ? 'USD' : null,
    location: location || null,
    description,
    requirements: [],
    url,
    // El botón "postular" de Get on Board lleva a este formulario en su propio sitio.
    applyUrl: `${url.replace(/\/+$/, '')}/applications/new`,
    country: countryCode.toUpperCase(),
    remoteModality: modality,
    publishedAt:
      typeof a.published_at === 'number' && Number.isFinite(a.published_at)
        ? new Date(a.published_at * 1000).toISOString()
        : null,
  };
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson(url: string, fetchImpl: FetchLike): Promise<any> {
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Get on Board respondió ${res.status} para ${url}`);
  return res.json();
}

export async function listGetOnBoardCategories(fetchImpl: FetchLike = fetch): Promise<string[]> {
  const body = await getJson(`${API}/categories?per_page=100`, fetchImpl);
  return Array.isArray(body?.data)
    ? body.data.map((c: any) => text(c?.id)).filter(Boolean)
    : [];
}

export async function fetchGetOnBoardCategoryPage(
  category: string,
  countryCode: string,
  page: number,
  perPage: number,
  fetchImpl: FetchLike = fetch
): Promise<{ jobs: unknown[]; totalPages: number }> {
  const params = new URLSearchParams({
    country_code: countryCode.toUpperCase(),
    per_page: String(perPage),
    page: String(page),
    expand: '["company"]',
  });
  const body = await getJson(`${API}/categories/${encodeURIComponent(category)}/jobs?${params}`, fetchImpl);
  return {
    jobs: Array.isArray(body?.data) ? body.data : [],
    totalPages: Number(body?.meta?.total_pages) || 0,
  };
}
