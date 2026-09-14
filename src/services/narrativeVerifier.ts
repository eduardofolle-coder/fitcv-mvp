/**
 * Segunda capa de "sin mentiras".
 *
 * Los datos duros ya no pasan por el modelo. Lo que queda por vigilar es la
 * narrativa: un logro reformulado que agrega autoría ("lideró la migración"
 * donde el CV solo dice "migración"), cifras que el original no tiene, o
 * elogios que nadie afirmó.
 *
 * Primero un chequeo mecánico de cifras, sin IA. Después un verificador
 * independiente juzga cada afirmación. Los logros reformulados se comparan
 * contra su línea original. Los textos libres (titular, resumen, respuestas)
 * se desglosan en afirmaciones, y cada una debe citar textualmente el dato que
 * la respalda: el código comprueba que esa cita exista en el CV, porque un
 * verificador que juzga contra el CV entero tiende a dar por buena una unión
 * de hechos separados. Lo que no pasa se repara volviendo a la redacción
 * original, que es verdadera por definición.
 */
import { AgentInvokerService } from './agentInvoker.js';
import { hardDataForPrompt, type HardData, type Highlight, type Narrative } from './cvComposer.js';

type Judged = { verdict?: unknown; reason?: unknown };

interface Repair {
  narrative: Narrative;
  adjustments: string[];
}

export interface StatementJudgment {
  supported: boolean;
  reason: string;
  unsupportedClaims: string[];
}

const NUMBER = /\d+(?:[.,]\d+)?/g;

// Una cita más corta que esto calza en cualquier parte y no prueba nada.
const MIN_QUOTE_LENGTH = 3;

const normalizeForQuote = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Cifras del texto que no aparecen en la fuente. */
export function ungroundedNumbers(text: string, source: string): string[] {
  const available = new Set(source.match(NUMBER) ?? []);
  return [...new Set(text.match(NUMBER) ?? [])].filter(n => !available.has(n));
}

export const highlightId = (experienceId: string, position: number): string =>
  `${experienceId}#${position}`;

const isSupported = (judged: Judged | undefined): boolean =>
  typeof judged?.verdict === 'string' && judged.verdict.trim().toLowerCase() === 'supported';

const reasonOf = (judged: Judged | undefined): string =>
  typeof judged?.reason === 'string' ? judged.reason.trim().replace(/[.\s]+$/, '') : '';

const originalOf = (hard: HardData, experienceId: string, h: Highlight): string | undefined =>
  hard.experience.find(e => e.id === experienceId)?.details[h.sourceIndex];

/** Sin IA: una cifra que el origen no contiene no puede quedar en el CV. */
export function mechanicalCheck(narrative: Narrative, hard: HardData): Repair {
  const adjustments: string[] = [];
  const highlights: Narrative['highlights'] = {};

  for (const [experienceId, list] of Object.entries(narrative.highlights)) {
    highlights[experienceId] = list.map(h => {
      const original = originalOf(hard, experienceId, h);
      if (original === undefined) return h;

      const added = ungroundedNumbers(h.text, original);
      if (added.length === 0) return h;

      adjustments.push(
        `Se restauró la redacción original de un logro: la versión adaptada agregaba cifras que el CV no contiene (${added.join(', ')}).`
      );
      return { text: original, sourceIndex: h.sourceIndex };
    });
  }

  const facts = JSON.stringify(hardDataForPrompt(hard));
  let { headline, summary } = narrative;

  if (headline && ungroundedNumbers(headline, facts).length > 0) {
    adjustments.push('Se quitó el titular porque mencionaba cifras que el CV no contiene.');
    headline = '';
  }
  if (summary && ungroundedNumbers(summary, facts).length > 0) {
    adjustments.push('Se quitó el resumen porque mencionaba cifras que el CV no contiene.');
    summary = '';
  }

  return { narrative: { ...narrative, headline, summary, highlights }, adjustments };
}

/**
 * Lo que se le manda al verificador: solo lo que el modelo reescribió, junto
 * a su origen. Sin nombre ni contacto.
 */
export function verifierInput(narrative: Narrative, hard: HardData) {
  const highlights = Object.entries(narrative.highlights).flatMap(([experienceId, list]) =>
    list.flatMap((h, position) => {
      const original = originalOf(hard, experienceId, h);
      // Si coincide con el original no hay nada que juzgar.
      if (original === undefined || original === h.text) return [];
      return [{ id: highlightId(experienceId, position), original, rewritten: h.text }];
    })
  );

  const statements: Array<{ id: 'headline' | 'summary'; text: string }> = [];
  if (narrative.headline) statements.push({ id: 'headline', text: narrative.headline });
  if (narrative.summary) statements.push({ id: 'summary', text: narrative.summary });

  return { facts: hardDataForPrompt(hard), highlights, statements };
}

const indexById = (list: unknown): Map<string, Judged & { claims?: unknown }> => {
  const map = new Map<string, Judged & { claims?: unknown }>();
  if (!Array.isArray(list)) return map;
  for (const item of list) {
    if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
      map.set((item as { id: string }).id, item as Judged & { claims?: unknown });
    }
  }
  return map;
};

/** Todo el texto del registro verificado, para comprobar que una cita existe. */
export function factsCorpus(hard: HardData): string {
  const facts = hardDataForPrompt(hard);
  return normalizeForQuote(
    [
      facts.yearsExperience === null ? '' : String(facts.yearsExperience),
      ...facts.experience.flatMap(e => [e.company, e.title, e.startDate, e.endDate, ...e.details]),
      ...facts.education.flatMap(e => [e.institution, e.degree, e.field, e.graduationDate]),
      ...facts.languages.flatMap(l => [l.language, l.proficiency]),
      ...facts.certifications.flatMap(c => [c.name, c.issuer, c.date]),
      ...facts.skills,
    ].join(' | ')
  );
}

/**
 * Juzga un texto libre. Solo es válido si el verificador lo desglosó en
 * afirmaciones y cada una cita un respaldo que existe de verdad en el CV. Un
 * "supported" sin desglose, o con una cita inventada, no cuenta.
 */
export function judgeStatement(result: unknown, id: string, corpus: string): StatementJudgment {
  const src = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
  const judged = indexById(src.statements).get(id);
  if (!judged) return { supported: false, reason: '', unsupportedClaims: [] };

  const claims = Array.isArray(judged.claims) ? judged.claims : [];
  const unsupportedClaims: string[] = [];

  for (const item of claims) {
    const claim = item && typeof item === 'object' && typeof (item as any).claim === 'string'
      ? (item as any).claim.trim()
      : '';
    const quote = item && typeof item === 'object' && typeof (item as any).supportedBy === 'string'
      ? normalizeForQuote((item as any).supportedBy)
      : '';

    const backed =
      isSupported(item as Judged) &&
      quote.length >= MIN_QUOTE_LENGTH &&
      corpus.includes(quote);

    if (!backed) unsupportedClaims.push(claim || '(afirmación sin detallar)');
  }

  return {
    supported: isSupported(judged) && claims.length > 0 && unsupportedClaims.length === 0,
    reason: reasonOf(judged),
    unsupportedClaims,
  };
}

/** Motivo legible: lo que explicó el verificador y qué afirmaciones no tienen respaldo. */
export function explainJudgment(judgment: StatementJudgment): string {
  const parts: string[] = [];
  if (judgment.reason) parts.push(judgment.reason);
  if (judgment.unsupportedClaims.length > 0) {
    const listed = judgment.unsupportedClaims.slice(0, 3).map(c => `"${c}"`).join(', ');
    parts.push(`sin respaldo en tu CV: ${listed}`);
  }
  return parts.join('; ');
}

/**
 * Aplica el juicio del verificador. Lo que llega sin veredicto se trata como no
 * verificado: si el verificador se saltó algo, no se asume que era verdad.
 */
export function applyVerdicts(narrative: Narrative, hard: HardData, result: unknown): Repair {
  const src = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
  const highlightVerdicts = indexById(src.highlights);

  const needsJudgment = new Set(verifierInput(narrative, hard).highlights.map(h => h.id));
  const adjustments: string[] = [];
  const highlights: Narrative['highlights'] = {};

  for (const [experienceId, list] of Object.entries(narrative.highlights)) {
    highlights[experienceId] = list.map((h, position) => {
      const id = highlightId(experienceId, position);
      if (!needsJudgment.has(id)) return h;

      const judged = highlightVerdicts.get(id);
      if (isSupported(judged)) return h;

      const reason = reasonOf(judged);
      adjustments.push(
        `Se restauró la redacción original de un logro porque la versión adaptada afirmaba más de lo que dice el CV${reason ? `: ${reason}` : ''}.`
      );
      return { text: originalOf(hard, experienceId, h) ?? h.text, sourceIndex: h.sourceIndex };
    });
  }

  const corpus = factsCorpus(hard);
  let { headline, summary } = narrative;

  const headlineJudgment = judgeStatement(result, 'headline', corpus);
  if (headline && !headlineJudgment.supported) {
    const why = explainJudgment(headlineJudgment);
    adjustments.push(`Se quitó el titular porque no pudo sostenerse con el CV${why ? `: ${why}` : ''}.`);
    headline = '';
  }

  const summaryJudgment = judgeStatement(result, 'summary', corpus);
  if (summary && !summaryJudgment.supported) {
    const why = explainJudgment(summaryJudgment);
    adjustments.push(`Se quitó el resumen porque no pudo sostenerse con el CV${why ? `: ${why}` : ''}.`);
    summary = '';
  }

  return { narrative: { ...narrative, headline, summary, highlights }, adjustments };
}

export async function verifyNarrative(
  narrative: Narrative,
  hard: HardData,
  userId: string
): Promise<Repair> {
  const mechanical = mechanicalCheck(narrative, hard);
  const input = verifierInput(mechanical.narrative, hard);

  if (input.highlights.length === 0 && input.statements.length === 0) return mechanical;

  let result: unknown;
  try {
    const invocation = await AgentInvokerService.invoke('cv-verifier', input, userId);
    if (!invocation.success) throw new Error(invocation.error ?? 'verifier returned a failure');
    result = invocation.output;
  } catch {
    // Falla cerrada: sin verificación no se publica narrativa sin verificar.
    // Se vuelve a la redacción original, que es verdadera por definición.
    return {
      narrative: applyVerdicts(mechanical.narrative, hard, {}).narrative,
      adjustments: [
        ...mechanical.adjustments,
        'No se pudo verificar la narrativa adaptada, así que se usó la redacción original del CV.',
      ],
    };
  }

  const applied = applyVerdicts(mechanical.narrative, hard, result);
  return {
    narrative: applied.narrative,
    adjustments: [...mechanical.adjustments, ...applied.adjustments],
  };
}
