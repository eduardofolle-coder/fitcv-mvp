/**
 * Portales que se descubren por listados de búsqueda. Los fixtures copian el
 * marcado real de Computrabajo y Trabajos Diarios.
 */
import { describe, it, expect } from 'vitest';
import {
  extractOfferLinks,
  keywordsFromTerms,
  LISTING_PORTALS,
  parseComputrabajoOffer,
  parseFirstJobOffer,
} from '../src/services/sources/listingPortals.js';
import { buildMatchingProfile } from '../src/services/offerMatching.js';

const portal = (source: string) => {
  const found = LISTING_PORTALS.find(p => p.source === source);
  if (!found) throw new Error(`sin portal ${source}`);
  return found;
};

describe('listing URLs', () => {
  it('builds Computrabajo keyword listings, and none without a keyword', () => {
    const ct = portal('computrabajo');
    expect(ct.listingUrl('logistica', 1)).toBe('https://cl.computrabajo.com/trabajo-de-logistica');
    expect(ct.listingUrl('comercio exterior', 2)).toBe('https://cl.computrabajo.com/trabajo-de-comercio-exterior?p=2');
    expect(ct.listingUrl(null, 1)).toBeNull();
  });

  it('builds Trabajos Diarios searches and the recent listing', () => {
    const td = portal('trabajosdiarios');
    expect(td.listingUrl('comercio exterior', 2)).toBe('https://cl.trabajosdiarios.com/ofertas-trabajo/de-comercio-exterior?page=2');
    expect(td.listingUrl('Logística', 1)).toBe('https://cl.trabajosdiarios.com/ofertas-trabajo/de-logistica');
    expect(td.listingUrl(null, 1)).toBe('https://cl.trabajosdiarios.com/ofertas-trabajo');
  });

  it('builds FirstJob keyword listings, and the general listing without a keyword', () => {
    const fj = portal('firstjob');
    expect(fj.listingUrl('marketing', 1)).toBe('https://firstjob.me/ofertas?keyword=marketing');
    expect(fj.listingUrl('comercio exterior', 2)).toBe('https://firstjob.me/ofertas?keyword=comercio+exterior&page=2');
    expect(fj.listingUrl(null, 1)).toBe('https://firstjob.me/ofertas');
  });
});

describe('extractOfferLinks', () => {
  it('finds each Computrabajo offer once, without tracking parameters', () => {
    const html = `
      <a href="/ofertas-de-trabajo/oferta-de-trabajo-de-analista-de-logistica-y-despacho-providencia-en-santiago-providencia-2A9F5EB0646C2BA161373E686DCF3405#lc=ListOffers-Score-1">x</a>
      <a href="/ofertas-de-trabajo/oferta-de-trabajo-de-analista-de-logistica-y-despacho-providencia-en-santiago-providencia-2A9F5EB0646C2BA161373E686DCF3405">x</a>
      <a href="/ofertas-de-trabajo/?dis=3">filtro</a>`;
    expect(extractOfferLinks(html, portal('computrabajo'))).toEqual([
      {
        externalId: '2A9F5EB0646C2BA161373E686DCF3405',
        url: 'https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-analista-de-logistica-y-despacho-providencia-en-santiago-providencia-2A9F5EB0646C2BA161373E686DCF3405',
      },
    ]);
  });

  it('accepts absolute and relative Trabajos Diarios links', () => {
    const html = `<a href="https://cl.trabajosdiarios.com/trabajo/3085424/reponedores-en-metropolitana-de-santiago">a</a>
      <a href="/trabajo/3083051/supervisor-operaciones-en-antofagasta">b</a>
      <a href="/ofertas-trabajo?page=2">siguiente</a>`;
    expect(extractOfferLinks(html, portal('trabajosdiarios')).map(l => l.externalId)).toEqual(['3085424', '3083051']);
  });

  it('reads Trabajos Diarios links that only appear in the JSON-LD list', () => {
    const html = `<script type="application/ld+json">{"itemListElement":[
      {"@type":"ListItem","name":"Conductor","url": "https://cl.trabajosdiarios.com/trabajo/3081950/conductor-de-reparto"}]}</script>`;
    expect(extractOfferLinks(html, portal('trabajosdiarios'))).toEqual([
      { externalId: '3081950', url: 'https://cl.trabajosdiarios.com/trabajo/3081950/conductor-de-reparto' },
    ]);
  });
});

describe('parseComputrabajoOffer', () => {
  const url = 'https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-operarios-de-bodega-E391584C813867D161373E686DCF3405';
  const html = `
    <p class="fs16 fc_aux">Las mejores empresas para trabajar en Chile</p>
    <h1 class="fwB fs24 mb5 box_detail w100_m">Operarios de bodega / Log&#xED;stica falabella (Tradis) Cyber</h1>
    <p class="fs16">Importante empresa del sector - Santiago - Cerrillos, R.Metropolitana</p>
    <p class="fwB fs18 mtB mb10">Descripción de la oferta</p>
    <p class="mbB"> ¡VIVE LA CAMPAÑA CYBER! OPERARIOS(AS) DE BODEGA<br>Turno madrugada</p>
    <p class="mbB">El equipo reclutador buscará estos conocimientos y habilidades en las postulaciones.</p>`;

  it('reads title, company, location and description from the HTML', () => {
    expect(parseComputrabajoOffer(html, url, 'E391584C813867D161373E686DCF3405')).toMatchObject({
      source: 'computrabajo',
      externalId: 'E391584C813867D161373E686DCF3405',
      title: 'Operarios de bodega / Logística falabella (Tradis) Cyber',
      company: 'Importante empresa del sector',
      location: 'Santiago - Cerrillos, R.Metropolitana',
      description: '¡VIVE LA CAMPAÑA CYBER! OPERARIOS(AS) DE BODEGA\nTurno madrugada',
      url,
      applyUrl: url,
      country: 'CL',
    });
  });

  it('skips a closed offer and a page without a title', () => {
    const closed = html.replace('<p class="fs16">', '<p>Esta oferta ha finalizado</p><p class="fs16">');
    expect(parseComputrabajoOffer(closed, url, 'x')).toBeNull();
    expect(parseComputrabajoOffer('<html><body>Sin título</body></html>', url, 'x')).toBeNull();
  });
});

describe('parseFirstJobOffer', () => {
  const url = 'https://firstjob.me/oferta/56907/programa-de-practicas-transbank-2026-2027';
  // FirstJob no publica JobPosting; el "Postular" del sitio pide cuenta propia
  // (queda en "Te necesitamos"), así que solo se lee para tener la oferta.
  const html = `
    <div class="job-single-header mb-50">
      <h3 class="mb-15">Programa de Prácticas Transbank 2026 - 2027 🚀</h3>
      <div class="job-meta">
        <a class="company text-md" href="/perfil/transbank-s-a">Transbank S.A</a>
        <span class="location text-md"><i class="fi-rr-marker"></i>Región Metropolitana de Santiago, Chile</span>
      </div>
      <div class="job-tags mt-30">
        <a href="/ofertas?place=5" class="btn btn-small background-blue-light mr-5">Híbrido</a>
      </div>
    </div>
    <div class="content-single content-offer"><div>En <strong>Transbank</strong> buscamos un practicante.<br><br>Requisitos:</div>
    <ul><li>Estudiante de Ingeniería Comercial</li></ul></div>
    <div class="single-apply-jobs"><a class="btn btn-default" href="/usuarios/ingresar">Postular</a></div>`;

  it('reads title, company, location, modality and description', () => {
    expect(parseFirstJobOffer(html, url, '56907')).toMatchObject({
      source: 'firstjob',
      externalId: '56907',
      title: 'Programa de Prácticas Transbank 2026 - 2027 🚀',
      company: 'Transbank S.A',
      location: 'Región Metropolitana de Santiago, Chile',
      remoteModality: 'Híbrido',
      description: 'En Transbank buscamos un practicante.\n\nRequisitos:\n\n• Estudiante de Ingeniería Comercial',
      url,
      applyUrl: url,
      country: 'CL',
    });
  });

  it('skips a closed offer and a page without a title', () => {
    const closed = html.replace('</h3>', '</h3><p>Esta oferta ha finalizado</p>');
    expect(parseFirstJobOffer(closed, url, 'x')).toBeNull();
    expect(parseFirstJobOffer('<html><body>Sin título</body></html>', url, 'x')).toBeNull();
  });
});

describe('keywordsFromTerms', () => {
  it('searches by the main areas of the profile, not by tools', () => {
    const profile = buildMatchingProfile({
      experience: [{ title: 'Subgerente de Logística y Abastecimiento' }, { title: 'Supply Chain Analyst' }],
      skills: { tools: ['SAP'] },
    });
    const keywords = keywordsFromTerms(profile.terms);
    expect(keywords).toEqual(expect.arrayContaining(['logistica', 'abastecimiento', 'supply chain']));
    expect(keywords).not.toContain('sap');
  });
});
