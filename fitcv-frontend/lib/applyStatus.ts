// Estados del envío de una postulación, tal como los define el backend
// (src/services/applyStatus.ts).

export type ApplyStatus = 'pendiente' | 'en-cola' | 'enviando' | 'enviada' | 'requiere-atencion' | 'error';

export const APPLY_STATUS_LABELS: Record<ApplyStatus, string> = {
  pendiente: 'Pendiente',
  'en-cola': 'En cola',
  enviando: 'Enviando',
  enviada: 'Enviada',
  'requiere-atencion': 'Requiere tu atención',
  error: 'Error',
};

export const APPLY_STATUS_STYLES: Record<ApplyStatus, string> = {
  pendiente: 'bg-gray-100 text-gray-800',
  'en-cola': 'bg-indigo-100 text-indigo-800',
  enviando: 'bg-blue-100 text-blue-800',
  enviada: 'bg-green-100 text-green-800',
  'requiere-atencion': 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
};

export const ATTENTION_REASON_LABELS: Record<string, string> = {
  'preguntas-sin-respaldo': 'El formulario pregunta cosas que tu CV no respalda: revisa las respuestas antes de enviar.',
  captcha: 'El portal pidió un CAPTCHA. FITCV no los resuelve: complétalo tú.',
  login: 'El portal pide iniciar sesión.',
  'sitio-empresa': 'La oferta te lleva al sitio de la empresa para postular.',
  'formulario-no-reconocido': 'FITCV no reconoció el formulario de postulación.',
  'envio-automatico-desactivado': 'El envío automático está desactivado para este portal.',
  otro: 'Necesita tu revisión.',
};

export const applyStatusOf = (value: unknown): ApplyStatus =>
  typeof value === 'string' && value in APPLY_STATUS_LABELS ? (value as ApplyStatus) : 'pendiente';
