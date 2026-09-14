/**
 * El adaptador puede orientar la historia, pero no afirmar más de lo que dice
 * el CV. Estas pruebas fijan cómo se detecta y cómo se repara.
 */
import { describe, it, expect } from 'vitest';
import { buildHardData, sanitizeNarrative } from '../src/services/cvComposer.js';
import {
  applyVerdicts,
  mechanicalCheck,
  ungroundedNumbers,
  verifierInput,
} from '../src/services/narrativeVerifier.js';

const hard = buildHardData(
  {
    fullName: 'Juan Perez',
    yearsExperience: 6,
    experience: JSON.stringify([
      {
        company: 'Mercado Libre',
        title: 'Senior Backend Engineer',
        startDate: '2021-01',
        endDate: '2024-06',
        details: ['Migración de monolito a AWS', 'Lideró un equipo de 4 ingenieros'],
      },
    ]),
    education: '[]',
    skills: JSON.stringify(['AWS']),
    languages: '[]',
    certifications: '[]',
  },
  { email: 'juan@example.com', phone: '+56 9 1234 5678', location: 'Santiago' }
);

const narrate = (raw: unknown) => sanitizeNarrative(raw, hard).narrative;

describe('ungroundedNumbers', () => {
  it('flags figures the source does not contain', () => {
    expect(ungroundedNumbers('Lideró un equipo de 12 ingenieros', 'Lideró un equipo de 4 ingenieros')).toEqual(['12']);
  });

  it('accepts figures the source does contain', () => {
    expect(ungroundedNumbers('Formó y lideró a 4 ingenieros', 'Lideró un equipo de 4 ingenieros')).toEqual([]);
  });
});

describe('mechanicalCheck', () => {
  it('restores the original wording when a highlight adds a figure', () => {
    const { narrative, adjustments } = mechanicalCheck(
      narrate({ highlights: { 'exp-0': [{ text: 'Lideró un equipo de 15 ingenieros', sourceIndex: 1 }] } }),
      hard
    );

    expect(narrative.highlights['exp-0'][0].text).toBe('Lideró un equipo de 4 ingenieros');
    expect(adjustments[0]).toContain('15');
  });

  it('keeps a highlight whose figures all come from the original', () => {
    const { narrative, adjustments } = mechanicalCheck(
      narrate({ highlights: { 'exp-0': [{ text: 'Formó y lideró a 4 ingenieros', sourceIndex: 1 }] } }),
      hard
    );

    expect(narrative.highlights['exp-0'][0].text).toBe('Formó y lideró a 4 ingenieros');
    expect(adjustments).toEqual([]);
  });

  it('drops a summary that invents years of experience', () => {
    const { narrative } = mechanicalCheck(narrate({ summary: 'Ingeniero con 10 años de experiencia.' }), hard);

    expect(narrative.summary).toBe('');
  });

  it('keeps a summary whose figures come from the record', () => {
    const { narrative } = mechanicalCheck(narrate({ summary: 'Ingeniero con 6 años de experiencia.' }), hard);

    expect(narrative.summary).toBe('Ingeniero con 6 años de experiencia.');
  });
});

describe('verifierInput', () => {
  it('sends only reworded highlights, and never personal details', () => {
    const input = verifierInput(
      narrate({
        headline: 'Backend orientado a cloud',
        highlights: {
          'exp-0': [
            { text: 'Migración de monolito a AWS', sourceIndex: 0 },
            { text: 'Formó y lideró a 4 ingenieros', sourceIndex: 1 },
          ],
        },
      }),
      hard
    );

    expect(input.highlights).toEqual([
      { id: 'exp-0#1', original: 'Lideró un equipo de 4 ingenieros', rewritten: 'Formó y lideró a 4 ingenieros' },
    ]);
    expect(input.statements).toEqual([{ id: 'headline', text: 'Backend orientado a cloud' }]);

    const payload = JSON.stringify(input);
    expect(payload).not.toContain('Juan Perez');
    expect(payload).not.toContain('juan@example.com');
  });
});

describe('applyVerdicts', () => {
  const narrative = narrate({
    headline: 'Backend orientado a cloud',
    summary: 'Ingeniero backend.',
    highlights: {
      'exp-0': [
        { text: 'Lideró la migración de monolito a AWS', sourceIndex: 0 },
        { text: 'Formó y lideró a 4 ingenieros', sourceIndex: 1 },
      ],
    },
  });

  it('keeps what the verifier supports and restores what it flags', () => {
    const { narrative: out, adjustments } = applyVerdicts(narrative, hard, {
      highlights: [
        { id: 'exp-0#0', verdict: 'inflated', reason: 'Atribuye liderazgo que el CV no menciona.' },
        { id: 'exp-0#1', verdict: 'supported' },
      ],
      statements: [
        { id: 'headline', verdict: 'supported' },
        { id: 'summary', verdict: 'supported' },
      ],
    });

    expect(out.highlights['exp-0'][0].text).toBe('Migración de monolito a AWS');
    expect(out.highlights['exp-0'][1].text).toBe('Formó y lideró a 4 ingenieros');
    expect(out.headline).toBe('Backend orientado a cloud');
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toContain('Atribuye liderazgo que el CV no menciona.');
  });

  it('treats a missing verdict as not verified', () => {
    const { narrative: out } = applyVerdicts(narrative, hard, {
      highlights: [{ id: 'exp-0#0', verdict: 'supported' }],
      statements: [{ id: 'headline', verdict: 'supported' }],
    });

    expect(out.highlights['exp-0'][1].text).toBe('Lideró un equipo de 4 ingenieros');
    expect(out.summary).toBe('');
    expect(out.headline).toBe('Backend orientado a cloud');
  });

  it('accepts only an unambiguous "supported"', () => {
    const { narrative: out } = applyVerdicts(narrative, hard, {
      highlights: [
        { id: 'exp-0#0', verdict: 'mostly supported' },
        { id: 'exp-0#1', verdict: 'SUPPORTED' },
      ],
      statements: [],
    });

    expect(out.highlights['exp-0'][0].text).toBe('Migración de monolito a AWS');
    expect(out.highlights['exp-0'][1].text).toBe('Formó y lideró a 4 ingenieros');
    expect(out.headline).toBe('');
  });
});
