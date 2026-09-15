/**
 * Afinidad entre el perfil del candidato y una oferta.
 *
 * El perfil que FITCV extrae del CV se convierte en términos: las áreas de sus
 * cargos y estudios (logística, comercio exterior, desarrollo de software...),
 * con sus sinónimos habituales en el mercado chileno, y sus habilidades duras
 * (SAP, Excel, Node.js). Las habilidades blandas no cuentan: "capacidad
 * analítica" calza con cualquier oferta y no dice nada del perfil.
 *
 * Una oferta es afín cuando el área del candidato aparece en el título, o
 * varias veces en la descripción. Lo que aparece en el título pesa más. Sin IA:
 * se calcula sobre miles de ofertas en cada consulta.
 */

export const fold = (value: string): string => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Texto comparable: sin tildes, en minúsculas, solo palabras. Conserva "c++", "c#" y "node.js". */
export function searchable(value: string): string {
  return fold(value)
    .replace(/\.(?![a-z0-9])|(?<![a-z0-9])\./g, ' ')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Áreas con los nombres con que las publican los portales. El primero es el nombre visible.
const SYNONYM_GROUPS = [
  { display: 'logística', variants: ['logistica', 'logistico', 'logistics'] },
  { display: 'supply chain', variants: ['supply chain', 'cadena de suministro', 'cadena de abastecimiento', 'scm'] },
  { display: 'abastecimiento', variants: ['abastecimiento', 'compras', 'procurement', 'purchasing', 'adquisiciones', 'aprovisionamiento'] },
  { display: 'comercio exterior', variants: ['comercio exterior', 'comex', 'importaciones', 'exportaciones', 'importacion', 'exportacion', 'aduana', 'aduanas', 'foreign trade'] },
  { display: 'transporte internacional', variants: ['transporte internacional', 'freight forwarder', 'forwarder', 'embarques', 'transporte maritimo'] },
  { display: 'transporte', variants: ['transporte', 'distribucion', 'fletes', 'flota', 'transportation'] },
  { display: 'bodega', variants: ['bodega', 'almacen', 'warehouse', 'centro de distribucion', 'inventario', 'inventarios', 'wms'] },
  { display: 'operaciones', variants: ['operaciones', 'operations', 'operacional'] },
  { display: 'proveedores', variants: ['proveedores', 'suppliers'] },
  { display: 'ventas', variants: ['ventas', 'sales', 'vendedor', 'vendedora'] },
  { display: 'recursos humanos', variants: ['recursos humanos', 'rrhh', 'human resources'] },
  { display: 'contabilidad', variants: ['contabilidad', 'contable', 'accounting', 'contador', 'contadora'] },
  { display: 'finanzas', variants: ['finanzas', 'finance', 'financiero', 'financiera', 'tesoreria'] },
  { display: 'desarrollo de software', variants: ['desarrollo de software', 'software', 'programador', 'programadora', 'developer', 'desarrollador', 'desarrolladora'] },
  { display: 'enfermería', variants: ['enfermeria', 'enfermera', 'enfermero', 'tens', 'nurse'] },
  { display: 'marketing', variants: ['marketing', 'mercadeo'] },
  { display: 'atención al cliente', variants: ['atencion al cliente', 'servicio al cliente', 'customer service', 'customer support', 'call center'] },
  { display: 'mantención', variants: ['mantencion', 'mantenimiento', 'maintenance'] },
  { display: 'calidad', variants: ['control de calidad', 'aseguramiento de calidad', 'quality assurance'] },
].map(group => ({ display: group.display, variants: group.variants.map(searchable) }));

// Palabras que no describen un área: conectores, lugares, trámites de estudio.
const STOPWORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u', 'en', 'para', 'por', 'con', 'sin', 'a', 'al',
  'un', 'una', 'su', 'sus', 'se', 'que', 'the', 'and', 'of', 'for', 'in', 'at', 'to', 'with',
  'sa', 'spa', 'ltda', 'limitada', 'eirl', 'chile', 'santiago', 'region', 'empresa', 'area', 'nivel',
  'experiencia', 'anos', 'egresado', 'egresada', 'titulado', 'titulada', 'titulo', 'carrera', 'curso',
  'diplomado', 'universidad', 'instituto', 'escuela', 'profesional', 'tecnico', 'tecnica', 'ingenieria',
  'ingeniero', 'ingeniera', 'licenciatura', 'magister', 'honorarios', 'part', 'time', 'full', 'practica',
  'practicante', 'otros', 'otras', 'general', 'generales',
]);

// Cargos y niveles: dicen la jerarquía, no el área, y calzarían con todo.
const LEVEL_WORDS = new Set([
  'asistente', 'auxiliar', 'analista', 'coordinador', 'coordinadora', 'supervisor', 'supervisora', 'jefe',
  'jefa', 'subgerente', 'gerente', 'encargado', 'encargada', 'ejecutivo', 'ejecutiva', 'especialista',
  'senior', 'semi', 'junior', 'trainee', 'director', 'directora', 'lider', 'head', 'manager', 'lead',
  'responsable', 'administrativo', 'administrativa', 'operario', 'operaria', 'ayudante', 'agente',
  'representante', 'consultor', 'consultora', 'asesor', 'asesora', 'intern', 'associate',
]);

const ENTRY_LEVEL = /(^|\s)(practica|practicante|alumno|alumna|estudiante|trainee|junior|aprendiz|internship|intern)(\s|$)/;
const SENIOR_LEVEL = /(^|\s)(gerente|subgerente|jefe|jefa|head|lider|supervisor|supervisora|coordinador|coordinadora|senior|especialista|manager|lead)(\s|$)/;

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Palabras largas calzan también con sus variantes: "logistica" con "logistico" o "logistics".
function variantPattern(variant: string): string {
  if (!variant.includes(' ') && variant.length >= 7) {
    return `(?:^|[^a-z0-9])${escapeRegex(variant.slice(0, -1))}[a-z]*(?=$|[^a-z0-9])`;
  }
  return `(?:^|[^a-z0-9])${escapeRegex(variant).replace(/ /g, '\\s+')}(?=$|[^a-z0-9+#])`;
}

const compile = (variants: string[], flags = ''): RegExp => new RegExp(variants.map(variantPattern).join('|'), flags);

export interface ProfileTerm {
  key: string;
  display: string;
  variants: string[];
  weight: number;
  kind: 'role' | 'skill';
  pattern: RegExp;
}

export interface MatchingProfile {
  terms: ProfileTerm[];
  yearsExperience: number | null;
  referenceWeight: number;
}

export interface ProfileInput {
  yearsExperience?: number | null;
  experience?: unknown;
  education?: unknown;
  skills?: unknown;
  summary?: string | null;
}

const field = (value: unknown, key: string): string =>
  value && typeof value === 'object' && typeof (value as Record<string, unknown>)[key] === 'string'
    ? ((value as Record<string, unknown>)[key] as string)
    : '';

/** Forma visible de cada palabra, para mostrar "logística" y no "logistica". */
function displayForms(text: string): Map<string, string> {
  const forms = new Map<string, string>();
  for (const word of text.split(/[^\p{L}\p{N}+#.]+/u)) {
    const key = searchable(word);
    if (key && !forms.has(key)) forms.set(key, word);
  }
  return forms;
}

export function buildMatchingProfile(input: ProfileInput): MatchingProfile {
  const acc = new Map<string, { display: string; variants: string[]; weight: number; kind: 'role' | 'skill' }>();
  const add = (key: string, display: string, variants: string[], weight: number, kind: 'role' | 'skill') => {
    const current = acc.get(key);
    if (current) current.weight += weight;
    else acc.set(key, { display, variants, weight, kind });
  };

  // Cargos recientes pesan más; el resumen solo aporta áreas conocidas, porque
  // su vocabulario ("gestión", "procesos") es demasiado general.
  const sources: Array<{ text: string; weight: number; rawTokens: boolean }> = [];
  const experience = Array.isArray(input.experience) ? input.experience : [];
  experience.forEach((entry, i) => {
    const title = field(entry, 'title');
    if (title) sources.push({ text: title, weight: i < 3 ? 3 : 2, rawTokens: true });
  });
  for (const entry of Array.isArray(input.education) ? input.education : []) {
    const text = [field(entry, 'degree'), field(entry, 'field')].filter(Boolean).join(' ');
    if (text) sources.push({ text, weight: 2, rawTokens: true });
  }
  if (input.summary) sources.push({ text: input.summary, weight: 1, rawTokens: false });

  for (const { text, weight, rawTokens } of sources) {
    let rest = ` ${searchable(text)} `;
    const seen = new Set<string>();

    for (const group of SYNONYM_GROUPS) {
      if (!compile(group.variants).test(rest)) continue;
      const key = group.variants[0];
      if (!seen.has(key)) {
        seen.add(key);
        add(key, group.display, group.variants, weight, 'role');
      }
      rest = rest.replace(compile(group.variants, 'g'), ' ');
    }

    if (!rawTokens) continue;
    const forms = displayForms(text);
    for (const token of rest.split(' ')) {
      if (token.length < 4 || /^\d+$/.test(token) || STOPWORDS.has(token) || LEVEL_WORDS.has(token) || seen.has(token)) continue;
      seen.add(token);
      add(token, forms.get(token) ?? token, [token], weight, 'role');
    }
  }

  const skillLists: unknown[] = Array.isArray(input.skills)
    ? input.skills
    : input.skills && typeof input.skills === 'object'
      ? Object.entries(input.skills as Record<string, unknown>)
          .filter(([group]) => group !== 'soft')
          .flatMap(([, list]) => (Array.isArray(list) ? list : []))
      : [];

  for (const skill of skillLists) {
    if (typeof skill !== 'string') continue;
    const key = searchable(skill);
    if (key.length < 2 || key.length > 40 || key.split(' ').length > 3) continue;

    const group = SYNONYM_GROUPS.find(g => compile(g.variants).test(` ${key} `));
    if (group) add(group.variants[0], group.display, group.variants, 2, 'role');
    else add(key, skill.trim(), [key], 2, 'skill');
  }

  const all = [...acc.entries()].map(([key, term]) => ({ key, ...term, pattern: compile(term.variants) }));
  const roles = all.filter(t => t.kind === 'role').sort((a, b) => b.weight - a.weight).slice(0, 20);
  const skills = all.filter(t => t.kind === 'skill').sort((a, b) => b.weight - a.weight).slice(0, 15);
  const topRoles = roles.slice(0, 3).reduce((sum, t) => sum + t.weight, 0);

  return {
    terms: [...roles, ...skills],
    yearsExperience: typeof input.yearsExperience === 'number' ? input.yearsExperience : null,
    referenceWeight: Math.max(3 * topRoles, 6),
  };
}

export interface OfferMatch {
  score: number;
  recommended: boolean;
  reasons: string[];
}

export function scoreOffer(offer: { title?: string | null; description?: string | null }, profile: MatchingProfile): OfferMatch {
  const title = ` ${searchable(offer.title ?? '')} `;
  const body = ` ${searchable((offer.description ?? '').slice(0, 15000))} `;

  const titleHits: ProfileTerm[] = [];
  const bodyHits: ProfileTerm[] = [];
  let raw = 0;

  for (const term of profile.terms) {
    if (term.pattern.test(title)) {
      titleHits.push(term);
      raw += term.weight * (term.kind === 'skill' ? 2 : 3);
    } else if (term.pattern.test(body)) {
      bodyHits.push(term);
      raw += term.weight * (term.kind === 'skill' ? 1.5 : 1);
    }
  }

  let score = Math.round(Math.min(100, (raw / profile.referenceWeight) * 100));
  const rolesInTitle = titleHits.filter(t => t.kind === 'role').length;
  const rolesInBody = bodyHits.filter(t => t.kind === 'role').length;
  const skillHits = [...titleHits, ...bodyHits].filter(t => t.kind === 'skill').length;

  let recommended = rolesInTitle > 0 || (rolesInBody >= 2 && skillHits > 0) || rolesInBody >= 3;

  // Una práctica o un cargo junior no es para quien lleva años en el área.
  const years = profile.yearsExperience ?? 0;
  if (years >= 5 && ENTRY_LEVEL.test(title)) {
    score = Math.round(score * 0.4);
    if (rolesInTitle < 2) recommended = false;
  } else if (years >= 8 && recommended && SENIOR_LEVEL.test(title)) {
    score = Math.min(100, score + 10);
  }

  if (score < 15) recommended = false;

  return {
    score,
    recommended,
    reasons: [...titleHits, ...bodyHits].slice(0, 5).map(t => t.display),
  };
}

/** Patrones LIKE para acotar en SQL las ofertas candidatas antes de puntuar. */
export function likePatterns(profile: MatchingProfile, max = 150): string[] {
  const patterns = new Set<string>();
  for (const term of profile.terms) {
    for (const variant of term.variants.slice(0, 6)) {
      const core = !variant.includes(' ') && variant.length >= 7 ? variant.slice(0, -1) : variant;
      patterns.add(`%${core}%`);
      if (patterns.size >= max) return [...patterns];
    }
  }
  return [...patterns];
}

/** Cuántas áreas del perfil nombra el enlace de una oferta ("/trabajo/jefe-de-logistica-123"). */
export function slugPriority(url: string, terms: ProfileTerm[]): number {
  let path = url;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    // Una URL rara se evalúa tal cual.
  }
  const slug = ` ${searchable(path.replace(/[-_/]+/g, ' '))} `;
  return terms.filter(term => term.pattern.test(slug)).length;
}

/** Columnas de búsqueda de una oferta: sin tildes, para buscar "logistica" y encontrar "Logística". */
export const offerSearchColumns = (offer: { title?: string | null; company?: string | null; description?: string | null }) => ({
  searchTitle: searchable(offer.title ?? ''),
  searchText: searchable(`${offer.title ?? ''} ${offer.company ?? ''} ${offer.description ?? ''}`).slice(0, 30000),
});
