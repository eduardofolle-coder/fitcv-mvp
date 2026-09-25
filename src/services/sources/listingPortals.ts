/**
 * Portales sin sitemap de ofertas: se descubren recorriendo sus listados de
 * búsqueda, con las áreas del perfil de los candidatos como palabras clave.
 *
 * Así se leen solo las ofertas que le sirven a alguien, en vez de recorrer el
 * portal entero. Las reglas de cortesía (robots.txt, pausa entre páginas,
 * detenerse ante un bloqueo) las aplica offerSync.
 */
import { htmlToText, offerIdFor, type ExternalOffer } from './getOnBoard.js';
import { findJobPosting, mapJobPosting } from './jobPosting.js';
import type { ProfileTerm } from '../offerMatching.js';

export interface ListingPortal {
  source: string;
  label: string;
  origin: string;
  encoding: string;
  /** Página de listado para una palabra clave; null si el portal no tiene listado para ese caso. */
  listingUrl: (keyword: string | null, page: number) => string | null;
  /** Enlace a una oferta en el HTML del listado (con flag g): grupo 1 = ruta, grupo 2 = id. */
  offerLink: RegExp;
  parseOffer: (html: string, url: string, externalId: string) => ExternalOffer | null;
}

// Sin tildes: los portales usan "de-logistica", no "de-logística".
const slug = (keyword: string): string =>
  keyword.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, '-');

// Aviso de oferta cerrada cerca del título: no sirve para postular.
const CLOSED = /(oferta (ha )?(finalizado|caducado|cerrad[ao])|ya no est[aá] disponible|proceso de selecci[oó]n (ha )?finalizado)/i;

/** Oferta de Computrabajo. No publica JobPosting, así que se lee su HTML. */
export function parseComputrabajoOffer(html: string, url: string, externalId: string): ExternalOffer | null {
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = heading ? htmlToText(heading[1]) : '';
  if (!heading || !title) return null;

  const after = html.slice((heading.index ?? 0) + heading[0].length);
  if (CLOSED.test(htmlToText(after.slice(0, 5000)))) return null;

  // "Empresa - Ciudad - Comuna, Región", en el primer párrafo tras el título.
  const info = after.match(/<p class="fs16"[^>]*>([\s\S]*?)<\/p>/i);
  const parts = info ? htmlToText(info[1]).split(/\s+-\s+/).filter(Boolean) : [];

  const description = [...after.matchAll(/<p class="mbB"[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => htmlToText(m[1]))
    .filter(text => text && !/^El equipo reclutador/i.test(text))
    .join('\n\n');

  return {
    id: offerIdFor('ctb', externalId),
    externalId,
    source: 'computrabajo',
    title: title.slice(0, 300),
    company: parts[0] || 'Empresa no informada',
    level: 'N/A',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    location: parts.slice(1).join(' - ') || null,
    description: description.slice(0, 20000),
    requirements: [],
    url,
    applyUrl: url,
    country: 'CL',
    remoteModality: null,
    publishedAt: null,
    validThrough: null,
  };
}

export const LISTING_PORTALS: ListingPortal[] = [
  {
    source: 'computrabajo',
    label: 'Computrabajo',
    origin: 'https://cl.computrabajo.com',
    encoding: 'utf-8',
    // Sin palabra clave no hay un listado útil: sin perfiles no se lee.
    listingUrl: (keyword, page) =>
      keyword ? `https://cl.computrabajo.com/trabajo-de-${slug(keyword)}${page > 1 ? `?p=${page}` : ''}` : null,
    offerLink: /href="(\/ofertas-de-trabajo\/oferta-de-trabajo-de-[a-z0-9-]*?-([0-9A-F]{32}))(?:[?#][^"]*)?"/g,
    parseOffer: parseComputrabajoOffer,
  },
  {
    source: 'trabajosdiarios',
    label: 'Trabajos Diarios',
    origin: 'https://cl.trabajosdiarios.com',
    encoding: 'utf-8',
    // Desde 2026-09 el buscador ignora ?q=: la búsqueda por área es /ofertas-trabajo/de-<área>.
    listingUrl: (keyword, page) => {
      const base = keyword ? `https://cl.trabajosdiarios.com/ofertas-trabajo/de-${slug(keyword)}` : 'https://cl.trabajosdiarios.com/ofertas-trabajo';
      return page > 1 ? `${base}?page=${page}` : base;
    },
    // Los enlaces vienen como href o, desde 2026-09, solo en el JSON-LD del listado ("url": "...").
    offerLink: /(?:href="|"url":\s*")(?:https:\/\/cl\.trabajosdiarios\.com)?(\/trabajo\/(\d+)\/[a-z0-9-]+)"/g,
    parseOffer: (html, url, externalId) => {
      const posting = findJobPosting(html);
      return posting ? mapJobPosting(posting, { source: 'trabajosdiarios', idPrefix: 'tdi' }, url, externalId) : null;
    },
  },
];

/** Enlaces únicos a ofertas en una página de listado. */
export function extractOfferLinks(html: string, portal: ListingPortal): Array<{ url: string; externalId: string }> {
  const found = new Map<string, string>();
  for (const match of html.matchAll(portal.offerLink)) {
    if (!found.has(match[2])) found.set(match[2], `${portal.origin}${match[1]}`);
  }
  return [...found].map(([externalId, url]) => ({ url, externalId }));
}

/** Palabras clave de búsqueda: las áreas principales del perfil, no sus herramientas. */
export function keywordsFromTerms(terms: ProfileTerm[], max = 6): string[] {
  const keywords: string[] = [];
  for (const term of terms) {
    if (term.kind !== 'role') continue;
    const keyword = term.variants[0];
    if (keyword.length < 3 || keywords.includes(keyword)) continue;
    keywords.push(keyword);
    if (keywords.length >= max) break;
  }
  return keywords;
}
