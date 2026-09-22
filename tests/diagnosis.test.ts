/**
 * El diagnóstico compara el CV del candidato contra lo que piden las ofertas.
 * Si `offerTopics` deja pasar palabras de nivel ("analista") o de relleno, o si
 * `profileCovers` no reconoce una variante, el candidato ve como "vacío de su
 * CV" algo que su CV sí dice. Eso es decirle una falsedad sobre sí mismo, así
 * que estas dos funciones se prueban aparte de la base de datos.
 */
import { describe, it, expect } from 'vitest';
import { buildMatchingProfile, offerTopics, profileCovers } from '../src/services/offerMatching.js';

const offer = {
  title: 'Analista de Logística Senior',
  description: 'Buscamos apoyo en control de inventarios y gestión de proveedores. Manejo de SAP.',
};

describe('offerTopics', () => {
  const topics = offerTopics(offer);

  it('picks up the areas the offer names, in the market wording', () => {
    expect(topics).toContain('logística');
    expect(topics).toContain('bodega'); // "inventarios" es de esa familia
    expect(topics).toContain('proveedores');
  });

  it('drops seniority words and filler: they match every offer and say nothing', () => {
    expect(topics).not.toContain('analista');
    expect(topics).not.toContain('senior');
    expect(topics).not.toContain('de');
  });

  it('names each area once, whatever grafía trae el título', () => {
    // "Jefe de Logística" devolvía antes el área 'logística' y además el token
    // 'Logística' del título: el candidato veía el mismo tema dos veces.
    const topics = offerTopics({ title: 'Jefe de Logística', description: 'Operaciones logísticas' });
    const areas = topics.filter(t => t.toLowerCase().startsWith('log'));
    expect(areas).toEqual(['logística']);
  });

  it('survives an offer with no title or description', () => {
    expect(offerTopics({ title: null, description: null })).toEqual([]);
  });
});

describe('profileCovers', () => {
  const profile = buildMatchingProfile({
    yearsExperience: 7,
    experience: [{ title: 'Encargado de Bodega' }],
    education: [{ degree: 'Ingeniería', field: 'Logística' }],
    skills: { tools: ['SAP'], soft: ['trabajo en equipo'] },
  });

  it('recognises an area the CV names through its synonyms', () => {
    // El CV dice "Bodega"; la oferta pide "inventarios". Es lo mismo.
    expect(profileCovers(profile, 'bodega')).toBe(true);
    expect(profileCovers(profile, 'logística')).toBe(true);
  });

  it('recognises a hard skill written with different case', () => {
    expect(profileCovers(profile, 'sap')).toBe(true);
  });

  it('does not claim coverage of something the CV never mentions', () => {
    expect(profileCovers(profile, 'enfermería')).toBe(false);
    expect(profileCovers(profile, 'contabilidad')).toBe(false);
  });
});
