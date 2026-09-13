/**
 * Lectura tolerante de las columnas JSON de SQLite.
 *
 * Las filas pueden venir nulas, vacías o con JSON corrupto (perfiles antiguos,
 * escrituras a medias, respuestas raras de un agente). Un JSON.parse directo
 * convierte una sola fila mala en un 500 para todo el endpoint.
 */
export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value !== 'string') return fallback;

  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;

  try {
    const parsed = JSON.parse(trimmed);
    return parsed === null ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

/** Normaliza a array: acepta un array, un objeto de categorías, o nada. */
export function asArray<T = string>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    return Object.values(value).flat() as T[];
  }
  return [];
}

/**
 * Extrae JSON de una respuesta de LLM: texto plano, bloque markdown, o un
 * objeto embebido en prosa. Devuelve null si no hay JSON recuperable, para que
 * quien llama decida el fallback en vez de recibir una excepción.
 */
export function extractJson<T = any>(text: string): T | null {
  if (typeof text !== 'string' || text.trim().length === 0) return null;

  const candidates = [
    text,
    text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)?.[1],
    text.match(/\{[\s\S]*\}/)?.[0],
    text.match(/\[[\s\S]*\]/)?.[0],
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate.trim()) as T;
    } catch {
      // se prueba la siguiente forma
    }
  }

  return null;
}
