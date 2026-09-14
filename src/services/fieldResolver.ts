/**
 * Resuelve los campos de un formulario de postulación.
 *
 * Todo lo que se puede resolver sin IA se resuelve así: datos duros,
 * decisiones personales, subir el CV. Solo las preguntas de experiencia, los
 * "¿tienes X?" que el CV no nombra literalmente y la motivación pasan por el
 * modelo, en una sola llamada, y lo redactado se verifica contra el CV antes
 * de devolverse.
 *
 * Solo se llena automáticamente, sin que el candidato lo lea, lo que el
 * verificador respalda afirmación por afirmación con citas reales del CV.
 */
import { AppError } from '../middleware/errorHandler.js';
import { AgentInvokerService } from './agentInvoker.js';
import { loadHardData } from './candidateProfile.js';
import { hardDataForPrompt, type HardData } from './cvComposer.js';
import { explainJudgment, factsCorpus, judgeStatement } from './narrativeVerifier.js';
import {
  classifyField,
  resolveDeterministic,
  yesOption,
  type ApplicationField,
  type Classification,
  type Resolution,
} from './fieldClassifier.js';

export const MAX_FIELDS = 50;

export interface JobContext {
  title: string;
  company: string;
  description: string;
}

export interface FieldResolution {
  resolutions: Resolution[];
  summary: Record<string, number>;
}

type Pending = { field: ApplicationField; classification: Classification };

/** Campo tal como llega de un formulario real: puede indicar si es obligatorio. */
export type ParsedField = ApplicationField & { required?: boolean };

export function parseFields(raw: unknown, options: { allowEmpty?: boolean } = {}): ParsedField[] {
  if (!Array.isArray(raw) || (raw.length === 0 && !options.allowEmpty)) {
    throw new AppError(400, 'Provide at least one field.');
  }
  if (raw.length > MAX_FIELDS) {
    throw new AppError(400, `At most ${MAX_FIELDS} fields per request.`);
  }

  const seen = new Set<string>();
  return raw.map((item, index) => {
    const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const label = typeof o.label === 'string' ? o.label.trim().slice(0, 500) : '';
    if (!label) throw new AppError(400, `Field ${index} needs a label.`);

    let id = typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 100) : `field-${index}`;
    if (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);

    return {
      id,
      label,
      type: typeof o.type === 'string' ? o.type.trim().toLowerCase().slice(0, 30) : undefined,
      options: Array.isArray(o.options)
        ? o.options.filter((x): x is string => typeof x === 'string').map(x => x.slice(0, 200)).slice(0, 50)
        : undefined,
      maxLength:
        typeof o.maxLength === 'number' && Number.isInteger(o.maxLength) && o.maxLength > 0
          ? Math.min(o.maxLength, 5000)
          : undefined,
      required: typeof o.required === 'boolean' ? o.required : undefined,
    };
  });
}

export function parseJob(raw: unknown): JobContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const j = raw as Record<string, unknown>;
  return {
    title: String(j.title ?? '').slice(0, 200),
    company: String(j.company ?? '').slice(0, 200),
    description: String(j.description ?? '').slice(0, 8000),
  };
}

const kindOf = (c: Classification): 'experience' | 'motivation' | 'capability' =>
  c.category === 'motivation' ? 'motivation' : c.category === 'capability-check' ? 'capability' : 'experience';

async function draftAnswers(
  pending: Pending[],
  hard: HardData,
  job: JobContext | undefined,
  userId: string
): Promise<Map<string, Resolution>> {
  const out = new Map<string, Resolution>();
  const unresolved = (p: Pending, reason: string): Resolution => ({
    fieldId: p.field.id,
    category: p.classification.category,
    status: 'needs-user',
    reason,
  });
  const forApproval = (p: Pending, value: string, reason: string): Resolution => ({
    fieldId: p.field.id,
    category: p.classification.category,
    status: 'needs-approval',
    value,
    reason,
  });

  let written: unknown;
  try {
    const invocation = await AgentInvokerService.invoke('answer-writer', {
      facts: hardDataForPrompt(hard),
      job,
      questions: pending.map(p => ({
        id: p.field.id,
        text: p.field.label,
        kind: kindOf(p.classification),
        maxLength: p.field.maxLength,
      })),
    }, userId);
    if (!invocation.success) throw new Error(invocation.error ?? 'writer returned a failure');
    written = invocation.output;
  } catch {
    // Falla cerrada: sin redacción no se inventa nada, se le pregunta al candidato.
    for (const p of pending) {
      out.set(p.field.id, unresolved(p, 'No se pudo redactar una respuesta en este momento; respóndela tú.'));
    }
    return out;
  }

  const answers = new Map<string, { answerable: boolean; text: string }>();
  const list = written && typeof written === 'object' ? (written as Record<string, unknown>).answers : undefined;
  for (const a of Array.isArray(list) ? list : []) {
    if (a && typeof a === 'object' && typeof (a as any).id === 'string') {
      answers.set((a as any).id, {
        answerable: (a as any).answerable === true,
        text: typeof (a as any).text === 'string' ? (a as any).text.trim() : '',
      });
    }
  }

  const drafts = pending.flatMap(p => {
    const a = answers.get(p.field.id);
    return a && a.answerable && a.text ? [{ id: p.field.id, text: a.text }] : [];
  });

  let verdicts: unknown = null;
  if (drafts.length > 0) {
    try {
      const invocation = await AgentInvokerService.invoke('cv-verifier', {
        facts: hardDataForPrompt(hard),
        highlights: [],
        statements: drafts,
      }, userId);
      if (!invocation.success) throw new Error(invocation.error ?? 'verifier returned a failure');
      verdicts = invocation.output;
    } catch {
      verdicts = null;
    }
  }

  const corpus = factsCorpus(hard);

  for (const p of pending) {
    const { field, classification } = p;
    const a = answers.get(field.id);

    if (!a || !a.answerable || !a.text) {
      out.set(field.id, unresolved(p,
        classification.category === 'capability-check'
          ? `Tu CV no muestra "${classification.capability ?? field.label}". FITCV no responde que sí por ti.`
          : classification.category === 'motivation'
            ? 'No se pudo redactar un borrador con lo que dice tu CV.'
            : 'Tu CV no tiene experiencia que responda esta pregunta.'
      ));
      continue;
    }

    if (field.maxLength && a.text.length > field.maxLength) {
      out.set(field.id, unresolved(p, 'La respuesta redactada superaba el largo permitido.'));
      continue;
    }

    const judged = verdicts === null ? null : judgeStatement(verdicts, field.id, corpus);
    const why = judged ? explainJudgment(judged) : '';

    if (classification.category === 'capability-check') {
      // Un "sí" tiene que ser sólido: si no se confirma, lo decide el candidato.
      if (!judged || !judged.supported) {
        out.set(field.id, unresolved(p,
          `No se pudo confirmar con tu CV que tengas "${classification.capability ?? field.label}"${why ? ` (${why})` : ''}. FITCV no responde que sí por ti.`
        ));
        continue;
      }
      const yes = yesOption(field.options);
      out.set(field.id, yes
        ? { fieldId: field.id, category: classification.category, status: 'filled', value: yes, source: `Tu CV lo respalda: ${a.text}` }
        : unresolved(p, 'No hay una opción afirmativa que elegir.'));
      continue;
    }

    if (classification.category === 'motivation') {
      // Una motivación o carta la aprueba siempre el candidato antes de enviarla.
      const warning = judged === null
        ? ' No se pudo verificar contra tu CV.'
        : judged.supported
          ? ''
          : ` Ojo: ${why || 'afirma algo que tu CV no respalda'}.`;
      out.set(field.id, forApproval(p, a.text, `Es un borrador: revísalo antes de enviarlo.${warning}`));
      continue;
    }

    // Pregunta de experiencia: solo se envía sola si cada afirmación tiene
    // respaldo real. Si no, el borrador sigue siendo útil, pero lo revisa el
    // candidato con lo dudoso señalado.
    if (!judged || !judged.supported) {
      out.set(field.id, forApproval(p, a.text, judged === null
        ? 'Es un borrador sin verificar: no se pudo contrastar con tu CV. Revísalo antes de enviarlo.'
        : `Es un borrador: tu CV no respalda todo lo que dice${why ? ` (${why})` : ''}. Corrígelo antes de enviarlo.`
      ));
      continue;
    }

    out.set(field.id, {
      fieldId: field.id,
      category: classification.category,
      status: 'filled',
      value: a.text,
      source: 'Redactada con tu experiencia y verificada afirmación por afirmación contra tu CV.',
    });
  }

  return out;
}

export async function resolveFields(
  fields: ApplicationField[],
  job: JobContext | undefined,
  userId: string
): Promise<FieldResolution> {
  // Un formulario sin preguntas (postular con un clic) no necesita el perfil.
  if (fields.length === 0) return { resolutions: [], summary: {} };

  const hard = await loadHardData(userId);

  const classified = fields.map(field => ({ field, classification: classifyField(field) }));
  const resolutions = classified.map(({ field, classification }) =>
    resolveDeterministic(field, classification, hard)
  );

  const pending = classified.filter((_, i) => resolutions[i].status === 'needs-generation');
  if (pending.length > 0) {
    const drafted = await draftAnswers(pending, hard, job, userId);
    resolutions.forEach((resolution, i) => {
      const replacement = drafted.get(classified[i].field.id);
      if (resolution.status === 'needs-generation' && replacement) resolutions[i] = replacement;
    });
  }

  const summary = resolutions.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return { resolutions, summary };
}
