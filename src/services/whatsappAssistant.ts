/**
 * Asistente de WhatsApp entrante.
 *
 * Responde a lo que un candidato pregunta con los datos reales de su propia
 * cuenta — nunca con una IA que pueda inventar un estado que no es. Solo tres
 * preguntas se responden así, las que se pueden sacar 100% de la base de
 * datos sin ambigüedad. Todo lo demás (quejas, preguntas abiertas, lo que sea
 * que esta lista no cubra) se le reenvía al dueño de FITCV: es la misma regla
 * de "sin mentiras" que rige el resto de FITCV, aplicada aquí.
 */
import { db } from '../db/client.js';
import { env } from '../env.js';
import { logger } from './logger.js';
import { sendEmail } from './email.js';
import { sendWhatsApp, whatsappEnabled } from './whatsapp.js';
import { getPlanState } from './planQuota.js';
import { getPortalSessions } from './portalSessions.js';

export type ClientQuery = 'estado' | 'cupo' | 'portales' | 'otro';

const CUPO = /(cupo|cuota|cu[aá]ntas me quedan|\bplan\b)/i;
const PORTALES = /(portal(es)?|conectad[oa]|sesi[oó]n)/i;
const ESTADO = /(estado|c[oó]mo van|c[oó]mo va|mis postulaciones|postulacion(es)?)/i;

/** El orden importa: "cupo de mi plan" o "portal conectado" no deben caer en "estado". */
export function classifyClientQuery(text: string): ClientQuery {
  if (CUPO.test(text)) return 'cupo';
  if (PORTALES.test(text)) return 'portales';
  if (ESTADO.test(text)) return 'estado';
  return 'otro';
}

async function estadoReply(userId: string): Promise<string> {
  const row = await db.queryOne<{ enviada: string; enCamino: string; atencion: string; autorizacion: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE applyStatus = 'enviada') AS "enviada",
      COUNT(*) FILTER (WHERE applyStatus IN ('en-cola', 'por-enviar', 'enviando')) AS "enCamino",
      COUNT(*) FILTER (WHERE applyStatus = 'requiere-atencion') AS "atencion",
      COUNT(*) FILTER (WHERE applyStatus = 'requiere-autorizacion') AS "autorizacion"
    FROM postulations WHERE userId = $1
  `, [userId]);
  const total = row ? Number(row.enviada) + Number(row.enCamino) + Number(row.atencion) + Number(row.autorizacion) : 0;
  if (!row || total === 0) {
    return `Todavía no tienes postulaciones. Revisa tus ofertas en ${env.APP_URL}/offers.`;
  }
  const parts = [`${row.enviada} enviada(s)`, `${row.enCamino} en camino`];
  if (Number(row.atencion) > 0) parts.push(`${row.atencion} te necesitan a ti`);
  if (Number(row.autorizacion) > 0) parts.push(`${row.autorizacion} esperando tu autorización`);
  return `Así van tus postulaciones: ${parts.join(', ')}. Detalle en ${env.APP_URL}/postulations.`;
}

const PLAN_LABEL: Record<string, string> = { free: 'Gratis', pro: 'Pro', max: 'Max' };

async function cupoReply(userId: string): Promise<string> {
  const state = await getPlanState(userId);
  return `Plan ${PLAN_LABEL[state.plan] ?? state.plan}: te quedan ${state.quotaRemaining} postulaciones automáticas` +
    ` (${state.dailyRemaining} disponibles hoy). Detalle en ${env.APP_URL}/dashboard.`;
}

async function portalesReply(userId: string): Promise<string> {
  const portals = await getPortalSessions(userId);
  const disconnected = portals.filter(p => p.status === 'desconectado').map(p => p.name);
  if (disconnected.length === 0) return `Tus portales están bien. Detalle en ${env.APP_URL}/portales.`;
  return `Sin sesión en: ${disconnected.join(', ')}. Esas postulaciones esperan; inicia sesión una vez desde` +
    ` ${env.APP_URL}/portales y siguen solas.`;
}

/** Lo que no se reconoce nunca se contesta a ciegas: se lo pasa al dueño de FITCV. */
async function escalateToFounder(userId: string, from: string, text: string): Promise<void> {
  const user = await db.queryOne<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
  const msg = `WhatsApp de ${user?.email ?? from}: "${text.slice(0, 300)}"`;
  if (whatsappEnabled() && env.ADMIN_WHATSAPP) void sendWhatsApp(env.ADMIN_WHATSAPP, msg);
  if (env.ADMIN_EMAILS[0]) void sendEmail(env.ADMIN_EMAILS[0], 'Consulta por WhatsApp', msg);
  logger.info('WhatsApp: consulta escalada al dueño', { userId });
}

/** Responde con datos reales lo que reconoce; escala al dueño lo que no. Nunca lanza. */
export async function answerClientQuery(userId: string, from: string, text: string): Promise<string> {
  const category = classifyClientQuery(text);
  try {
    if (category === 'estado') return await estadoReply(userId);
    if (category === 'cupo') return await cupoReply(userId);
    if (category === 'portales') return await portalesReply(userId);
  } catch (error) {
    logger.error('WhatsApp: no se pudo responder la consulta', { userId, category, detail: (error as Error).message });
  }
  await escalateToFounder(userId, from, text);
  return `Buena pregunta — se la paso a alguien del equipo de FITCV. Mientras, revisa tu tablero en ${env.APP_URL}/dashboard.`;
}
