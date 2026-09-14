/**
 * Estados del envío de una postulación.
 *
 * Van aparte de `estado`, que sigue el proceso con el reclutador (Aplicado,
 * Entrevista...). Este sigue el envío en sí: si la extensión ya lo mandó, si
 * está esperando turno o si necesita que el candidato intervenga.
 */

export const APPLY_STATUSES = [
  'pendiente',
  'en-cola',
  'enviando',
  'enviada',
  'requiere-atencion',
  'error',
] as const;

export type ApplyStatus = (typeof APPLY_STATUSES)[number];

export const APPLY_STATUS_LABELS: Record<ApplyStatus, string> = {
  pendiente: 'Pendiente',
  'en-cola': 'En cola',
  enviando: 'Enviando',
  enviada: 'Enviada',
  'requiere-atencion': 'Requiere tu atención',
  error: 'Error',
};

export const ATTENTION_REASONS = [
  'preguntas-sin-respaldo',
  'captcha',
  'login',
  'sitio-empresa',
  'formulario-no-reconocido',
  'envio-automatico-desactivado',
  'otro',
] as const;

export type AttentionReason = (typeof ATTENTION_REASONS)[number];

export const ATTENTION_REASON_LABELS: Record<AttentionReason, string> = {
  'preguntas-sin-respaldo': 'El formulario pregunta cosas que tu CV no respalda: revisa las respuestas antes de enviar.',
  captcha: 'El portal pidió un CAPTCHA. FITCV no los resuelve: complétalo tú.',
  login: 'El portal pide iniciar sesión.',
  'sitio-empresa': 'La oferta te lleva al sitio de la empresa para postular.',
  'formulario-no-reconocido': 'FITCV no reconoció el formulario de postulación.',
  'envio-automatico-desactivado': 'El envío automático está desactivado para este portal.',
  otro: 'Necesita tu revisión.',
};

export type ApplyMode = 'auto' | 'manual';

// Una postulación enviada no vuelve atrás: lo que pase después lo sigue `estado`.
const TRANSITIONS: Record<ApplyStatus, readonly ApplyStatus[]> = {
  pendiente: ['en-cola', 'enviada'],
  'en-cola': ['enviando', 'pendiente', 'enviada'],
  enviando: ['enviada', 'requiere-atencion', 'error', 'en-cola'],
  enviada: [],
  'requiere-atencion': ['en-cola', 'enviada', 'pendiente'],
  error: ['en-cola', 'enviada', 'pendiente'],
};

// Si la extensión toma una postulación y no reporta (se cerró el navegador),
// después de este plazo vuelve a estar disponible.
export const CLAIM_LEASE_MINUTES = 15;

export const isApplyStatus = (value: unknown): value is ApplyStatus =>
  typeof value === 'string' && (APPLY_STATUSES as readonly string[]).includes(value);

export const isAttentionReason = (value: unknown): value is AttentionReason =>
  typeof value === 'string' && (ATTENTION_REASONS as readonly string[]).includes(value);

export const canTransition = (from: ApplyStatus, to: ApplyStatus): boolean =>
  TRANSITIONS[from].includes(to);

/**
 * Solo se envía sin que el candidato mire lo que FITCV resolvió solo: datos
 * duros y respuestas verificadas contra el CV. Un borrador por aprobar o una
 * decisión personal bastan para que no califique.
 */
export const qualifiesForAutoSend = (resolutions: ReadonlyArray<{ status: string }>): boolean =>
  resolutions.every(r => r.status === 'filled' || r.status === 'use-adapted-cv');
