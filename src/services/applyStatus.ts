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
 *
 * La excepción son los campos que el formulario marca como opcionales: si el
 * CV no los responde, quedan en blanco en vez de llenarse con algo dudoso. Un
 * campo sin esa marca se trata como obligatorio.
 */
export const qualifiesForAutoSend = (
  resolutions: ReadonlyArray<{ fieldId?: string; status: string }>,
  fields: ReadonlyArray<{ id: string; required?: boolean }> = []
): boolean => {
  const optional = new Set(fields.filter(f => f.required === false).map(f => f.id));
  return resolutions.every(
    r => r.status === 'filled' || r.status === 'use-adapted-cv' || (r.fieldId !== undefined && optional.has(r.fieldId))
  );
};

export interface ResolutionRecord {
  autoSendable: boolean;
  fieldCount: number;
  summary: Record<string, number>;
  steps: number;
}

/** Un formulario de varios pasos califica solo si todos sus pasos calificaron. */
export function mergeResolution(
  previous: Partial<ResolutionRecord> | null,
  next: { autoSendable: boolean; fieldCount: number; summary: Record<string, number> }
): ResolutionRecord {
  if (!previous) return { ...next, summary: { ...next.summary }, steps: 1 };

  const summary = { ...(previous.summary ?? {}) };
  for (const [status, count] of Object.entries(next.summary)) {
    summary[status] = (summary[status] ?? 0) + count;
  }

  return {
    autoSendable: previous.autoSendable === true && next.autoSendable,
    fieldCount: (previous.fieldCount ?? 0) + next.fieldCount,
    summary,
    steps: (previous.steps ?? 1) + 1,
  };
}
