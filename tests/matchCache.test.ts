import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/db/client.js';
import { initializeSchema } from '../src/db/schema.js';
import { recomputeUserMatches, getCachedMatch } from '../src/services/matchCache.js';

// Ids únicos por corrida y limpieza al final: la base local es compartida y esta prueba fallaba
// en toda corrida posterior a la primera (usuario con id fijo que nunca se borraba).
const RUN = Date.now();
const USER = `u-match-cache-${RUN}`;
const PROFILE = `p-mc-${RUN}`;
const HIT = `o-hit-${RUN}`;
const MISS = `o-miss-${RUN}`;

describe('match cache', () => {
  beforeAll(async () => {
    await db.init();
    await initializeSchema();
    // Restos de las versiones anteriores de esta prueba, que usaban ids fijos.
    await db.query(`DELETE FROM users WHERE id = 'u-match-cache-test'`);
    await db.query(`DELETE FROM offers WHERE id IN ('o-hit', 'o-miss')`);

    await db.query('INSERT INTO users (id, email, passwordHash) VALUES ($1, $2, $3)', [USER, `mc-${RUN}@test.dev`, 'x']);
    await db.query(
      `INSERT INTO candidate_profiles (id, userId, fullName, yearsExperience, education, skills, summary, experience)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [PROFILE, USER, 'MC Test', 10, '[]', JSON.stringify({ tools: ['SAP'] }), null,
       JSON.stringify([{ title: 'Jefe de Logística y Abastecimiento', company: 'Acme' }])]
    );
    // Una oferta que calza (rol en el título) y una que no (sin término del perfil).
    await db.query(
      `INSERT INTO offers (id, title, company, level, source, description, searchText, publishedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,
      [HIT, 'Jefe de Logística y Abastecimiento', 'Acme', 'L4', 'test',
       'Buscamos jefe de logística con SAP y abastecimiento.', 'jefe logistica abastecimiento sap operaciones']
    );
    await db.query(
      `INSERT INTO offers (id, title, company, level, source, description, searchText, publishedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,
      [MISS, 'Vendedor tienda', 'Otra', 'L1', 'test', 'Atención de público.', 'vendedor tienda publico']
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM users WHERE id = $1', [USER]); // el perfil y la caché cuelgan en cascada
    await db.query('DELETE FROM offers WHERE id IN ($1, $2)', [HIT, MISS]);
  });

  it('recompute stores ranked + diagnosis, read serves them', async () => {
    expect(await getCachedMatch(USER)).toBeNull();

    await recomputeUserMatches(USER);
    const cached = await getCachedMatch(USER);

    expect(cached).not.toBeNull();
    // La oferta afín aparece; la irrelevante no es candidata (no comparte término).
    expect(cached!.ranked.some(r => r.offerId === HIT)).toBe(true);
    expect(cached!.ranked.some(r => r.offerId === MISS)).toBe(false);
    expect(cached!.ranked[0].tier).toBeDefined();
    expect(cached!.diagnosis!.matched).toBeGreaterThanOrEqual(1);
  });

  it('recompute clears the cache when the profile is gone', async () => {
    await db.query('DELETE FROM candidate_profiles WHERE userId = $1', [USER]);
    await recomputeUserMatches(USER);
    expect(await getCachedMatch(USER)).toBeNull();
  });
});
