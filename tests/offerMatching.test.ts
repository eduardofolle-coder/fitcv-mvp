/**
 * Las ofertas que ve el candidato tienen que ser de su perfil. El fixture es un
 * perfil real de logística y comercio exterior; las ofertas, títulos reales de
 * los portales.
 */
import { describe, it, expect } from 'vitest';
import {
  buildMatchingProfile,
  likePatterns,
  offerSearchColumns,
  scoreOffer,
  searchable,
  slugPriority,
} from '../src/services/offerMatching.js';

const logistics = buildMatchingProfile({
  yearsExperience: 18,
  experience: [
    { title: 'Subgerente de Logística y Abastecimiento' },
    { title: 'Supply Chain Analyst' },
    { title: 'Supervisor de Operaciones' },
    { title: 'Asesor en Comercio Exterior y Transporte Internacional (honorarios)' },
  ],
  education: [
    { degree: 'Ingeniería en Logística (egresado)', field: 'Logística' },
    { degree: 'Técnico en Comercio Exterior', field: 'Comercio Exterior' },
  ],
  skills: { programming: [], tools: ['SAP', 'Flexline'], soft: ['Capacidad analítica', 'Liderazgo de proyectos'] },
  summary: 'Profesional con más de 18 años de experiencia en logística, comercio exterior, supply chain y operaciones, con gestión de procesos.',
});

const developer = buildMatchingProfile({
  yearsExperience: 6,
  experience: [{ title: 'Senior Backend Engineer' }, { title: 'Desarrollador de Software' }],
  skills: { programming: ['TypeScript', 'Java'], frameworks: ['Node.js'], tools: ['AWS'] },
});

const offer = (title: string, description = '') => ({ title, description });

describe('buildMatchingProfile', () => {
  it('keeps the areas and hard skills of the CV', () => {
    expect(logistics.terms.map(t => t.display)).toEqual(
      expect.arrayContaining(['logística', 'abastecimiento', 'supply chain', 'operaciones', 'comercio exterior', 'SAP', 'Flexline'])
    );
  });

  it('ignores seniority words, study paperwork, soft skills and generic summary words', () => {
    const keys = logistics.terms.map(t => t.key);
    for (const word of ['subgerente', 'supervisor', 'honorarios', 'egresado', 'ingenieria', 'gestion', 'procesos']) {
      expect(keys).not.toContain(word);
    }
    expect(keys.some(k => k.includes('capacidad') || k.includes('liderazgo'))).toBe(false);
  });

  it('ignores school studies, scope adjectives and English job levels', () => {
    // Visto con un perfil real: "Enseñanza Media", "Nacionales" y "Analyst" terminaban como áreas.
    const noisy = buildMatchingProfile({
      experience: [{ title: 'Supply Chain Analyst' }, { title: 'Ejecutivo de Ventas Nacionales e Internacionales' }],
      education: [{ degree: 'Enseñanza Media Científico Humanista' }],
    });
    const keys = noisy.terms.map(t => t.key);
    for (const word of ['analyst', 'ensenanza', 'media', 'nacionales', 'internacionales', 'cientifico', 'humanista']) {
      expect(keys).not.toContain(word);
    }
    expect(keys).toEqual(expect.arrayContaining(['supply chain', 'ventas']));
  });

  it('weighs areas the candidate repeated across roles and studies above one-off mentions', () => {
    const weight = (display: string) => logistics.terms.find(t => t.display === display)?.weight ?? 0;
    expect(weight('logística')).toBeGreaterThan(weight('transporte internacional'));
  });
});

describe('scoreOffer', () => {
  const jefe = scoreOffer(offer('Jefe de Logística y Abastecimiento', 'Buscamos profesional con experiencia en compras, importaciones y SAP.'), logistics);
  const analyst = scoreOffer(offer('Analista de Supply Chain', 'Control de inventarios en bodega.'), logistics);
  const cajero = scoreOffer(offer('Cajero(a)/Garzón(a)/Tomador(a) de Pedidos - Iquique', 'Atención de público y caja.'), logistics);
  const backend = scoreOffer(offer('Desarrollador Senior Back-end Cloud', 'Node.js, AWS y microservicios.'), logistics);

  it('recommends offers in the candidate area and drops unrelated ones', () => {
    expect(jefe.recommended).toBe(true);
    expect(analyst.recommended).toBe(true);
    expect(cajero.recommended).toBe(false);
    expect(backend.recommended).toBe(false);
  });

  it('labels each match high, medium or low', () => {
    expect(['alto', 'medio', 'bajo']).toContain(jefe.tier);
    expect(jefe.tier).toBe(jefe.score >= 60 ? 'alto' : jefe.score >= 35 ? 'medio' : 'bajo');
  });

  it('ranks a title that names several areas of the CV first, and says why', () => {
    expect(jefe.score).toBeGreaterThan(analyst.score);
    expect(jefe.reasons).toEqual(expect.arrayContaining(['logística', 'abastecimiento']));
  });

  it('recognises synonyms, accents and word variants', () => {
    expect(scoreOffer(offer('Logístico de centro de distribución'), logistics).recommended).toBe(true);
    expect(scoreOffer(offer('Encargado de Importaciones y Aduanas'), logistics).reasons).toContain('comercio exterior');
    expect(scoreOffer(offer('Procurement Specialist'), logistics).reasons).toContain('abastecimiento');
  });

  it('does not offer an internship to someone with 18 years of experience', () => {
    expect(scoreOffer(offer('Práctica profesional en logística'), logistics).recommended).toBe(false);
  });

  it('matches whole words, so Java is not JavaScript', () => {
    const javaScriptOnly = scoreOffer(offer('Frontend JavaScript', 'React y JavaScript'), buildMatchingProfile({ skills: { programming: ['Java'] } }));
    expect(javaScriptOnly.reasons).not.toContain('Java');
  });

  it('works for any profile, not only logistics', () => {
    expect(scoreOffer(offer('Desarrollador Senior Back-end Cloud', 'Node.js, AWS y microservicios.'), developer).recommended).toBe(true);
    expect(scoreOffer(offer('Jefe de Logística y Abastecimiento'), developer).recommended).toBe(false);
  });
});

describe('helpers for search and crawling', () => {
  it('prioritises offer links that name the candidate areas', () => {
    expect(slugPriority('https://www.chiletrabajos.cl/trabajo/jefe-de-logistica-y-abastecimiento-3868000', logistics.terms)).toBeGreaterThanOrEqual(2);
    expect(slugPriority('https://www.chiletrabajos.cl/trabajo/conserje-nochero-sabado-y-domingo-3868379', logistics.terms)).toBe(0);
  });

  it('narrows candidates in SQL with accent-free patterns', () => {
    expect(likePatterns(logistics)).toEqual(expect.arrayContaining(['%logistic%', '%supply chain%', '%sap%']));
  });

  it('stores searchable columns without accents', () => {
    expect(offerSearchColumns({ title: 'Jefe de Logística', company: 'Clínica', description: 'Gestión' })).toEqual({
      searchTitle: 'jefe de logistica',
      searchText: 'jefe de logistica clinica gestion',
    });
    expect(searchable('Node.js, C++ y C#.')).toBe('node.js c++ y c#');
  });
});
