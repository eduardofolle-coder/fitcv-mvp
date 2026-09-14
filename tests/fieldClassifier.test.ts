/**
 * Cada campo de un formulario tiene un dueño: el perfil, el candidato o la IA
 * con verificación. Estas pruebas fijan quién responde qué.
 */
import { describe, it, expect } from 'vitest';
import { buildHardData } from '../src/services/cvComposer.js';
import {
  classifyField,
  pickRangeOption,
  resolveDeterministic,
  type ApplicationField,
} from '../src/services/fieldClassifier.js';

const contact = { email: 'juan@example.com', phone: '+56 9 1234 5678', location: 'Santiago' };

const profileRow = (endDate: string) => ({
  fullName: 'Juan Perez',
  yearsExperience: 6,
  experience: JSON.stringify([
    {
      company: 'Mercado Libre',
      title: 'Senior Backend Engineer',
      startDate: '2021-01',
      endDate,
      details: ['Lideró un equipo de 4 ingenieros'],
    },
  ]),
  education: JSON.stringify([{ institution: 'Universidad de Chile', degree: 'Ingeniería Civil' }]),
  skills: JSON.stringify(['JavaScript', 'TypeScript', 'AWS']),
  languages: JSON.stringify([{ language: 'Inglés', proficiency: 'Avanzado' }]),
  certifications: '[]',
});

const hard = buildHardData(profileRow('2024-06'), contact);

const resolve = (label: string, extra: Partial<ApplicationField> = {}, data = hard) => {
  const field: ApplicationField = { id: 'f', label, ...extra };
  return resolveDeterministic(field, classifyField(field), data);
};

describe('hard data is copied from the profile', () => {
  it('fills contact details', () => {
    expect(resolve('Correo electrónico', { type: 'email' })).toMatchObject({ status: 'filled', value: 'juan@example.com' });
    expect(resolve('Teléfono celular')).toMatchObject({ status: 'filled', value: '+56 9 1234 5678' });
    expect(resolve('Comuna')).toMatchObject({ status: 'filled', value: 'Santiago' });
  });

  it('splits the name only when it can do so with certainty', () => {
    expect(resolve('Nombre')).toMatchObject({ status: 'filled', value: 'Juan Perez' });
    expect(resolve('Nombres')).toMatchObject({ status: 'filled', value: 'Juan' });
    expect(resolve('Apellido')).toMatchObject({ status: 'filled', value: 'Perez' });

    const fourNames = buildHardData({ ...profileRow('2024-06'), fullName: 'María José Pérez Soto' }, contact);
    expect(resolve('Apellidos', {}, fourNames)).toMatchObject({ status: 'needs-user', suggestion: 'María José Pérez Soto' });
  });

  it('answers total years, and picks the matching range', () => {
    expect(resolve('Años de experiencia')).toMatchObject({ status: 'filled', value: '6' });
    expect(resolve('Años de experiencia', { options: ['0-2', '3-5', '6-10', 'Más de 10'] })).toMatchObject({
      status: 'filled',
      value: '6-10',
    });
  });

  it('does not pass total years off as years in a specific technology', () => {
    expect(resolve('Años de experiencia en Java')).toMatchObject({ status: 'needs-user', category: 'unknown' });
  });

  it('does not claim a current job when the last one ended', () => {
    expect(resolve('Cargo actual')).toMatchObject({ status: 'needs-user' });

    const employed = buildHardData(profileRow('Presente'), contact);
    expect(resolve('Cargo actual', {}, employed)).toMatchObject({ status: 'filled', value: 'Senior Backend Engineer' });
  });

  it('reads language levels without upgrading them', () => {
    expect(resolve('Nivel de inglés', { options: ['Básico', 'Intermedio', 'Avanzado'] })).toMatchObject({
      status: 'filled',
      value: 'Avanzado',
    });
    expect(resolve('Nivel de inglés', { options: ['A1', 'B2', 'C1'] })).toMatchObject({
      status: 'needs-user',
      suggestion: 'Avanzado',
    });
  });

  it('writes education as free text but leaves level choices to the candidate', () => {
    expect(resolve('Universidad')).toMatchObject({ status: 'filled', value: 'Ingeniería Civil, Universidad de Chile' });
    expect(resolve('Nivel educacional', { options: ['Técnico', 'Universitaria completa'] })).toMatchObject({
      status: 'needs-user',
    });
  });
});

describe('personal decisions are never answered', () => {
  it.each([
    'Pretensión de renta líquida',
    '¿Tienes disponibilidad inmediata?',
    'RUT',
    'Nacionalidad',
    'Dirección',
  ])('%s', label => {
    expect(resolve(label)).toMatchObject({ status: 'needs-user', category: 'personal-decision' });
  });
});

describe('capability questions', () => {
  it('answers yes when the CV names the capability', () => {
    expect(resolve('¿Tienes experiencia en AWS?', { options: ['Sí', 'No'] })).toMatchObject({
      status: 'filled',
      value: 'Sí',
    });
  });

  it('never matches Java inside JavaScript', () => {
    const result = resolve('¿Tienes experiencia en Java?', { options: ['Sí', 'No'] });
    expect(result.status).not.toBe('filled');
    expect(result.status).toBe('needs-generation');
  });

  it('sends capabilities the CV does not name literally to verified drafting', () => {
    expect(resolve('¿Tienes experiencia liderando equipos?', { options: ['Sí', 'No'] })).toMatchObject({
      status: 'needs-generation',
      category: 'capability-check',
    });
  });
});

describe('routing', () => {
  it('uses the adapted CV for upload fields', () => {
    expect(resolve('Adjunta tu CV', { type: 'file' })).toMatchObject({ status: 'use-adapted-cv' });
  });

  it('drafts motivation and experience questions', () => {
    expect(resolve('¿Por qué quieres trabajar en NotCo?', { type: 'textarea' })).toMatchObject({
      status: 'needs-generation',
      category: 'motivation',
    });
    expect(resolve('Describe un proyecto del que estés orgulloso', { type: 'textarea' })).toMatchObject({
      status: 'needs-generation',
      category: 'experience-question',
    });
  });

  it('asks the candidate for anything it does not recognise', () => {
    expect(resolve('Enlace a tu portafolio')).toMatchObject({ status: 'needs-user', category: 'unknown' });
  });
});

describe('pickRangeOption', () => {
  it('reads common range formats', () => {
    expect(pickRangeOption(6, ['0-2', '3-5', '6-10'])).toBe('6-10');
    expect(pickRangeOption(12, ['0-5', 'Más de 10'])).toBe('Más de 10');
    expect(pickRangeOption(10, ['Más de 10', '10+'])).toBe('10+');
    expect(pickRangeOption(1, ['Menos de 2', '2-5'])).toBe('Menos de 2');
    expect(pickRangeOption(7, ['1-3', '4-6'])).toBeUndefined();
  });
});
