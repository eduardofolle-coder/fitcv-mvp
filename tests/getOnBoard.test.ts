/**
 * Normalización de ofertas de Get on Board. El fixture copia la forma real que
 * devuelve la API pública (categories/:id/jobs con expand company).
 */
import { describe, it, expect } from 'vitest';
import { htmlToText, mapGetOnBoardJob, offerIdFor } from '../src/services/sources/getOnBoard.js';

const job = {
  id: 'desarrollador-senior-backend-cloud-tcit-santiago-con-un-slug-muy-largo-para-el-limite',
  type: 'job',
  attributes: {
    title: 'Desarrollador Senior Back-end Cloud',
    description_headline: 'Descripción / Requisitos',
    description: '<div>Buscamos experiencia en <strong>Node.js</strong> &amp; AWS.<ul><li>APIs REST</li><li>CI/CD</li></ul></div>',
    functions_headline: 'Funciones',
    functions: '<p>Diseñar servicios&nbsp;cloud.</p>',
    desirable_headline: '',
    desirable: '',
    benefits_headline: 'Beneficios',
    benefits: '<p><strong>Modalidad:</strong> Híbrida</p>',
    remote: false,
    remote_modality: 'hybrid',
    countries: ['Chile'],
    min_salary: 2500,
    max_salary: 3200,
    published_at: 1788460925,
    company: { data: { id: 'tcit', type: 'company', attributes: { name: 'TCIT' } } },
  },
  links: { public_url: 'https://www.getonbrd.com/jobs/desarrollador-senior-backend-cloud-tcit-santiago' },
};

describe('htmlToText', () => {
  it('keeps list items and paragraphs readable', () => {
    expect(htmlToText('<p>Uno</p><ul><li>A</li><li>B</li></ul>')).toBe('Uno\n\n• A\n• B');
  });

  it('decodes entities without double-decoding', () => {
    expect(htmlToText('a &amp; b &amp;lt;c&amp;gt;')).toBe('a & b &lt;c&gt;');
  });
});

describe('mapGetOnBoardJob', () => {
  const offer = mapGetOnBoardJob(job, 'cl');

  it('maps the fields FITCV needs to tailor and apply', () => {
    expect(offer).toMatchObject({
      source: 'getonbrd',
      externalId: job.id,
      title: 'Desarrollador Senior Back-end Cloud',
      company: 'TCIT',
      salaryMin: 2500,
      salaryMax: 3200,
      salaryCurrency: 'USD',
      location: 'Chile · Híbrido',
      country: 'CL',
      remoteModality: 'hybrid',
      url: job.links.public_url,
      applyUrl: `${job.links.public_url}/applications/new`,
      publishedAt: '2026-09-03T18:42:05.000Z',
    });
  });

  it('turns the HTML sections into plain text with their headings', () => {
    expect(offer?.description).toContain('Descripción / Requisitos\nBuscamos experiencia en Node.js & AWS.');
    expect(offer?.description).toContain('• APIs REST');
    expect(offer?.description).toContain('Funciones\nDiseñar servicios cloud.');
    expect(offer?.description).not.toMatch(/<[a-z]/i);
  });

  it('produces an id the postulation API accepts', () => {
    expect(offer?.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(offer?.id).toBe(offerIdFor('gob', job.id));
  });

  it('leaves salary empty instead of inventing a currency', () => {
    const noSalary = mapGetOnBoardJob({ ...job, attributes: { ...job.attributes, min_salary: null, max_salary: null } }, 'CL');
    expect(noSalary).toMatchObject({ salaryMin: null, salaryMax: null, salaryCurrency: null });
  });

  it('rejects a job without a title or a Get on Board link', () => {
    expect(mapGetOnBoardJob({ ...job, attributes: { ...job.attributes, title: '' } }, 'CL')).toBeNull();
    expect(mapGetOnBoardJob({ ...job, links: { public_url: 'https://evil.example/jobs/x' } }, 'CL')).toBeNull();
    expect(mapGetOnBoardJob(null, 'CL')).toBeNull();
  });
});
