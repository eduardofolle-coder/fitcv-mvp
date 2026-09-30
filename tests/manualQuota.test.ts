// El botón manual también gasta cupo: una vez por postulación y con el mismo tope que lo automático.
import { describe, it, expect, beforeAll } from 'vitest';

const RUN = Date.now();
const USER = `u-mq-${RUN}`;
let db: typeof import('../src/db/client.js')['db'];
let charge: typeof import('../src/services/planQuota.js')['chargeManualQuota'];

const postulation = async (n: number) => {
  const id = `mq-${RUN}-${n}`;
  await db.query(
    `INSERT INTO offers (id, title, company, level, source) VALUES ($1, 'Analista', 'ACME', 'L2', 'test') ON CONFLICT (id) DO NOTHING`,
    [`o-${RUN}-${n}`]
  );
  await db.query(`INSERT INTO postulations (id, userId, offerId) VALUES ($1, $2, $3)`, [id, USER, `o-${RUN}-${n}`]);
  return id;
};

beforeAll(async () => {
  ({ db } = await import('../src/db/client.js'));
  const { initializeSchema } = await import('../src/db/schema.js');
  ({ chargeManualQuota: charge } = await import('../src/services/planQuota.js'));
  await db.init();
  await initializeSchema();
  await db.query(`INSERT INTO users (id, email, passwordHash, plan) VALUES ($1, $2, 'x', 'free')`, [USER, `mq-${RUN}@test.dev`]);
});

describe('cuota del botón manual', () => {
  it('gasta un cupo por postulación y no cobra dos veces la misma', async () => {
    const first = await postulation(1);
    await charge(first, USER);
    await charge(first, USER); // reintento: no vuelve a cobrar

    const usage = await db.queryOne<{ quotaUsed: number }>('SELECT quotaUsed FROM plan_usage WHERE userId = $1', [USER]);
    expect(Number(usage?.quotaUsed)).toBe(1);
  });

  it('al agotar el cupo Free (8 de por vida) rechaza la siguiente', async () => {
    for (let n = 2; n <= 8; n++) await charge(await postulation(n), USER);
    await expect(charge(await postulation(9), USER)).rejects.toMatchObject({ statusCode: 403 });
  });
});
