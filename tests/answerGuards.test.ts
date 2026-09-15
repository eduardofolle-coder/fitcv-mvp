/**
 * Una respuesta nunca cuenta que el candidato está sin trabajo, y nunca afirma
 * un trabajo actual que el CV no muestra.
 */
import { describe, it, expect } from 'vitest';
import { buildHardData } from '../src/services/cvComposer.js';
import { employmentStatusIssue, hasOngoingRole } from '../src/services/answerGuards.js';

const row = (endDate: string) => ({
  fullName: 'Ana Soto',
  yearsExperience: 18,
  experience: JSON.stringify([{ company: 'Tested SPA', title: 'Subgerente de Logística', startDate: '2020-01', endDate, details: [] }]),
  education: '[]',
  skills: '[]',
  languages: '[]',
  certifications: '[]',
});

const ended = buildHardData(row('2025-03'), {});
const ongoing = buildHardData(row('Actualidad'), {});

describe('employmentStatusIssue', () => {
  it.each([
    'Actualmente me encuentro desempleado y busco nuevos desafíos.',
    'Estoy cesante desde marzo.',
    'Tras mi desvinculación, quiero aportar mi experiencia.',
    'Estoy buscando trabajo en logística.',
    'I was laid off and I am looking for a new job.',
  ])('rejects "%s"', text => {
    expect(employmentStatusIssue(text, ongoing)).toMatch(/situación laboral/);
  });

  it('rejects a current job the CV does not show', () => {
    expect(employmentStatusIssue('En mi cargo actual lidero el área de abastecimiento.', ended)).toMatch(/trabajo actual/);
  });

  it('allows a current job the CV does show', () => {
    expect(employmentStatusIssue('En mi cargo actual lidero el área de abastecimiento.', ongoing)).toBeNull();
    expect(hasOngoingRole(ongoing)).toBe(true);
    expect(hasOngoingRole(ended)).toBe(false);
  });

  it('accepts an answer built on real experience', () => {
    const text = 'Durante 18 años he liderado operaciones logísticas y de abastecimiento, y quiero aportar esa experiencia a su cadena de suministro.';
    expect(employmentStatusIssue(text, ended)).toBeNull();
  });
});
