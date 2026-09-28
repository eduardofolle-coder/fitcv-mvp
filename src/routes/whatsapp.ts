/**
 * Webhooks de Twilio para WhatsApp. Solo se aceptan con firma válida de Twilio.
 *
 * - /incoming: el candidato escribe. "BAJA" (o STOP, SALIR, CANCELAR) apaga los
 *   avisos; "ALTA" los vuelve a encender si ya había dado su número. Para
 *   candidatos ya identificados, lo demás pasa por el asistente: responde con
 *   datos reales de su cuenta lo que reconoce, y escala al dueño lo que no.
 * - /status: Twilio avisa si el mensaje se entregó, se leyó o falló.
 */
import { Router } from 'express';
import { db } from '../db/client.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../services/logger.js';
import { isValidTwilioSignature, phoneHash } from '../services/whatsapp.js';
import { answerClientQuery } from '../services/whatsappAssistant.js';

const router = Router();

const STOP = /^\s*(baja|stop|salir|cancelar|detener|unsubscribe)\s*[.!]*\s*$/i;
const START = /^\s*(alta|start|volver)\s*[.!]*\s*$/i;

/** La URL pública que firmó Twilio (detrás del proxy de Render llega como http). */
const publicUrl = (req: any) => `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}${req.originalUrl}`;

const fromTwilio = (req: any) =>
  isValidTwilioSignature(publicUrl(req), req.body ?? {}, req.get('X-Twilio-Signature'));

const twiml = (res: any, message?: string) => {
  res.type('text/xml');
  const body = message ? `<Message>${message.replace(/[<&>]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' })[c]!)}</Message>` : '';
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`);
};

// POST /api/whatsapp/incoming
router.post('/incoming', asyncHandler(async (req: any, res: any) => {
  if (!fromTwilio(req)) return res.status(403).send('Forbidden');

  const text = String(req.body?.Body ?? '');
  const hash = phoneHash(String(req.body?.From ?? ''));

  if (STOP.test(text)) {
    await db.query(
      'UPDATE apply_preferences SET whatsappOptIn = FALSE, whatsappOptInAt = NULL WHERE whatsappPhoneHash = $1',
      [hash]
    );
    return twiml(res, 'Listo, no te enviaremos más avisos por WhatsApp. Si cambias de opinión, responde ALTA o actívalos en Mis respuestas de fitcv.cl.');
  }
  if (START.test(text)) {
    const updated = await db.query(
      'UPDATE apply_preferences SET whatsappOptIn = TRUE, whatsappOptInAt = CURRENT_TIMESTAMP WHERE whatsappPhoneHash = $1 RETURNING userId',
      [hash]
    );
    return twiml(res, updated.rows.length
      ? 'Listo, volverás a recibir los avisos importantes de FITCV por WhatsApp. Responde BAJA para dejar de recibirlos.'
      : 'No encontramos este número en FITCV. Actívalo en Mis respuestas de fitcv.cl.');
  }
  // El candidato escribe algo más: si el número es suyo, el asistente responde
  // con datos reales de su cuenta (no hace falta que haya aceptado avisos: eso
  // solo rige lo que FITCV inicia, no una respuesta a lo que él escribió).
  const owner = await db.queryOne<{ userId: string }>(
    'SELECT userId FROM apply_preferences WHERE whatsappPhoneHash = $1',
    [hash]
  );
  if (owner) {
    const reply = await answerClientQuery(owner.userId, String(req.body?.From ?? ''), text);
    return twiml(res, reply);
  }

  // ponytail: sin bandeja de chat para números no identificados.
  twiml(res, 'Este número solo envía avisos de FITCV. Para ayuda escríbenos a contacto@fitcv.cl. Responde BAJA para no recibir más avisos.');
}));

// POST /api/whatsapp/status
router.post('/status', asyncHandler(async (req: any, res: any) => {
  if (!fromTwilio(req)) return res.status(403).send('Forbidden');
  const { MessageSid, MessageStatus, ErrorCode } = req.body ?? {};
  if (MessageSid && MessageStatus) {
    await db.query(
      'UPDATE whatsapp_messages SET status = $1, errorCode = $2, updatedAt = CURRENT_TIMESTAMP WHERE sid = $3',
      [String(MessageStatus), ErrorCode ? String(ErrorCode) : null, String(MessageSid)]
    );
    if (ErrorCode) logger.warn('WhatsApp no entregado', { sid: MessageSid, errorCode: ErrorCode });
  }
  res.sendStatus(204);
}));

export default router;
