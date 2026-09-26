import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../src/db/client.js';
import { initializeSchema } from '../src/db/schema.js';
import { setPortalSession, getPortalSessions } from '../src/services/portalSessions.js';
import { queuePolicy } from '../src/services/portalHealth.js';
import { createPostulationForOffer } from '../src/services/applicationQueue.js';

// Únicos por corrida: la base local persiste entre ejecuciones.
const RUN = Date.now();
const USER = `u-ps-${RUN}`;
const OFFER = `o-ps-${RUN}`;

describe('sesión del candidato en los portales', () => {
  let postulationId = '';

  beforeAll(async () => {
    await db.init();
    await initializeSchema();
    await db.query('INSERT INTO users (id, email, passwordHash) VALUES ($1, $2, $3)', [USER, `ps-${RUN}@test.dev`, 'x']);
    await db.query(
      `INSERT INTO offers (id, title, company, level, source, description, publishedAt)
       VALUES ($1, 'Analista', 'Acme', 'L2', 'bne', 'Oferta de prueba.', CURRENT_TIMESTAMP)`,
      [OFFER]
    );
    postulationId = (await createPostulationForOffer(USER, OFFER)).id;
    // Se trabó al postular porque el portal pidió login.
    await db.query(
      `UPDATE postulations SET applyStatus = 'requiere-atencion', applyReason = 'login', applyAttempts = 1 WHERE id = $1`,
      [postulationId]
    );
  });

  it('sin sesión: la cola se salta el portal y se avisa una vez', async () => {
    await setPortalSession(USER, 'bne', false, 'intento');
    expect((await queuePolicy(USER)).skip).toContain('bne');

    await setPortalSession(USER, 'bne', false, 'verificacion');
    const notices = await db.query(`SELECT id FROM notifications WHERE userId = $1 AND kind = 'portal-desconectado'`, [USER]);
    expect(notices.rows.length).toBe(1);
  });

  it('al conectarse, lo trabado por login vuelve solo a la cola', async () => {
    await setPortalSession(USER, 'bne', true, 'verificacion');
    expect((await queuePolicy(USER)).skip).not.toContain('bne');
    const row = await db.queryOne<{ applyStatus: string }>('SELECT applyStatus FROM postulations WHERE id = $1', [postulationId]);
    expect(row?.applyStatus).toBe('en-cola');
    expect((await getPortalSessions(USER)).find(p => p.id === 'bne')?.status).toBe('conectado');
  });

  it('ignora portales que no conoce', async () => {
    await setPortalSession(USER, 'no-existe', false, 'verificacion');
    expect((await queuePolicy(USER)).skip).not.toContain('no-existe');
  });
});
