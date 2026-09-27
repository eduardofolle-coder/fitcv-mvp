import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../src/db/client.js';
import { initializeSchema } from '../src/db/schema.js';
import { updateAnswerPreferences } from '../src/services/savedAnswers.js';
import { approveInbox, discardInbox, isBatchDue, listInbox, releaseDueBatches, runDueBatches } from '../src/services/sendInbox.js';

describe('cuándo sale la tanda', () => {
  // 2026-09-27 12:00 UTC = 09:00 en Chile (UTC-3).
  const nine = new Date('2026-09-27T12:00:00Z');

  it('una al día, a la hora del análisis, nunca dos veces el mismo día', () => {
    expect(isBatchDue({ batchEveryHours: null, dailyAnalysisHour: 9, lastBatchAt: null }, nine)).toBe(true);
    expect(isBatchDue({ batchEveryHours: null, dailyAnalysisHour: 10, lastBatchAt: null }, nine)).toBe(false);
    expect(isBatchDue({ batchEveryHours: null, dailyAnalysisHour: 9, lastBatchAt: '2026-09-27T12:00:00Z' }, new Date('2026-09-27T20:00:00Z'))).toBe(false);
    expect(isBatchDue({ batchEveryHours: null, dailyAnalysisHour: 9, lastBatchAt: '2026-09-26T12:00:00Z' }, nine)).toBe(true);
    expect(isBatchDue({ batchEveryHours: null, dailyAnalysisHour: null, lastBatchAt: null }, nine)).toBe(false);
  });

  it('o cada N horas', () => {
    expect(isBatchDue({ batchEveryHours: 4, dailyAnalysisHour: null, lastBatchAt: '2026-09-27T09:00:00Z' }, nine)).toBe(false);
    expect(isBatchDue({ batchEveryHours: 4, dailyAnalysisHour: null, lastBatchAt: '2026-09-27T08:00:00Z' }, nine)).toBe(true);
  });
});

describe('bandeja "Por enviar"', () => {
  const RUN = Date.now();
  const offerIds = [1, 2, 3, 4].map(n => `o-inbox-${n}-${RUN}`);
  const statusOf = async (userId: string, offerId: string) =>
    (await db.queryOne<{ applyStatus: string }>('SELECT applyStatus FROM postulations WHERE userId = $1 AND offerId = $2', [userId, offerId]))?.applyStatus ?? null;
  const idOf = async (userId: string, offerId: string) =>
    (await db.queryOne<{ id: string }>('SELECT id FROM postulations WHERE userId = $1 AND offerId = $2', [userId, offerId]))!.id;
  const quotaUsed = async (userId: string) =>
    Number((await db.queryOne<{ quotaUsed: number }>('SELECT quotaUsed FROM plan_usage WHERE userId = $1', [userId]))?.quotaUsed ?? 0);

  async function candidate(tag: string, sendMode: string) {
    const userId = `u-inbox-${tag}-${RUN}`;
    await db.query(`INSERT INTO users (id, email, passwordHash, plan) VALUES ($1, $2, 'x', 'max')`, [userId, `${tag}-${RUN}@test.dev`]);
    const ranked = offerIds.map(offerId => ({ offerId, score: 80, tier: 'alto', reasons: [] }));
    await db.query(`INSERT INTO user_match_cache (userId, ranked, tierCounts) VALUES ($1, $2, '{}')`, [userId, JSON.stringify(ranked)]);
    await updateAnswerPreferences(userId, { sendMode, batchEveryHours: 4 });
    return userId;
  }

  beforeAll(async () => {
    await db.init();
    await initializeSchema();
    for (const id of offerIds) {
      await db.query(
        `INSERT INTO offers (id, title, company, level, source, description, location, publishedAt)
         VALUES ($1, 'Analista', 'Acme', 'L2', 'test', 'Oferta.', 'Santiago, RM', CURRENT_TIMESTAMP)`,
        [id]
      );
    }
  });

  it('con revisión: la tanda espera, lo descartado no sale ni gasta cupo, y el resto sale solo al vencer el plazo', async () => {
    const user = await candidate('rev', 'revision');
    const now = new Date();
    await runDueBatches(now);

    const inbox = await listInbox(user);
    expect(inbox).toHaveLength(4);
    expect(inbox.every(item => item.reviewUntil !== null)).toBe(true);
    expect(await quotaUsed(user)).toBe(4);
    const notice = await db.queryOne<{ title: string }>(`SELECT title FROM notifications WHERE userId = $1 AND kind = 'tanda-por-enviar'`, [user]);
    expect(notice?.title).toMatch(/Tu tanda de 4 postulaciones sale a las/);

    expect(await discardInbox(user, [await idOf(user, offerIds[0])], 'empresa')).toBe(1);
    expect(await statusOf(user, offerIds[0])).toBe('pendiente');
    expect(await quotaUsed(user)).toBe(3);

    expect(await approveInbox(user, [await idOf(user, offerIds[1])])).toBe(1);
    expect(await statusOf(user, offerIds[1])).toBe('en-cola'); // aprobada: sale ya

    await releaseDueBatches(now); // todavía dentro del plazo
    expect(await statusOf(user, offerIds[2])).toBe('por-enviar');

    await releaseDueBatches(new Date(now.getTime() + 4 * 3_600_000));
    expect(await statusOf(user, offerIds[2])).toBe('en-cola');
    expect(await statusOf(user, offerIds[3])).toBe('en-cola');
    expect(await statusOf(user, offerIds[0])).toBe('pendiente'); // lo descartado no vuelve
  });

  it('manual: nada sale sin aprobación', async () => {
    const user = await candidate('man', 'manual');
    const now = new Date();
    await runDueBatches(now);
    await releaseDueBatches(new Date(now.getTime() + 48 * 3_600_000));
    expect(await statusOf(user, offerIds[0])).toBe('por-enviar');

    await updateAnswerPreferences(user, { sendMode: 'automatico' });
    await releaseDueBatches(now); // al pasar a automático, lo que esperaba sale
    expect(await statusOf(user, offerIds[0])).toBe('en-cola');
  });

  it('solo actúa sobre lo que sigue en la bandeja y valida el motivo', async () => {
    await expect(discardInbox('nadie', ['x'], 'porque si')).rejects.toThrow(/reason/);
    expect(await approveInbox('nadie', ['no-existe'])).toBe(0);
  });
});
