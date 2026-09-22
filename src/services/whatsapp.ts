/**
 * Envío de WhatsApp por la API REST de Twilio (sin el SDK: axios ya está).
 *
 * Si faltan las credenciales, es un no-op silencioso: en desarrollo o en un
 * despliegue sin Twilio, las notificaciones siguen guardándose en el tablero y
 * nada revienta. Un fallo de envío se registra pero nunca se propaga: un aviso
 * que no llegó por WhatsApp no debe tumbar la operación que lo generó.
 */
import axios from 'axios';
import { env } from '../env.js';
import { logger } from './logger.js';

/**
 * Lleva un teléfono a E.164 con prefijo `whatsapp:`. Normalización pensada para
 * Chile: los CV traen el móvil sin código de país (9 dígitos, parte con 9).
 * ponytail: heurística Chile-only; si más adelante hay otros países, el país
 * debería venir del perfil y no adivinarse.
 */
function toWhatsApp(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('whatsapp:')) return trimmed;

  const digits = trimmed.replace(/[^\d+]/g, '');
  if (!digits) return null;

  let e164: string;
  if (digits.startsWith('+')) e164 = digits;
  else if (digits.startsWith('56')) e164 = `+${digits}`;
  else if (digits.length === 9 && digits.startsWith('9')) e164 = `+56${digits}`;
  else e164 = `+56${digits}`;

  return `whatsapp:${e164}`;
}

export function whatsappEnabled(): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM);
}

export interface WhatsAppTemplate {
  /** ContentSid de una plantilla aprobada (HX...). */
  contentSid: string;
  /** Variables de la plantilla, por posición: { "1": "...", "2": "..." }. */
  variables?: Record<string, string>;
}

/**
 * Envía un WhatsApp. Con `template` usa una plantilla aprobada (ContentSid): es
 * lo que exige WhatsApp para mensajes iniciados por el negocio, y lo único que
 * acepta una cuenta trial. Sin `template` manda texto libre, que solo funciona
 * dentro de la ventana de 24h tras un mensaje del usuario (y no en trial).
 * Devuelve true si Twilio aceptó el mensaje. Nunca lanza.
 */
export async function sendWhatsApp(
  to: string,
  body: string,
  template?: WhatsAppTemplate
): Promise<boolean> {
  if (!whatsappEnabled()) return false;

  const dest = toWhatsApp(to);
  if (!dest) {
    logger.warn('WhatsApp: número inválido, se omite el envío');
    return false;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
    const form = new URLSearchParams({ From: env.TWILIO_WHATSAPP_FROM, To: dest });
    if (template) {
      form.set('ContentSid', template.contentSid);
      if (template.variables) form.set('ContentVariables', JSON.stringify(template.variables));
    } else {
      // Twilio corta en 1600; el cuerpo de un aviso es corto, pero por si acaso.
      form.set('Body', body.slice(0, 1500));
    }

    const res = await axios.post(url, form.toString(), {
      auth: { username: env.TWILIO_ACCOUNT_SID, password: env.TWILIO_AUTH_TOKEN },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

    logger.info('WhatsApp enviado', { sid: res.data?.sid, status: res.data?.status });
    return true;
  } catch (error) {
    // El error 63007/63016 del sandbox = el destinatario no envió el "join".
    const detail = (error as any)?.response?.data?.message || (error as Error).message;
    logger.error('WhatsApp: fallo de envío', { detail });
    return false;
  }
}
