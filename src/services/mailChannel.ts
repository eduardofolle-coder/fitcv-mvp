/**
 * Canal correo: postulaciones a ofertas que piden el CV por correo.
 *
 * Principal: sale al instante desde el correo del candidato (OAuth). Respaldo,
 * si no lo conectó: sale desde el dominio de FITCV con Reply-To al candidato,
 * y si otro candidato ya escribió hoy a la misma dirección, se reparte en el
 * día ("Se envía hoy a las HH:MM") para no llegar en ráfaga.
 */
import { db } from '../db/client.js';
import { env } from '../env.js';
import { logger } from './logger.js';
import { sendEmail } from './email.js';
import { MailAuthError, sendFromAccount, type OutgoingMail } from './mailAccounts.js';
import { getAdaptedCv, tailorCv } from './cvTailoring.js';
import { pdfFileName, renderCvPdf } from './cvPdf.js';
import { loadHardData } from './candidateProfile.js';
import { transitionApplication } from './applicationQueue.js';
import { createNotification } from './notifications.js';
import { inboxAddress } from './inbox.js';

export const BACKUP_SPACING_MIN = 45;
export const backupConfigured = () => Boolean(env.RESEND_API_KEY && env.MAIL_BACKUP_FROM);

/** Próximo horario libre para escribir a esta dirección desde el respaldo. */
export async function backupSlot(applyEmail: string, postulationId: string, now: Date): Promise<Date> {
  const row = await db.queryOne<{ last: string | null }>(`
    SELECT MAX(mailScheduledAt) AS last FROM postulations
    WHERE channel = 'email' AND LOWER(applyEmail) = LOWER($1) AND id <> $2
      AND mailScheduledAt > CURRENT_TIMESTAMP - INTERVAL '20 hours'
  `, [applyEmail, postulationId]);
  if (!row?.last) return now;
  const next = new Date(new Date(row.last).getTime() + BACKUP_SPACING_MIN * 60_000);
  return next > now ? next : now;
}

export function composeApplication(job: { title: string; company: string }, who: { fullName: string; phone: string; email: string }) {
  const lines = [
    `Estimado equipo de selección${job.company && job.company !== 'Empresa no informada' ? ` de ${job.company}` : ''}:`,
    '',
    `Les escribo para postular al cargo de ${job.title}. Adjunto mi CV.`,
    '',
    'Quedo disponible para conversar cuando les acomode.',
    '',
    'Saludos cordiales,',
    who.fullName,
    ...[who.phone, who.email].filter(Boolean),
  ];
  return { subject: `Postulación: ${job.title} - ${who.fullName}`, text: lines.join('\n') };
}

type Via = 'account' | 'backup';

async function sendOne(p: { id: string; userId: string; applyEmail: string }, via: Via): Promise<void> {
  // Se toma la postulación para que ninguna otra vuelta la envíe dos veces.
  const claimed = await db.queryOne<{ id: string }>(`
    UPDATE postulations SET applyStatus = 'enviando', applyClaimedAt = CURRENT_TIMESTAMP,
      applyAttempts = applyAttempts + 1, applyUpdatedAt = CURRENT_TIMESTAMP,
      applyResolution = '{"autoSendable":true,"fieldCount":0,"summary":{},"steps":1}'
    WHERE id = $1 AND applyStatus = 'en-cola' RETURNING id
  `, [p.id]);
  if (!claimed) return;

  try {
    let cv = await getAdaptedCv(p.id, p.userId);
    if (!cv) {
      await tailorCv(p.id, p.userId);
      cv = await getAdaptedCv(p.id, p.userId);
    }
    if (!cv) throw new Error('No adapted CV');

    const [hard, user, job] = await Promise.all([
      loadHardData(p.userId),
      db.queryOne<{ email: string }>('SELECT email FROM users WHERE id = $1', [p.userId]),
      db.queryOne<{ title: string; company: string }>(
        'SELECT o.title, o.company FROM postulations p JOIN offers o ON o.id = p.offerId WHERE p.id = $1', [p.id]
      ),
    ]);
    const who = { fullName: hard.fullName || 'Candidato', phone: hard.contact.phone, email: hard.contact.email || user?.email || '' };
    const { subject, text } = composeApplication(job ?? { title: cv.job, company: '' }, who);
    const alias = await inboxAddress(p.userId);
    const attachment = { fileName: pdfFileName(cv.content), base64: renderCvPdf(cv.content, { title: cv.job }).toString('base64') };

    if (via === 'account') {
      const mail: OutgoingMail = { to: p.applyEmail, replyTo: alias, subject, text, attachment };
      await sendFromAccount(p.userId, mail);
    } else {
      const name = who.fullName.replace(/["<>]/g, '');
      const ok = await sendEmail(p.applyEmail, subject, text, {
        from: `"${name} (vía FITCV)" <${env.MAIL_BACKUP_FROM}>`,
        replyTo: alias ?? who.email,
        attachments: [{ filename: attachment.fileName, content: attachment.base64 }],
      });
      if (!ok) throw new Error('Backup sender rejected the message');
    }

    await transitionApplication({
      postulationId: p.id,
      userId: p.userId,
      to: 'enviada',
      mode: 'auto',
      detail: `Enviada por correo a ${p.applyEmail}${via === 'backup' ? ' desde el respaldo de FITCV' : ' desde tu correo'}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof MailAuthError) {
      // El permiso se perdió: vuelve a la cola (la próxima vuelta usa el respaldo, si hay).
      await transitionApplication({ postulationId: p.id, userId: p.userId, to: 'en-cola', reason: 'correo-desconectado', detail: message });
      await createNotification({
        userId: p.userId,
        kind: 'mail-reconnect',
        title: 'Reconecta tu correo',
        body: 'FITCV perdió el permiso para enviar postulaciones desde tu correo. Vuelve a conectarlo en tu tablero.',
        link: '/dashboard',
      });
    } else {
      await transitionApplication({ postulationId: p.id, userId: p.userId, to: 'error', detail: `Correo: ${message}`.slice(0, 500) });
    }
    logger.warn('Mail application failed', { postulationId: p.id, via, message });
  }
}

/** Una vuelta del canal correo. Devuelve cuántas postulaciones se intentaron. */
export async function processMailQueue(now = new Date(), limit = 10): Promise<number> {
  const rows = (await db.query<{ id: string; userId: string; applyEmail: string; mailScheduledAt: string | null; hasAccount: boolean }>(`
    SELECT p.id, p.userId, p.applyEmail, p.mailScheduledAt,
           (m.userId IS NOT NULL AND m.lastError IS NULL) AS hasAccount
    FROM postulations p
    LEFT JOIN mail_accounts m ON m.userId = p.userId
    WHERE p.channel = 'email' AND p.applyStatus = 'en-cola' AND p.applyEmail IS NOT NULL
    ORDER BY p.applyQueuedAt ASC NULLS LAST
    LIMIT $1
  `, [limit])).rows;

  let tried = 0;
  for (const p of rows) {
    if (p.hasAccount) {
      await sendOne(p, 'account');
      tried++;
      continue;
    }
    if (!backupConfigured()) continue; // espera a que el candidato conecte su correo

    let at = p.mailScheduledAt ? new Date(p.mailScheduledAt) : null;
    if (!at) {
      at = await backupSlot(p.applyEmail, p.id, now);
      await db.query('UPDATE postulations SET mailScheduledAt = $1 WHERE id = $2', [at.toISOString(), p.id]);
    }
    if (at <= now) {
      await sendOne(p, 'backup');
      tried++;
    }
  }
  return tried;
}
