// LinkedIn va incluido solo en Max: fuera de ese plan no se encola ni sale de la cola.
import { describe, it, expect, beforeAll } from 'vitest';

const RUN = Date.now();
const PRO = `u-pp-pro-${RUN}`;
const MAX = `u-pp-max-${RUN}`;
let db: typeof import('../src/db/client.js')['db'];
let mod: {
  queueApplication: typeof import('../src/services/applicationQueue.js')['queueApplication'];
  queuePolicy: typeof import('../src/services/portalHealth.js')['queuePolicy'];
  planAllowsPortal: typeof import('../src/services/planQuota.js')['planAllowsPortal'];
};

const linkedinPostulation = async (userId: string, n: string) => {
  await db.query(
    `INSERT INTO offers (id, title, company, level, source) VALUES ($1, 'Analista', 'ACME', 'L2', 'linkedin')`,
    [`o-pp-${n}-${RUN}`]
  );
  await db.query(`INSERT INTO postulations (id, userId, offerId) VALUES ($1, $2, $3)`, [`p-pp-${n}-${RUN}`, userId, `o-pp-${n}-${RUN}`]);
  return `p-pp-${n}-${RUN}`;
};

beforeAll(async () => {
  ({ db } = await import('../src/db/client.js'));
  const { initializeSchema } = await import('../src/db/schema.js');
  mod = {
    queueApplication: (await import('../src/services/applicationQueue.js')).queueApplication,
    queuePolicy: (await import('../src/services/portalHealth.js')).queuePolicy,
    planAllowsPortal: (await import('../src/services/planQuota.js')).planAllowsPortal,
  };
  await db.init();
  await initializeSchema();
  for (const [id, plan] of [[PRO, 'pro'], [MAX, 'max']]) {
    await db.query(`INSERT INTO users (id, email, passwordHash, plan) VALUES ($1, $2, 'x', $3)`, [id, `${id}@test.dev`, plan]);
  }
});

describe('LinkedIn solo en Max', () => {
  it('planAllowsPortal: LinkedIn solo con Max; los demás portales con cualquier plan', () => {
    expect(mod.planAllowsPortal('max', 'linkedin')).toBe(true);
    expect(mod.planAllowsPortal('pro', 'linkedin')).toBe(false);
    expect(mod.planAllowsPortal('free', 'linkedin')).toBe(false);
    expect(mod.planAllowsPortal('free', 'getonbrd')).toBe(true);
  });

  it('un Pro no puede encolar una oferta de LinkedIn', async () => {
    const id = await linkedinPostulation(PRO, 'pro');
    await expect(mod.queueApplication(id, PRO)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('un Max sí la encola', async () => {
    const id = await linkedinPostulation(MAX, 'max');
    expect((await mod.queueApplication(id, MAX)).to).toBe('en-cola');
  });

  it('la cola salta LinkedIn para un Pro y no para un Max', async () => {
    expect((await mod.queuePolicy(PRO)).skip).toContain('linkedin');
    expect((await mod.queuePolicy(MAX)).skip).not.toContain('linkedin');
  });
});
