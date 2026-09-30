// LinkedIn restringe cuentas por volumen: al llegar al tope de 24 h, su cola espera.
import { describe, it, expect, beforeAll } from 'vitest';

const RUN = Date.now();
const USER = `u-cap-${RUN}`;
let db: typeof import('../src/db/client.js')['db'];
let policy: typeof import('../src/services/portalHealth.js')['queuePolicy'];
let cap: number;

const claim = async (n: number, hoursAgo: number) => {
  await db.query(
    `INSERT INTO offers (id, title, company, level, source) VALUES ($1, 'Analista', 'ACME', 'L2', 'linkedin')`,
    [`o-cap-${RUN}-${n}`]
  );
  await db.query(
    `INSERT INTO postulations (id, userId, offerId, applyClaimedAt) VALUES ($1, $2, $3, CURRENT_TIMESTAMP - make_interval(hours => $4))`,
    [`p-cap-${RUN}-${n}`, USER, `o-cap-${RUN}-${n}`, hoursAgo]
  );
};

beforeAll(async () => {
  ({ db } = await import('../src/db/client.js'));
  const { initializeSchema } = await import('../src/db/schema.js');
  const health = await import('../src/services/portalHealth.js');
  policy = health.queuePolicy;
  cap = health.PORTAL_DAILY_CAP.linkedin;
  await db.init();
  await initializeSchema();
  await db.query(`INSERT INTO users (id, email, passwordHash, plan) VALUES ($1, $2, 'x', 'pro')`, [USER, `cap-${RUN}@test.dev`]);
});

describe('tope diario de LinkedIn', () => {
  it('bajo el tope, LinkedIn sigue en la cola', async () => {
    for (let n = 1; n < cap; n++) await claim(n, 1);
    expect((await policy(USER)).skip).not.toContain('linkedin');
  });

  it('al llegar al tope en 24 h, LinkedIn espera', async () => {
    await claim(cap, 2);
    expect((await policy(USER)).skip).toContain('linkedin');
  });

  it('lo tomado hace más de 24 h ya no cuenta', async () => {
    await db.query(`UPDATE postulations SET applyClaimedAt = CURRENT_TIMESTAMP - INTERVAL '30 hours' WHERE userId = $1`, [USER]);
    expect((await policy(USER)).skip).not.toContain('linkedin');
  });
});
