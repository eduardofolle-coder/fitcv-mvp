/**
 * Lo que una respuesta redactada no puede decir sobre la situación laboral.
 *
 * Callar que el candidato está sin trabajo no es mentir: nadie lo preguntó y a
 * las empresas les juega en contra. Afirmar un trabajo actual que el CV no
 * muestra, en cambio, sí sería mentir. Las dos cosas se revisan sin IA.
 */
import type { HardData } from './cvComposer.js';

const fold = (value: string): string => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const JOB_SEARCH_STATUS =
  /(desemplead|desempleo|cesante|cesantia|sin (trabajo|empleo)|desocupad|despid|desvincul|finiquit|buscando (trabajo|empleo|nuevas oportunidades laborales)|en busqueda (activa )?de (trabajo|empleo)|reinsertarme|reinsercion laboral|unemployed|laid off|between jobs|looking for (a )?(new )?(job|work)|actualmente no (trabajo|estoy trabajando)|no estoy trabajando)/;

const CURRENT_JOB =
  /(actualmente (trabajo|me desempeno|soy|lidero|estoy a cargo)|en mi (trabajo|empleo|cargo|puesto|empresa) actual|en la empresa donde trabajo|currently (work|working|lead|leading|serve)|in my current (job|role|position))/;

/** Si el cargo más reciente del CV sigue vigente. */
export function hasOngoingRole(hard: HardData): boolean {
  const role = hard.experience[0];
  return Boolean(role && (!role.endDate || /(present|actual|current|hoy|now|a la fecha)/.test(fold(role.endDate))));
}

/** Motivo por el que la respuesta no puede enviarse así, o null si está bien. */
export function employmentStatusIssue(text: string, hard: HardData): string | null {
  const normalized = fold(text);
  if (JOB_SEARCH_STATUS.test(normalized)) return 'mencionaba tu situación laboral o que buscas empleo';
  if (!hasOngoingRole(hard) && CURRENT_JOB.test(normalized)) return 'afirmaba un trabajo actual que tu CV no muestra';
  return null;
}
