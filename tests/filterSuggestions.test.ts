import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../src/db/client.js';
import { initializeSchema } from '../src/db/schema.js';
import { answerSuggestion, listSuggestions } from '../src/services/filterSuggestions.js';
import { loadAnswerPreferences, updateAnswerPreferences } from '../src/services/savedAnswers.js';
import { discardInbox } from '../src/services/sendInbox.js';

describe('aprender de los descartes', () => {
  const RUN = Date.now();
  const USER = `u-sug-${RUN}`;
  let n = 0;

  /** Una oferta en la bandeja del candidato; devuelve el id de la postulación. */
  async function inInbox(title: string, company: string, location: string, status = 'por-enviar') {
    n++;
    const offerId = `o-sug-${n}-${RUN}`;
    await db.query(
      `INSERT INTO offers (id, title, company, level, source, description, location) VALUES ($1, $2, $3, 'L2', 'test', 'Oferta.', $4)`,
      [offerId, title, company, location]
    );
    const id = `p-sug-${n}-${RUN}`;
    await db.query(
      `INSERT INTO postulations (id, userId, offerId, source, applyStatus) VALUES ($1, $2, $3, 'auto', $4)`,
      [id, USER, offerId, status]
    );
    return id;
  }

  beforeAll(async () => {
    await db.init();
    await initializeSchema();
    await db.query(`INSERT INTO users (id, email, passwordHash, plan) VALUES ($1, $2, 'x', 'max')`, [USER, `sug-${RUN}@test.dev`]);
    await updateAnswerPreferences(USER, { sendMode: 'revision' });
    await inInbox('Jefe de Logística', 'Acme', 'Santiago, RM', 'enviada'); // "logística" es lo suyo
  });

  it('no sugiere nada con un solo descarte', async () => {
    await discardInbox(USER, [await inInbox('Analista', 'Minera Uno', 'Calama, Antofagasta')], 'ubicacion');
    expect(await listSuggestions(USER)).toEqual([]);
  });

  it('sugiere la región, la empresa y la palabra cuando el patrón se repite, nunca lo suyo', async () => {
    await discardInbox(USER, [await inInbox('Analista', 'Minera Dos', 'Antofagasta, AN'), await inInbox('Analista', 'Minera Tres', 'Mejillones, Antofagasta')], 'ubicacion');
    await discardInbox(USER, [await inInbox('Analista', 'Retail SpA', 'Santiago, RM'), await inInbox('Asistente', 'Retail SpA', 'Santiago, RM')], 'empresa');
    await discardInbox(USER, [
      await inInbox('Vendedor de Logística', 'A', 'Santiago, RM'),
      await inInbox('Vendedor Terreno Logística', 'B', 'Santiago, RM'),
      await inInbox('Vendedor Logística Senior', 'C', 'Santiago, RM'),
    ], 'cargo');

    const suggestions = await listSuggestions(USER);
    expect(suggestions.map(s => `${s.kind}:${s.value}`).sort()).toEqual(['empresa:Retail SpA', 'palabra:vendedor', 'region:AN']);
    expect(suggestions.find(s => s.kind === 'region')!.text).toMatch(/3 ofertas en Antofagasta/);
  });

  it('aceptar aplica el filtro; rechazar no lo aplica y no se vuelve a sugerir', async () => {
    const [region] = (await listSuggestions(USER)).filter(s => s.kind === 'region');
    await answerSuggestion(USER, region.id, true);
    const prefs = await loadAnswerPreferences(USER);
    expect(prefs.workRegions).toHaveLength(15);
    expect(prefs.workRegions).not.toContain('AN');

    const [word] = (await listSuggestions(USER)).filter(s => s.kind === 'palabra');
    await answerSuggestion(USER, word.id, false);
    expect((await loadAnswerPreferences(USER)).excludedWords).toBeNull();

    // Otro descarte del mismo tipo no revive la sugerencia rechazada.
    await discardInbox(USER, [await inInbox('Vendedor Retail', 'D', 'Santiago, RM')], 'cargo');
    expect((await listSuggestions(USER)).map(s => s.kind)).toEqual(['empresa']);
  });
});

describe('aprender de los descartes por renta', () => {
  const RUN = Date.now();
  const USER = `u-renta-${RUN}`;
  let n = 0;

  async function discardForPay(salaryMax: number | null) {
    n++;
    const offerId = `o-renta-${n}-${RUN}`;
    await db.query(
      `INSERT INTO offers (id, title, company, level, source, description, location, salaryMax, salaryCurrency)
       VALUES ($1, 'Analista', 'Acme', 'L2', 'test', 'Oferta.', 'Santiago, RM', $2, 'CLP')`,
      [offerId, salaryMax]
    );
    const id = `p-renta-${n}-${RUN}`;
    await db.query(`INSERT INTO postulations (id, userId, offerId, source, applyStatus) VALUES ($1, $2, $3, 'auto', 'por-enviar')`, [id, USER, offerId]);
    await discardInbox(USER, [id], 'renta');
  }

  beforeAll(async () => {
    await db.init();
    await initializeSchema();
    await db.query(`INSERT INTO users (id, email, passwordHash, plan) VALUES ($1, $2, 'x', 'max')`, [USER, `renta-${RUN}@test.dev`]);
    await updateAnswerPreferences(USER, { salaryMin: 700_000, salaryMax: 900_000 });
  });

  it('propone subir la renta mínima sobre lo que pagaba la mejor descartada, y aceptarlo la aplica', async () => {
    await discardForPay(null); // no dice cuánto paga: no cuenta
    await discardForPay(780_000);
    expect(await listSuggestions(USER)).toEqual([]);
    await discardForPay(820_000);

    const [renta] = await listSuggestions(USER);
    expect(renta).toMatchObject({ kind: 'renta', value: '850000' });
    expect(renta.text).toMatch(/\$850\.000/);

    await answerSuggestion(USER, renta.id, true);
    const prefs = await loadAnswerPreferences(USER);
    expect([prefs.salaryMin, prefs.salaryMax]).toEqual([850_000, 900_000]);
  });
});
