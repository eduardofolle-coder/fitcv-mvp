/**
 * Sesión del candidato en cada portal de empleo.
 *
 * FITCV nunca pide ni guarda contraseñas de los portales: el candidato inicia
 * sesión una vez en su propio navegador y la extensión postula con esa sesión.
 * Aquí solo se registra si está conectado o no, para no mandar postulaciones
 * a un portal donde de seguro van a toparse con el login, y avisarle a tiempo.
 */
import { db } from '../db/client.js';
import { env } from '../env.js';
import { transitionApplication } from './applicationQueue.js';
import { createNotification } from './notifications.js';
import { sendEmail } from './email.js';
import { logger } from './logger.js';
import { PORTALS, portalById } from './portals.js';

/** Quién informó el estado: la verificación de la extensión, un intento real o el propio candidato. */
export type SessionSource = 'verificacion' | 'intento' | 'candidato';

// Tope para volver a encolar sola una postulación que se trabó por login: si el
// portal dice "conectado" pero el envío igual pide sesión, no se reintenta sin fin.
const MAX_REQUEUE_ATTEMPTS = 4;

export async function setPortalSession(userId: string, portal: string, connected: boolean, source: SessionSource): Promise<void> {
  if (!portalById.has(portal)) return;

  const previous = await db.queryOne<{ connected: boolean }>(
    'SELECT connected FROM portal_sessions WHERE userId = $1 AND portal = $2',
    [userId, portal]
  );
  await db.query(`
    INSERT INTO portal_sessions (userId, portal, connected, source, checkedAt)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    ON CONFLICT (userId, portal) DO UPDATE SET connected = $3, source = $4, checkedAt = CURRENT_TIMESTAMP
  `, [userId, portal, connected, source]);

  if (previous?.connected === connected) return;
  if (connected) await requeueLoginBlocked(userId, portal);
  else await notifyDisconnected(userId, portal);
}

/** Lo que se trabó por falta de sesión vuelve a la cola apenas el candidato se conecta. */
async function requeueLoginBlocked(userId: string, portal: string): Promise<void> {
  const rows = (await db.query<{ id: string }>(`
    SELECT p.id FROM postulations p JOIN offers o ON o.id = p.offerId
    WHERE p.userId = $1 AND o.source = $2 AND p.applyStatus = 'requiere-atencion'
      AND p.applyReason = 'login' AND p.applyAttempts < $3
  `, [userId, portal, MAX_REQUEUE_ATTEMPTS])).rows;

  for (const { id } of rows) {
    await transitionApplication({ postulationId: id, userId, to: 'en-cola', reason: 'portal-conectado' }).catch(error =>
      logger.error('No se pudo reencolar tras conectar el portal', { userId, portal, detail: (error as Error).message })
    );
  }
}

async function notifyDisconnected(userId: string, portal: string): Promise<void> {
  try {
    const info = portalById.get(portal)!;
    const title = `Conecta tu cuenta de ${info.name}`;
    // Un aviso por portal al día basta, aunque la sesión se caiga varias veces.
    const recent = await db.queryOne(
      `SELECT id FROM notifications WHERE userId = $1 AND kind = 'portal-desconectado' AND title = $2
       AND createdAt > CURRENT_TIMESTAMP - INTERVAL '24 hours' LIMIT 1`,
      [userId, title]
    );
    if (recent) return;

    const body = `No tienes la sesión iniciada en ${info.name}, así que FITCV dejó en espera tus postulaciones ahí (no se pierden). Inicia sesión una vez desde "Mis portales" y siguen solas.`;
    await createNotification({ userId, kind: 'portal-desconectado', title, body, link: '/portales' });
    const user = await db.queryOne<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
    if (user?.email) await sendEmail(user.email, title, `${body}\n\n${env.APP_URL}/portales`);
  } catch (error) {
    logger.error('No se pudo avisar del portal desconectado', { userId, portal, detail: (error as Error).message });
  }
}

export async function getPortalSessions(userId: string) {
  const rows = (await db.query<{ portal: string; connected: boolean; checkedAt: string }>(
    'SELECT portal, connected, checkedAt FROM portal_sessions WHERE userId = $1',
    [userId]
  )).rows;
  const byPortal = new Map(rows.map(r => [r.portal, r]));
  return PORTALS.map(p => {
    const row = byPortal.get(p.id);
    return {
      id: p.id,
      name: p.name,
      connectUrl: p.connectUrl,
      signupUrl: p.signupUrl,
      verifiable: p.checkUrl !== null,
      status: row ? (row.connected ? 'conectado' : 'desconectado') : 'sin-verificar',
      checkedAt: row?.checkedAt ?? null,
    };
  });
}
