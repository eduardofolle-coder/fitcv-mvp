/**
 * robots.txt: qué rutas pide cada sitio que los robots no lean.
 *
 * Se aplican los grupos que nombran a FITCV; si no hay ninguno, los de "*".
 * Entre reglas que calzan gana la más larga, y ante un empate, Allow, como
 * hacen los buscadores.
 */

export interface RobotsRules {
  allow: string[];
  disallow: string[];
  /** Segundos que el sitio pide esperar entre páginas, si lo indica. */
  crawlDelay?: number;
}

export function parseRobots(text: string, agent: string): RobotsRules {
  const groups: Array<{ agents: string[]; allow: string[]; disallow: string[]; crawlDelay?: number }> = [];
  let current: (typeof groups)[number] | null = null;
  let previousWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (!line || colon === -1) continue;

    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === 'user-agent') {
      // Varias líneas User-agent seguidas comparten el mismo grupo.
      if (!current || !previousWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      previousWasAgent = true;
      continue;
    }

    previousWasAgent = false;
    if (!current || !value) continue;
    if (key === 'allow') current.allow.push(value);
    if (key === 'disallow') current.disallow.push(value);
    if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) current.crawlDelay = Math.max(current.crawlDelay ?? 0, seconds);
    }
  }

  const token = agent.toLowerCase();
  const named = groups.filter(g => g.agents.some(a => a !== '*' && a.split(',').some(name => name.trim() && token.includes(name.trim()))));
  const chosen = named.length > 0 ? named : groups.filter(g => g.agents.includes('*'));

  const delays = chosen.map(g => g.crawlDelay).filter((d): d is number => d !== undefined);

  return {
    allow: chosen.flatMap(g => g.allow),
    disallow: chosen.flatMap(g => g.disallow),
    ...(delays.length > 0 ? { crawlDelay: Math.max(...delays) } : {}),
  };
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** `path` incluye la query, como la ve el sitio: "/trabajo/123?x=1". */
export function isAllowed(rules: RobotsRules, path: string): boolean {
  let best: { length: number; allow: boolean } | null = null;

  const consider = (patterns: string[], allow: boolean) => {
    for (const pattern of patterns) {
      if (!patternToRegex(pattern).test(path)) continue;
      if (!best || pattern.length > best.length || (pattern.length === best.length && allow)) {
        best = { length: pattern.length, allow };
      }
    }
  };

  consider(rules.allow, true);
  consider(rules.disallow, false);

  return best === null ? true : (best as { allow: boolean }).allow;
}
