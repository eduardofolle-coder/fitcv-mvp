/**
 * La promesa del adaptador: los datos duros salen del CV tal cual, y la
 * narrativa solo puede usar lo que el CV respalda.
 */
import { describe, it, expect } from 'vitest';
import {
  buildHardData,
  composeCV,
  hardDataForPrompt,
  normalizeExperience,
  sanitizeNarrative,
} from '../src/services/cvComposer.js';

const row = {
  fullName: 'Juan Perez',
  yearsExperience: 6,
  experience: JSON.stringify([
    {
      company: 'Mercado Libre',
      title: 'Senior Backend Engineer',
      startDate: '2021-01',
      endDate: '2024-06',
      details: ['Microservicios en Node.js y TypeScript', 'Lideró un equipo de 4 ingenieros'],
    },
    {
      company: 'Falabella',
      title: 'Backend Engineer',
      startDate: '2018-03',
      endDate: '2020-12',
      details: ['APIs REST con Express y PostgreSQL'],
    },
  ]),
  education: JSON.stringify([
    { institution: 'Universidad de Chile', degree: 'Ingeniería Civil', field: 'Computación', graduationDate: '2017' },
  ]),
  skills: JSON.stringify({ programming: ['TypeScript'], tools: ['AWS', 'Docker'] }),
  languages: JSON.stringify([{ language: 'Español', proficiency: 'Nativo' }]),
  certifications: JSON.stringify([]),
};

const contact = { email: 'juan@example.com', phone: '+56 9 1234 5678', location: 'Santiago' };

const hard = buildHardData(row, contact);

describe('hard data', () => {
  it('is copied verbatim into the composed CV', () => {
    const { narrative } = sanitizeNarrative(
      {
        headline: 'Backend orientado a cloud',
        highlights: { 'exp-0': [{ text: 'Diseñó microservicios', sourceIndex: 0 }] },
      },
      hard
    );
    const cv = composeCV(hard, narrative);

    expect(cv).toContain('Juan Perez');
    expect(cv).toContain('juan@example.com | +56 9 1234 5678 | Santiago');
    expect(cv).toContain('Senior Backend Engineer — Mercado Libre');
    expect(cv).toContain('2021-01 – 2024-06');
    expect(cv).toContain('Backend Engineer — Falabella');
    expect(cv).toContain('2018-03 – 2020-12');
    expect(cv).toContain('Ingeniería Civil — Computación, Universidad de Chile (2017)');
    expect(cv).toContain('Español (Nativo)');
  });

  it('keeps every employer, in the order the CV lists them', () => {
    const { narrative } = sanitizeNarrative({}, hard);
    const cv = composeCV(hard, narrative);

    expect(cv.indexOf('Mercado Libre')).toBeGreaterThan(-1);
    expect(cv.indexOf('Mercado Libre')).toBeLessThan(cv.indexOf('Falabella'));
  });

  it('never sends the name or contact details to the model', () => {
    const payload = JSON.stringify(hardDataForPrompt(hard));

    expect(payload).toContain('Mercado Libre');
    expect(payload).not.toContain('Juan Perez');
    expect(payload).not.toContain('juan@example.com');
    expect(payload).not.toContain('+56 9 1234 5678');
  });
});

describe('narrative', () => {
  it('uses the reframed wording for grounded highlights', () => {
    const { narrative } = sanitizeNarrative(
      { highlights: { 'exp-0': [{ text: 'Lideró y formó un equipo de 4 ingenieros', sourceIndex: 1 }] } },
      hard
    );
    const cv = composeCV(hard, narrative);

    expect(cv).toContain('• Lideró y formó un equipo de 4 ingenieros');
    // Lo que no se eligió para esa experiencia no se imprime.
    expect(cv).not.toContain('• Microservicios en Node.js y TypeScript');
  });

  it('rejects highlights that cannot be traced to the CV', () => {
    const { narrative, adjustments } = sanitizeNarrative(
      {
        highlights: {
          'exp-0': [
            { text: 'Real', sourceIndex: 0 },
            { text: 'Dirigió 50 personas', sourceIndex: 5 },
            { text: 'Sin referencia' },
          ],
          'exp-9': [{ text: 'Experiencia inventada', sourceIndex: 0 }],
        },
      },
      hard
    );
    const cv = composeCV(hard, narrative);

    expect(adjustments).toHaveLength(3);
    expect(cv).not.toContain('Dirigió 50 personas');
    expect(cv).not.toContain('Sin referencia');
    expect(cv).not.toContain('Experiencia inventada');
  });

  it('falls back to the original wording when the reframing is empty', () => {
    const { narrative } = sanitizeNarrative(
      { highlights: { 'exp-0': [{ text: '', sourceIndex: 1 }] } },
      hard
    );

    expect(composeCV(hard, narrative)).toContain('• Lideró un equipo de 4 ingenieros');
  });

  it('keeps the original details for roles the model did not reshape', () => {
    const { narrative } = sanitizeNarrative(
      { highlights: { 'exp-0': [{ text: 'Diseñó microservicios', sourceIndex: 0 }] } },
      hard
    );

    expect(composeCV(hard, narrative)).toContain('• APIs REST con Express y PostgreSQL');
  });

  it('only prioritises skills the candidate actually has', () => {
    const { narrative, adjustments } = sanitizeNarrative({ skillsFirst: ['aws', 'Salesforce'] }, hard);
    const cv = composeCV(hard, narrative);

    expect(narrative.skillsFirst).toEqual(['AWS']);
    expect(adjustments.some(a => a.includes('Salesforce'))).toBe(true);
    expect(cv).toContain('AWS · TypeScript · Docker');
    expect(cv).not.toContain('Salesforce');
  });

  it('survives a response with no usable narrative at all', () => {
    const { narrative, adjustments } = sanitizeNarrative('texto suelto', hard);

    expect(adjustments).toEqual([]);
    expect(composeCV(hard, narrative)).toContain('Senior Backend Engineer — Mercado Libre');
  });
});

describe('language and formatting', () => {
  it('writes section headers in the language of the narrative', () => {
    const { narrative } = sanitizeNarrative({ language: 'en', summary: 'Backend engineer.' }, hard);
    const cv = composeCV(hard, narrative);

    expect(cv).toContain('\nEXPERIENCE\n');
    expect(cv).toContain('\nEDUCATION\n');
    expect(cv).not.toContain('EXPERIENCIA');
  });

  it('defaults to Spanish headers', () => {
    const { narrative } = sanitizeNarrative({}, hard);

    expect(composeCV(hard, narrative)).toContain('\nEXPERIENCIA\n');
  });

  it('does not repeat the field when the degree already names it', () => {
    const dup = buildHardData({
      ...row,
      education: JSON.stringify([
        { institution: 'Universidad de Chile', degree: 'Ingenieria Civil en Computacion', field: 'Computación', graduationDate: '2017' },
      ]),
    });
    const { narrative } = sanitizeNarrative({}, dup);
    const cv = composeCV(dup, narrative);

    expect(cv).toContain('Ingenieria Civil en Computacion, Universidad de Chile (2017)');
    expect(cv).not.toContain('— Computación');
  });
});

describe('normalizeExperience', () => {
  it('merges responsibilities and achievements and discards junk', () => {
    const result = normalizeExperience([
      {
        company: 'Acme',
        title: 'Dev',
        startDate: '2020',
        endDate: '2021',
        responsibilities: ['r1', 5, ''],
        achievements: ['a1'],
      },
      { foo: 'bar' },
      null,
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].details).toEqual(['r1', 'a1']);
  });
});
