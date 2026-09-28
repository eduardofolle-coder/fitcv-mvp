import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'crypto';
import type { Server } from 'http';

// El token firma los webhooks: tiene que existir antes de cargar env.ts.
process.env.TWILIO_AUTH_TOKEN = 'token-de-prueba';

const RUN = Date.now();
const USER = `u-wa-${RUN}`;
let server: Server;
let base = '';
let mod: {
  db: typeof import('../src/db/client.js')['db'];
  loadAnswerPreferences: typeof import('../src/services/savedAnswers.js')['loadAnswerPreferences'];
  updateAnswerPreferences: typeof import('../src/services/savedAnswers.js')['updateAnswerPreferences'];
  queueApplication: typeof import('../src/services/applicationQueue.js')['queueApplication'];
  classifyClientQuery: typeof import('../src/services/whatsappAssistant.js')['classifyClientQuery'];
};

/** Lo que haría Twilio: firma la URL + parámetros ordenados con el Auth Token. */
async function twilioPost(path: string, params: Record<string, string>, sign = true) {
  const url = `${base}${path}`;
  const payload = url + Object.keys(params).sort().map(k => k + params[k]).join('');
  const signature = createHmac('sha1', 'token-de-prueba').update(payload).digest('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(sign ? { 'X-Twilio-Signature': signature } : {}) },
    body: new URLSearchParams(params).toString(),
  });
  return { status: res.status, text: await res.text() };
}

beforeAll(async () => {
  const { db } = await import('../src/db/client.js');
  const { initializeSchema } = await import('../src/db/schema.js');
  const saved = await import('../src/services/savedAnswers.js');
  const queue = await import('../src/services/applicationQueue.js');
  const assistant = await import('../src/services/whatsappAssistant.js');
  const { default: whatsappRoutes } = await import('../src/routes/whatsapp.js');
  const express = (await import('express')).default;

  await db.init();
  await initializeSchema();
  await db.query(`INSERT INTO users (id, email, passwordHash, plan) VALUES ($1, $2, 'x', 'max')`, [USER, `wa-${RUN}@test.dev`]);
  mod = {
    db,
    loadAnswerPreferences: saved.loadAnswerPreferences,
    updateAnswerPreferences: saved.updateAnswerPreferences,
    queueApplication: queue.queueApplication,
    classifyClientQuery: assistant.classifyClientQuery,
  };

  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/whatsapp', whatsappRoutes);
  await new Promise<void>(resolve => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  base = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`;
}, 30_000);

afterAll(() => {
  server?.close();
});

describe('WhatsApp solo con permiso', () => {
  it('pide número para activar los avisos y lo guarda en formato internacional', async () => {
    await expect(mod.updateAnswerPreferences(USER, { whatsappOptIn: true })).rejects.toThrow(/WhatsApp number/);

    const prefs = await mod.updateAnswerPreferences(USER, { whatsappPhone: '9 1234 5678', whatsappOptIn: true });
    expect(prefs).toMatchObject({ whatsappPhone: '+56912345678', whatsappOptIn: true });
    expect(prefs.whatsappOptInAt).not.toBeNull();
  });

  it('rechaza un webhook sin firma de Twilio', async () => {
    const res = await twilioPost('/api/whatsapp/incoming', { From: 'whatsapp:+56912345678', Body: 'BAJA' }, false);
    expect(res.status).toBe(403);
    expect((await mod.loadAnswerPreferences(USER)).whatsappOptIn).toBe(true);
  });

  it('"BAJA" apaga los avisos y "ALTA" los vuelve a encender', async () => {
    const off = await twilioPost('/api/whatsapp/incoming', { From: 'whatsapp:+56912345678', Body: 'Baja' });
    expect(off.status).toBe(200);
    expect(off.text).toMatch(/no te enviaremos más avisos/);
    expect((await mod.loadAnswerPreferences(USER)).whatsappOptIn).toBe(false);

    const on = await twilioPost('/api/whatsapp/incoming', { From: 'whatsapp:+56912345678', Body: 'ALTA' });
    expect(on.text).toMatch(/volverás a recibir/);
    expect((await mod.loadAnswerPreferences(USER)).whatsappOptIn).toBe(true);
  });

  it('guarda si el mensaje llegó', async () => {
    await mod.db.query(`INSERT INTO whatsapp_messages (sid, userId, kind, status) VALUES ($1, $2, 'tanda-por-enviar', 'queued')`, [`SM${RUN}`, USER]);
    const res = await twilioPost('/api/whatsapp/status', { MessageSid: `SM${RUN}`, MessageStatus: 'delivered' });
    expect(res.status).toBe(204);
    const row = await mod.db.queryOne<{ status: string }>('SELECT status FROM whatsapp_messages WHERE sid = $1', [`SM${RUN}`]);
    expect(row?.status).toBe('delivered');
  });
});

describe('oferta bajo el rango', () => {
  it('avisa al candidato para que la autorice o la descarte', async () => {
    await mod.updateAnswerPreferences(USER, { salaryMin: 1_500_000, salaryMax: 2_000_000 });
    const offerId = `o-wa-${RUN}`;
    await mod.db.query(
      `INSERT INTO offers (id, title, company, level, source, description, salaryMin, salaryMax, salaryCurrency)
       VALUES ($1, 'Analista', 'Acme', 'L2', 'test', 'Oferta.', 700000, 900000, 'CLP')`,
      [offerId]
    );
    const postulationId = `p-wa-${RUN}`;
    await mod.db.query(`INSERT INTO postulations (id, userId, offerId) VALUES ($1, $2, $3)`, [postulationId, USER, offerId]);

    expect((await mod.queueApplication(postulationId, USER)).to).toBe('requiere-autorizacion');
    const notice = await mod.db.queryOne<{ title: string; link: string }>(
      `SELECT title, link FROM notifications WHERE userId = $1 AND kind = 'autorizacion-renta'`,
      [USER]
    );
    expect(notice).toMatchObject({ title: 'Analista en Acme paga menos que tu rango', link: `/postulations/${postulationId}` });
  });
});

describe('clasifica la pregunta del candidato', () => {
  it('distingue estado, cupo y portales, y todo lo demás cae en "otro"', () => {
    expect(mod.classifyClientQuery('¿Cómo van mis postulaciones?')).toBe('estado');
    expect(mod.classifyClientQuery('cuanto cupo me queda')).toBe('cupo');
    expect(mod.classifyClientQuery('¿en qué portales estoy conectado?')).toBe('portales');
    expect(mod.classifyClientQuery('tengo un problema con mi cuenta, ayuda')).toBe('otro');
  });
});

describe('el asistente responde con datos reales, nunca inventados', () => {
  it('"estado" cuenta las postulaciones reales de la cuenta (la que quedó esperando autorización, del test anterior)', async () => {
    const res = await twilioPost('/api/whatsapp/incoming', { From: 'whatsapp:+56912345678', Body: 'como van mis postulaciones' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/1 esperando tu autorización/);
    expect(res.text).toContain('/postulations');
  });

  it('"cupo" responde con el plan y el cupo real de la cuenta (max)', async () => {
    const res = await twilioPost('/api/whatsapp/incoming', { From: 'whatsapp:+56912345678', Body: 'cuanto cupo me queda' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Plan Max: te quedan \d+ postulaciones automáticas/);
  });

  it('"portales" responde sin inventar nombres (ninguno conectado todavía)', async () => {
    const res = await twilioPost('/api/whatsapp/incoming', { From: 'whatsapp:+56912345678', Body: 'tengo algun portal conectado?' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/portales están bien|Sin sesión en/);
  });

  it('lo que no reconoce nunca lo contesta a ciegas: avisa que lo pasa a una persona', async () => {
    const res = await twilioPost('/api/whatsapp/incoming', { From: 'whatsapp:+56912345678', Body: 'llevo dos semanas sin respuesta de nadie, esto es pésimo' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/se la paso a alguien del equipo/);
  });

  it('un número no identificado no recibe datos de ninguna cuenta', async () => {
    const res = await twilioPost('/api/whatsapp/incoming', { From: 'whatsapp:+56900000000', Body: 'como van mis postulaciones' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Este número solo envía avisos de FITCV/);
  });
});
