/**
 * Segunda capa de "sin mentiras".
 *
 * Los datos duros ya no pasan por el modelo. Lo que queda por vigilar es la
 * narrativa: un logro reformulado que agrega autoría ("lideró la migración"
 * donde el CV solo dice "migración"), cifras que el original no tiene, o
 * elogios que nadie afirmó.
 *
 * Primero un chequeo mecánico de cifras, sin IA. Después un verificador
 * independiente juzga cada afirmación contra su origen. Lo que no pasa se
 * repara volviendo a la redacción original, que es verdadera por definición.
 */
import { AgentInvokerService } from './agentInvoker.js';
import { hardDataForPrompt, type HardData, type Highlight, type Narrative } from './cvComposer.js';

type Judged = { verdict?: unknown; reason?: unknown };

interface Repair {
  narrative: Narrative;
  adjustments: string[];
}

const NUMBER = /\d+(?:[.,]\d+)?/g;

/** Cifras del texto que no aparecen en la fuente. */
export function ungroundedNumbers(text: string, source: string): string[] {
  const available = new Set(source.match(NUMBER) ?? []);
  return [...new Set(text.match(NUMBER) ?? [])].filter(n => !available.has(n));
}

export const highlightId = (experienceId: string, position: number): string =>
  `${experienceId}#${position}`;

const isSupported = (judged: Judged | undefined): boolean =>
  typeof judged?.verdict === 'string' && judged.verdict.trim().toLowerCase() === 'supported';

const reasonOf = (judged: Judged | undefined): string => {
  const reason =
    typeof judged?.reason === 'string' ? judged.reason.trim().replace(/[.\s]+$/, '') : '';
  return reason ? `: ${reason}` : '';
};

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

const indexById = (list: unknown): Map<string, Judged> => {
  const map = new Map<string, Judged>();
  if (!Array.isArray(list)) return map;
  for (const item of list) {
    if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
      map.set((item as { id: string }).id, item as Judged);
    }
  }
  return map;
};

/**
 * Aplica el juicio del verificador. Lo que llega sin veredicto se trata como no
 * verificado: si el verificador se saltó algo, no se asume que era verdad.
 */
export function applyVerdicts(narrative: Narrative, hard: HardData, result: unknown): Repair {
  const src = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
  const highlightVerdicts = indexById(src.highlights);
  const statementVerdicts = indexById(src.statements);

  const needsJudgment = new Set(verifierInput(narrative, hard).highlights.map(h => h.id));
  const adjustments: string[] = [];
  const highlights: Narrative['highlights'] = {};

  for (const [experienceId, list] of Object.entries(narrative.highlights)) {
    highlights[experienceId] = list.map((h, position) => {
      const id = highlightId(experienceId, position);
      if (!needsJudgment.has(id)) return h;

      const judged = highlightVerdicts.get(id);
      if (isSupported(judged)) return h;

      adjustments.push(
        `Se restauró la redacción original de un logro porque la versión adaptada afirmaba más de lo que dice el CV${reasonOf(judged)}.`
      );
      return { text: originalOf(hard, experienceId, h) ?? h.text, sourceIndex: h.sourceIndex };
    });
  }

  let { headline, summary } = narrative;

  if (headline && !isSupported(statementVerdicts.get('headline'))) {
    adjustments.push(`Se quitó el titular porque no pudo sostenerse con el CV${reasonOf(statementVerdicts.get('headline'))}.`);
    headline = '';
  }
  if (summary && !isSupported(statementVerdicts.get('summary'))) {
    adjustments.push(`Se quitó el resumen porque no pudo sostenerse con el CV${reasonOf(statementVerdicts.get('summary'))}.`);
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
