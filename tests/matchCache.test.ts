import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../src/db/client.js';
import { initializeSchema } from '../src/db/schema.js';
import { recomputeUserMatches, getCachedMatch } from '../src/services/matchCache.js';

const USER = 'u-match-cache-test';

describe('match cache', () => {
  beforeAll(async () => {
    await db.init();
    await initializeSchema();
    // Limpiar restos de corridas anteriores: este test no levanta su propio
    // servidor, así que podría reutilizar una base persistente en disco.
    await db.query('DELETE FROM user_match_cache WHERE userId = $1', [USER]);
    await db.query('DELETE FROM candidate_profiles WHERE userId = $1', [USER]);
    await db.query('DELETE FROM users WHERE id = $1', [USER]);
    await db.query('DELETE FROM offers WHERE id = ANY($1)', [['o-hit', 'o-miss']]);
    await db.query('INSERT INTO users (id, email, passwordHash) VALUES ($1, $2, $3)', [USER, 'mc@test.dev', 'x']);
    await db.query(
      `INSERT INTO candidate_profiles (id, userId, fullName, yearsExperience, education, skills, summary, experience)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['p-mc', USER, 'MC Test', 10, '[]', JSON.stringify({ tools: ['SAP'] }), null,
       JSON.stringify([{ title: 'Jefe de Logística y Abastecimiento', company: 'Acme' }])]
    );
    // Una oferta que calza (rol en el título) y una que no (sin término del perfil).
    await db.query(
      `INSERT INTO offers (id, title, company, level, source, description, searchText, publishedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,
      ['o-hit', 'Jefe de Logística y Abastecimiento', 'Acme', 'L4', 'test',
       'Buscamos jefe de logística con SAP y abastecimiento.', 'jefe logistica abastecimiento sap operaciones']
    );
    await db.query(
      `INSERT INTO offers (id, title, company, level, source, description, searchText, publishedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,
      ['o-miss', 'Vendedor tienda', 'Otra', 'L1', 'test', 'Atención de público.', 'vendedor tienda publico']
    );
  });

  it('recompute stores ranked + diagnosis, read serves them', async () => {
    expect(await getCachedMatch(USER)).toBeNull();

    await recomputeUserMatches(USER);
    const cached = await getCachedMatch(USER);

    expect(cached).not.toBeNull();
    // La oferta afín aparece; la irrelevante no es candidata (no comparte término).
    expect(cached!.ranked.some(r => r.offerId === 'o-hit')).toBe(true);
    expect(cached!.ranked.some(r => r.offerId === 'o-miss')).toBe(false);
    expect(cached!.ranked[0].tier).toBeDefined();
    expect(cached!.diagnosis!.matched).toBeGreaterThanOrEqual(1);
  });

  it('recompute clears the cache when the profile is gone', async () => {
    await db.query('DELETE FROM candidate_profiles WHERE userId = $1', [USER]);
    await recomputeUserMatches(USER);
    expect(await getCachedMatch(USER)).toBeNull();
  });
});
