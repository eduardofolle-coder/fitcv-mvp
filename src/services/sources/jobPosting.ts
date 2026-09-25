/**
 * Ofertas de portales que publican datos estructurados (schema.org JobPosting).
 *
 * Es lo que los portales exponen para Google Empleos: un sitemap con las
 * ofertas y, en cada una, un bloque JSON-LD con título, empresa, ubicación y
 * vigencia. Leer eso es leer lo que el propio portal decidió hacer público,
 * sin tocar APIs internas ni saltarse bloqueos.
 */
import { htmlToText, offerIdFor, type ExternalOffer } from './getOnBoard.js';

export interface JobPostingPortal {
  source: string;
  label: string;
  sitemap: string;
  /** URL de una oferta; el primer grupo es su id en el portal. */
  offerUrl: RegExp;
  idPrefix: string;
  encoding: string;
  /** El portal pone la categoría en "title" y el cargo real en el <h1> de la descripción. */
  titleFromHeading?: boolean;
}

export const JOB_POSTING_PORTALS: JobPostingPortal[] = [
  {
    source: 'trabajando',
    label: 'trabajando.cl',
    sitemap: 'https://www.trabajando.cl/sitemap-ofertas.xml',
    offerUrl: /^https:\/\/www\.trabajando\.cl\/trabajo\/(\d+)-[^/?#]*$/,
    idPrefix: 'trb',
    encoding: 'utf-8',
  },
  {
    source: 'chiletrabajos',
    label: 'Chiletrabajos',
    sitemap: 'https://www.chiletrabajos.cl/sitemap.xml',
    offerUrl: /^https:\/\/www\.chiletrabajos\.cl\/trabajo\/[^/?#]*-(\d+)$/,
    idPrefix: 'chl',
    encoding: 'utf-8',
  },
  {
    source: 'portalminero',
    label: 'Portal Minero',
    sitemap: 'https://www.portalminero.com/sitemap-ofertas.xml',
    offerUrl: /^https:\/\/www\.portalminero\.com\/oferta-laboral\/(\d+)$/,
    idPrefix: 'pmi',
    encoding: 'utf-8',
  },
  {
    source: 'bne',
    label: 'Bolsa Nacional de Empleo',
    sitemap: 'https://www.bne.gob.cl/sitemap.xml',
    offerUrl: /^https:\/\/www\.bne\.gob\.cl\/oferta\/(\d{4}-\d+)$/,
    idPrefix: 'bne',
    encoding: 'windows-1252',
    titleFromHeading: true,
  },
  // Jobrapido salió en 2026-09: es un agregador de otros portales, movió su sitemap
  // a fichas que responden 404 y su robots.txt bloquea /jobpreview/.
];

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

const unwrapCdata = (value: string): string => {
  const match = value.trim().match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return (match ? match[1] : value).trim();
};

const decodeXml = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** URLs de un sitemap, o los sitemaps hijos si es un índice. */
export function parseSitemap(xml: string): { urls: SitemapEntry[]; sitemaps: string[] } {
  const locOf = (block: string): string | null => {
    const loc = block.match(/<loc>([\s\S]*?)<\/loc>/);
    return loc ? decodeXml(unwrapCdata(loc[1])) : null;
  };

  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].flatMap(m => {
    const loc = locOf(m[1]);
    if (!loc) return [];
    const lastmod = m[1].match(/<lastmod>([\s\S]*?)<\/lastmod>/);
    return [{ loc, lastmod: lastmod ? unwrapCdata(lastmod[1]) : null }];
  });

  const sitemaps = [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/g)].flatMap(m => {
    const loc = locOf(m[1]);
    return loc ? [loc] : [];
  });

  return { urls, sitemaps };
}

// Algunos portales dejan saltos de línea crudos dentro de los strings del JSON.
function escapeRawControlChars(raw: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (const ch of raw) {
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (escaped) {
      escaped = false;
      out += ch;
    } else if (ch === '\\') {
      escaped = true;
      out += ch;
    } else if (ch === '"') {
      inString = false;
      out += ch;
    } else if (ch === '\n') {
      out += '\\n';
    } else if (ch === '\t') {
      out += ' ';
    } else if (ch !== '\r') {
      out += ch;
    }
  }
  return out;
}

function parseJsonLd(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(escapeRawControlChars(raw));
    } catch {
      return null;
    }
  }
}

const isJobPosting = (value: unknown): value is Record<string, any> => {
  if (!value || typeof value !== 'object') return false;
  const type = (value as Record<string, unknown>)['@type'];
  return type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
};

/** El JobPosting de la página, si lo tiene. */
export function findJobPosting(html: string): Record<string, any> | null {
  for (const match of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const data = parseJsonLd(match[1]);
    const items: unknown[] = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as any)['@graph'])
        ? (data as any)['@graph']
        : [data];
    const posting = items.find(isJobPosting);
    if (posting) return posting;
  }
  return null;
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';

const first = <T>(value: T | T[] | undefined): T | undefined => (Array.isArray(value) ? value[0] : value);

/** Fechas de JobPosting: "2026-09-13", "2026-09-14 02:58:50" o ISO completo. */
export function parsePostingDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw.replace(' ', 'T');
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function salaryRange(baseSalary: any): { min: number | null; max: number | null; currency: string | null } {
  const amount = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
  const value = baseSalary && typeof baseSalary === 'object' ? baseSalary.value : undefined;

  // Un sueldo 0 significa "no informado", no un sueldo de cero.
  const exact = amount(value?.value ?? value?.Value ?? (typeof value === 'number' ? value : undefined));
  const min = amount(value?.minValue) ?? exact;
  const max = amount(value?.maxValue) ?? exact;
  const currency = min !== null || max !== null ? text(baseSalary?.currency) || null : null;
  return { min, max, currency };
}

export function mapJobPosting(
  posting: Record<string, any>,
  portal: Pick<JobPostingPortal, 'source' | 'idPrefix' | 'titleFromHeading'>,
  url: string,
  externalId: string,
  countryCode = 'CL'
): ExternalOffer | null {
  const rawDescription = text(posting.description);

  let title = htmlToText(text(posting.title));
  if (portal.titleFromHeading) {
    const heading = rawDescription.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const fromHeading = heading ? htmlToText(heading[1]) : '';
    if (fromHeading) title = fromHeading;
  }
  if (!title) return null;

  const address = first(first(posting.jobLocation)?.address) ?? {};
  const location = [text(address.addressLocality), text(address.addressRegion)].filter(Boolean).join(', ');
  const salary = salaryRange(posting.baseSalary);

  return {
    id: offerIdFor(portal.idPrefix, externalId),
    externalId,
    source: portal.source,
    title: title.slice(0, 300),
    company: htmlToText(text(first(posting.hiringOrganization)?.name)) || 'Empresa no informada',
    level: 'N/A',
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryCurrency: salary.currency,
    location: location || null,
    description: htmlToText(rawDescription).slice(0, 20000),
    requirements: [],
    url,
    applyUrl: url,
    country: (text(address.addressCountry) || countryCode).toUpperCase().slice(0, 2),
    remoteModality: text(posting.jobLocationType) === 'TELECOMMUTE' ? 'remote' : null,
    publishedAt: parsePostingDate(posting.datePosted),
    validThrough: parsePostingDate(posting.validThrough),
  };
}

// Páginas de desafío anti-robots. No se busca "captcha" suelto: muchos portales
// cargan reCAPTCHA en su formulario de login y eso no es un bloqueo.
const BLOCK_MARKERS = [/<title>\s*(Attention Required! \| Cloudflare|Just a moment\.\.\.)/i, /cf-chl-/i];

/** Un portal que responde así nos está pidiendo que no sigamos: se respeta. */
export const looksBlocked = (status: number, body: string): boolean =>
  status === 403 || status === 429 || status === 503 || (status === 200 && BLOCK_MARKERS.some(p => p.test(body.slice(0, 5000))) && !/JobPosting/.test(body));
