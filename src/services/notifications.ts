/**
 * Avisos al candidato. Se muestran en el tablero y, si el usuario tiene teléfono
 * y Twilio está configurado, también se mandan por WhatsApp.
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { env } from '../env.js';
import { safeJsonParse } from '../utils/safeJson.js';
import { EncryptionService } from './encryption.js';
import { sendWhatsApp, whatsappEnabled } from './whatsapp.js';
import { sendEmail } from './email.js';
import { ATTENTION_REASON_LABELS, type AttentionReason } from './applyStatus.js';
import { logger } from './logger.js';

/**
 * Manda el aviso por WhatsApp en segundo plano. No espera ni propaga fallos: el
 * aviso ya quedó guardado, y que WhatsApp falle no debe afectar a quien lo creó.
 */
async function pushWhatsApp(userId: string, title: string, body: string): Promise<void> {
  if (!whatsappEnabled()) return;
  try {
    const row = await db.queryOne<{ contactInfo: string | null }>(
      'SELECT contactInfo FROM candidate_profiles WHERE userId = $1 LIMIT 1',
      [userId]
    );
    if (!row?.contactInfo) return;
    const contact = safeJsonParse<{ phone?: string }>(EncryptionService.decrypt(row.contactInfo), {});
    if (!contact.phone) return;
    await sendWhatsApp(contact.phone, `${title}\n${body}`);
  } catch (error) {
    logger.error('WhatsApp: no se pudo notificar', { detail: (error as Error).message });
  }
}

// No más de un aviso urgente cada 20 minutos por candidato: si varias
// postulaciones se bloquean seguidas (una tanda de la cola), no le llueven
// correos, uno solo le basta para saber que tiene la pestaña esperando.
const URGENT_THROTTLE_MIN = 20;

/**
 * Aviso inmediato para lo que sí vale la pena resolver en el momento: un
 * CAPTCHA o un login dejan la pestaña de la extensión abierta y a un clic de
 * seguir ("Listo, continúa"). El resumen diario alcanza para lo demás; esto
 * no espera a mañana. Nunca lanza: un aviso que falla no debe tumbar el
 * reporte que lo generó.
 */
export async function notifyUrgentAttention(userId: string, reason: string): Promise<void> {
  if (reason !== 'captcha' && reason !== 'login') return;
  try {
    const recent = await db.queryOne(
      `SELECT id FROM notifications WHERE userId = $1 AND kind = 'urgent-atencion'
       AND createdAt > CURRENT_TIMESTAMP - make_interval(mins => $2) LIMIT 1`,
      [userId, URGENT_THROTTLE_MIN]
    );
    if (recent) return;

    const pending = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM postulations WHERE userId = $1 AND applyStatus = 'requiere-atencion'`,
      [userId]
    );
    const count = Math.max(1, Number(pending?.count ?? 1));
    const user = await db.queryOne<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);

    const title = count === 1 ? 'Una postulación te necesita ahora' : `${count} postulaciones te necesitan ahora`;
    const body = `${ATTENTION_REASON_LABELS[reason as AttentionReason]} La pestaña sigue abierta: resuélvelo y pulsa "Listo, continúa" para que FITCV siga solo.`;

    await createNotification({ userId, kind: 'urgent-atencion', title, body, link: '/postulations' });
    if (user?.email) {
      await sendEmail(user.email, title, `${body}\n\nRevisa tu tablero: ${env.APP_URL}/postulations`);
    }
  } catch (error) {
    logger.error('No se pudo avisar de atención urgente', { userId, detail: (error as Error).message });
  }
}

export interface NotificationInput {
  userId: string;
  kind: string;
  title: string;
  body: string;
  link?: string | null;
  data?: unknown;
}

export async function createNotification(input: NotificationInput): Promise<string> {
  const id = uuidv4();
  await db.query(`
    INSERT INTO notifications (id, userId, kind, title, body, link, data, createdAt)
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
  `, [
    id,
    input.userId,
    input.kind,
    input.title.slice(0, 200),
    input.body.slice(0, 2000),
    input.link ?? null,
    input.data === undefined ? null : JSON.stringify(input.data),
  ]);

  // Fire-and-forget: no bloquea la respuesta al que crea el aviso.
  void pushWhatsApp(input.userId, input.title, input.body);

  return id;
}

export async function listNotifications(userId: string, limit = 20) {
  const rows = (await db.query<any>(`
    SELECT id, kind, title, body, link, data, createdAt, readAt
    FROM notifications WHERE userId = $1
    ORDER BY createdAt DESC LIMIT $2
  `, [userId, limit])).rows;

  const unread = await db.queryOne<{ count: string }>(
    'SELECT COUNT(*) AS count FROM notifications WHERE userId = $1 AND readAt IS NULL',
    [userId]
  );

  return {
    items: rows.map(row => ({ ...row, data: row.data ? safeJsonParse(row.data, null) : null })),
    unread: Number(unread?.count ?? 0),
  };
}

export async function markNotificationRead(userId: string, id: string): Promise<boolean> {
  const row = await db.queryOne<{ id: string }>(
    'UPDATE notifications SET readAt = COALESCE(readAt, CURRENT_TIMESTAMP) WHERE id = $1 AND userId = $2 RETURNING id',
    [id, userId]
  );
  return row !== null;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db.query('UPDATE notifications SET readAt = CURRENT_TIMESTAMP WHERE userId = $1 AND readAt IS NULL', [userId]);
}
