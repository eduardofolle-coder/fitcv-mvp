/**
 * Respuestas de los reclutadores (E4).
 *
 * Cada candidato tiene un alias en INBOX_DOMAIN que va como Reply-To de las
 * postulaciones por correo. Lo que llega al alias se reenvía SIEMPRE al correo
 * del candidato, se asocia a la postulación y se clasifica: si es una
 * invitación a entrevista, la postulación pasa a "Entrevista" y se le avisa
 * (tablero y WhatsApp).
 */
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { env } from '../env.js';
import { logger } from './logger.js';
import { sendEmail } from './email.js';
import { createNotification } from './notifications.js';
import { AgentInvokerService } from './agentInvoker.js';

export type ReplyCategory = 'entrevista' | 'rechazo' | 'otro';

/** Alias estable del candidato (se crea la primera vez). null si no hay dominio de entrada. */
export async function inboxAddress(userId: string): Promise<string | null> {
  if (!env.INBOX_DOMAIN) return null;
  const row = await db.queryOne<{ inboxAlias: string | null }>('SELECT inboxAlias FROM users WHERE id = $1', [userId]);
  let alias = row?.inboxAlias;
  if (!alias) {
    alias = `c-${randomBytes(5).toString('hex')}`;
    await db.query('UPDATE users SET inboxAlias = $1 WHERE id = $2 AND inboxAlias IS NULL', [alias, userId]);
    alias = (await db.queryOne<{ inboxAlias: string }>('SELECT inboxAlias FROM users WHERE id = $1', [userId]))?.inboxAlias ?? alias;
  }
  return `${alias}@${env.INBOX_DOMAIN}`;
}

const INTERVIEW = /(entrevista|interview|agendar|coordinar una (reuni[oó]n|llamada)|disponibilidad para|te invitamos|nos gustar[ií]a conversar|videollamada|meet\.google|zoom\.us|teams\.microsoft)/i;
const REJECTION = /(no (has|ha) sido seleccionad|no continuar[aá]s|no seguir[aá]s|otros candidatos|perfil no se ajusta|lamentamos|unfortunately|not (been )?selected)/i;

export function classifyByKeywords(text: string): ReplyCategory {
  if (REJECTION.test(text)) return 'rechazo';
  if (INTERVIEW.test(text)) return 'entrevista';
  return 'otro';
}

export async function classifyReply(subject: string, text: string): Promise<ReplyCategory> {
  const sample = `${subject}\n\n${text}`.slice(0, 3000);
  try {
    const answer = (await AgentInvokerService.ask(
      'Clasifica la respuesta de un reclutador a una postulación laboral. Responde SOLO una palabra: ' +
        '"entrevista" (lo invitan a entrevista, llamada o siguiente etapa), "rechazo" (no sigue en el proceso) u "otro".\n\n' +
        sample
    )).toLowerCase();
    if (answer.includes('entrevista')) return 'entrevista';
    if (answer.includes('rechazo')) return 'rechazo';
    if (answer.includes('otro')) return 'otro';
  } catch (err) {
    logger.warn('Reply classifier AI failed, using keywords', { err: String(err) });
  }
  return classifyByKeywords(sample);
}

export interface InboundMail {
  to: string;
  from: string;
  subject: string;
  text: string;
}

const addresses = (s: string) => [...String(s).matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(m => m[0].toLowerCase());
const domainOf = (email: string) => email.split('@')[1] ?? '';

/** Procesa un correo que llegó a un alias. Devuelve false si el alias no existe. */
export async function handleInbound(mail: InboundMail): Promise<boolean> {
  const alias = addresses(mail.to).find(a => a.endsWith(`@${env.INBOX_DOMAIN.toLowerCase()}`))?.split('@')[0];
  if (!alias) return false;
  const user = await db.queryOne<{ id: string; email: string }>('SELECT id, email FROM users WHERE inboxAlias = $1', [alias]);
  if (!user) return false;

  const sender = addresses(mail.from)[0] ?? '';
  const body = `${mail.subject}\n${mail.text}`.toLowerCase();

  // La postulación: la que se envió al mismo dominio o cuya empresa se nombra, la más reciente.
  const sent = (await db.query<{ id: string; applyEmail: string | null; company: string; title: string }>(`
    SELECT p.id, p.applyEmail, o.company, o.title FROM postulations p JOIN offers o ON o.id = p.offerId
    WHERE p.userId = $1 AND p.applyStatus = 'enviada'
    ORDER BY p.sentAt DESC NULLS LAST LIMIT 200
  `, [user.id])).rows;
  const match =
    sent.find(p => p.applyEmail && sender && domainOf(p.applyEmail) === domainOf(sender)) ??
    sent.find(p => p.company.length > 3 && body.includes(p.company.toLowerCase()));

  const category = await classifyReply(mail.subject, mail.text);

  // Reenvío garantizado: aunque falle la clasificación, el candidato recibe el correo.
  const forwarded = await sendEmail(
    user.email,
    `[FITCV] ${mail.subject || 'Respuesta a tu postulación'}`,
    `Te respondieron${match ? ` por "${match.title}" (${match.company})` : ''}. Responde directamente a: ${sender}\n\n----\n${mail.text}`.slice(0, 50_000),
    { replyTo: sender || null }
  );

  await db.query(`
    INSERT INTO inbound_messages (id, userId, postulationId, fromAddress, subject, category, forwarded, createdAt)
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
  `, [uuidv4(), user.id, match?.id ?? null, sender, mail.subject.slice(0, 300), category, forwarded]);

  if (match && category === 'entrevista') {
    await db.query(`UPDATE postulations SET estado = 'Entrevista', updatedAt = CURRENT_TIMESTAMP WHERE id = $1`, [match.id]);
  }

  const title = category === 'entrevista'
    ? `¡Te llamaron a entrevista${match ? ` en ${match.company}` : ''}!`
    : `Te respondieron${match ? ` de ${match.company}` : ''}`;
  await createNotification({
    userId: user.id,
    kind: `reply-${category}`,
    title,
    body: `${mail.subject || 'Sin asunto'} — de ${sender}. ${forwarded ? 'Te lo reenviamos a tu correo.' : 'Míralo en tu tablero.'}`,
    link: '/postulations',
    data: { postulationId: match?.id ?? null, category, text: mail.text.slice(0, 1500) },
  });
  return true;
}
