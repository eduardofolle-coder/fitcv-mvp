/**
 * Lectura de portales por sitemap + JobPosting. Los fixtures copian la forma
 * real de trabajando.cl, Chiletrabajos y la Bolsa Nacional de Empleo.
 */
import { describe, it, expect } from 'vitest';
import {
  findJobPosting,
  JOB_POSTING_PORTALS,
  looksBlocked,
  mapJobPosting,
  parsePostingDate,
  parseSitemap,
} from '../src/services/sources/jobPosting.js';

const portal = (source: string) => {
  const found = JOB_POSTING_PORTALS.find(p => p.source === source);
  if (!found) throw new Error(`sin portal ${source}`);
  return found;
};

const page = (jsonLd: string) => `<html><head><script type="application/ld+json">${jsonLd}</script></head><body></body></html>`;

describe('parseSitemap', () => {
  it('reads plain and CDATA locations with their dates', () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc><![CDATA[https://www.chiletrabajos.cl/trabajo/conserje-nochero-3868379]]></loc><lastmod><![CDATA[2026-09-14T05:58:50Z]]></lastmod></url>
      <url><loc>https://www.trabajando.cl/trabajo/6124702-cajero-iquique?a=1&amp;b=2</loc></url>
    </urlset>`;
    expect(parseSitemap(xml).urls).toEqual([
      { loc: 'https://www.chiletrabajos.cl/trabajo/conserje-nochero-3868379', lastmod: '2026-09-14T05:58:50Z' },
      { loc: 'https://www.trabajando.cl/trabajo/6124702-cajero-iquique?a=1&b=2', lastmod: null },
    ]);
  });

  it('lists child sitemaps of an index', () => {
    const xml = '<sitemapindex><sitemap><loc>https://www.trabajando.cl/sitemap-ofertas.xml</loc></sitemap></sitemapindex>';
    expect(parseSitemap(xml)).toEqual({ urls: [], sitemaps: ['https://www.trabajando.cl/sitemap-ofertas.xml'] });
  });
});

describe('portal offer URLs', () => {
  it('extract the offer id and ignore other pages', () => {
    expect('https://www.trabajando.cl/trabajo/6124702-cajero-a-garzon-iquique'.match(portal('trabajando').offerUrl)?.[1]).toBe('6124702');
    expect('https://www.chiletrabajos.cl/trabajo/conserje-nochero-sabado-y-domingo-3868379'.match(portal('chiletrabajos').offerUrl)?.[1]).toBe('3868379');
    expect('https://www.bne.gob.cl/oferta/2026-094514'.match(portal('bne').offerUrl)?.[1]).toBe('2026-094514');
    expect('https://www.portalminero.com/oferta-laboral/2225'.match(portal('portalminero').offerUrl)?.[1]).toBe('2225');
    expect('https://www.portalminero.com/panel/oferta-laboral/2225'.match(portal('portalminero').offerUrl)).toBeNull();
    expect('https://www.trabajando.cl/empresas/falabella'.match(portal('trabajando').offerUrl)).toBeNull();
  });
});

describe('findJobPosting', () => {
  it('finds the posting among other JSON-LD blocks', () => {
    const html = `<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>${page('{"@type":"JobPosting","title":"Conserje"}')}`;
    expect(findJobPosting(html)?.title).toBe('Conserje');
  });

  it('tolerates raw line breaks inside strings', () => {
    const html = page('{"@type":"JobPosting","title":"Otras","description":"<h1>TENS UTI</h1>\n<p>Turno</p>"}');
    expect(findJobPosting(html)?.description).toContain('TENS UTI');
  });

  it('returns null without a posting', () => {
    expect(findJobPosting('<html></html>')).toBeNull();
  });
});

describe('mapJobPosting', () => {
  it('maps a trabajando.cl offer', () => {
    const posting = {
      '@type': 'JobPosting',
      title: 'Cajero(a)/Garzón(a) - Iquique',
      description: '<p><strong>Cajero(a)</strong></p><p>¿Quiénes somos?</p>',
      datePosted: '2026-09-13',
      validThrough: '2026-10-13',
      hiringOrganization: { '@type': 'Organization', name: 'Dreams Iquique' },
      jobLocation: { '@type': 'Place', address: { addressLocality: 'Iquique', addressRegion: 'Tarapacá', addressCountry: 'CL' } },
      baseSalary: { currency: 'CLP', value: { value: 0, unitText: 'MONTH' } },
    };
    const url = 'https://www.trabajando.cl/trabajo/6124702-cajero-iquique';

    expect(mapJobPosting(posting, portal('trabajando'), url, '6124702')).toMatchObject({
      source: 'trabajando',
      externalId: '6124702',
      title: 'Cajero(a)/Garzón(a) - Iquique',
      company: 'Dreams Iquique',
      location: 'Iquique, Tarapacá',
      country: 'CL',
      // Sueldo 0 = no informado.
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      url,
      applyUrl: url,
      description: 'Cajero(a)\n¿Quiénes somos?',
    });
  });

  it('reads Chiletrabajos dates with a space and a capitalised salary value', () => {
    const offer = mapJobPosting(
      {
        title: 'Conserje Nochero',
        description: 'Se busca Conserje\r\n\r\nResumen',
        datePosted: '2026-09-14 02:58:50',
        validThrough: '2026-11-28T02:58:50',
        hiringOrganization: { name: 'Edificio Don Antonio' },
        baseSalary: { currency: 'CLP', value: { Value: 650000 } },
      },
      portal('chiletrabajos'),
      'https://www.chiletrabajos.cl/trabajo/conserje-nochero-3868379',
      '3868379'
    );

    expect(offer?.publishedAt).toMatch(/^2026-09-14T/);
    expect(offer?.validThrough).toMatch(/^2026-11-28T/);
    expect(offer).toMatchObject({ salaryMin: 650000, salaryMax: 650000, salaryCurrency: 'CLP', description: 'Se busca Conserje\n\nResumen' });
  });

  it('takes the real job title from the BNE description heading', () => {
    const offer = mapJobPosting(
      { title: 'Otras ocupaciones', description: '<h1>TENS UTI / Coronaria - Clínica San Carlos</h1><h2>Otras ocupaciones</h2>', hiringOrganization: { name: 'Clínica San Carlos de Apoquindo' } },
      portal('bne'),
      'https://www.bne.gob.cl/oferta/2026-094514',
      '2026-094514'
    );
    expect(offer?.title).toBe('TENS UTI / Coronaria - Clínica San Carlos');
    expect(offer?.id).toMatch(/^bne-[0-9a-f]{20}$/);
  });

  it('rejects a posting without a title', () => {
    expect(mapJobPosting({ description: 'x' }, portal('trabajando'), 'https://www.trabajando.cl/trabajo/1-x', '1')).toBeNull();
  });
});

describe('helpers', () => {
  it('parses posting dates or gives up cleanly', () => {
    expect(parsePostingDate('2026-09-13')).toMatch(/^2026-09-13T/);
    expect(parsePostingDate('no es fecha')).toBeNull();
    expect(parsePostingDate(undefined)).toBeNull();
  });

  it('treats refusals and challenges as a block', () => {
    expect(looksBlocked(403, '')).toBe(true);
    expect(looksBlocked(429, '')).toBe(true);
    expect(looksBlocked(200, '<title>Attention Required! | Cloudflare</title>')).toBe(true);
    expect(looksBlocked(200, page('{"@type":"JobPosting","title":"x"}'))).toBe(false);
    // Un listado normal que carga reCAPTCHA para su login no está bloqueado.
    expect(looksBlocked(200, '<html><head><title>Trabajo de logistica</title><script src="https://www.google.com/recaptcha/api.js"></script></head></html>')).toBe(false);
  });
});
