/**
 * Arma el CV adaptado separando dos capas.
 *
 * Datos duros (nombre, contacto, empresas, cargos, fechas, educación, idiomas,
 * certificaciones): salen del perfil y se copian tal cual. El modelo nunca los
 * escribe, así que no puede alterarlos.
 *
 * Narrativa (titular, resumen, cómo se cuenta cada logro, qué habilidades van
 * primero): la propone el modelo por oferta, y solo se acepta lo que se puede
 * rastrear hasta un dato del CV original.
 */
import { safeJsonParse } from '../utils/safeJson.js';

export interface ExperienceEntry {
  id: string;
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  details: string[];
}

export interface EducationEntry {
  institution: string;
  degree: string;
  field: string;
  graduationDate: string;
}

export interface HardData {
  fullName: string;
  yearsExperience: number | null;
  contact: { email: string; phone: string; location: string };
  experience: ExperienceEntry[];
  education: EducationEntry[];
  languages: Array<{ language: string; proficiency: string }>;
  certifications: Array<{ name: string; issuer: string; date: string }>;
  skills: string[];
}

export interface Highlight {
  text: string;
  sourceIndex: number;
}

export type CvLanguage = 'es' | 'en';

export interface Narrative {
  headline: string;
  summary: string;
  highlights: Record<string, Highlight[]>;
  skillsFirst: string[];
  rationale: string;
  language: CvLanguage;
}

// Los encabezados siguen el idioma de la narrativa. Antes eran fijos en
// español y una oferta en inglés producía un CV mitad en cada idioma.
const SECTION_LABELS: Record<CvLanguage, Record<
  'profile' | 'experience' | 'education' | 'skills' | 'languages' | 'certifications',
  string
>> = {
  es: {
    profile: 'Perfil',
    experience: 'Experiencia',
    education: 'Educación',
    skills: 'Habilidades',
    languages: 'Idiomas',
    certifications: 'Certificaciones',
  },
  en: {
    profile: 'Profile',
    experience: 'Experience',
    education: 'Education',
    skills: 'Skills',
    languages: 'Languages',
    certifications: 'Certifications',
  },
};

/** Minúsculas y sin tildes, para comparar textos que el CV escribe distinto. */
const fold = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

type StoredExperience = Omit<ExperienceEntry, 'id'>;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : [];

const cap = (s: string, max: number): string =>
  s.length > max ? s.slice(0, max).trimEnd() : s;

const asObjects = (raw: unknown): Record<string, unknown>[] =>
  Array.isArray(raw)
    ? raw.filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
    : [];

/** Del formato del analizador (o del ya guardado) al que se persiste. */
export function normalizeExperience(raw: unknown): StoredExperience[] {
  return asObjects(raw)
    .map(e => ({
      company: str(e.company),
      title: str(e.title),
      startDate: str(e.startDate),
      endDate: str(e.endDate),
      details: [
        ...strList(e.responsibilities),
        ...strList(e.achievements),
        ...strList(e.details),
      ],
    }))
    .filter(e => e.company || e.title);
}

export function normalizeEducation(raw: unknown): EducationEntry[] {
  return asObjects(raw)
    .map(e => ({
      institution: str(e.institution),
      degree: str(e.degree),
      field: str(e.field),
      graduationDate: str(e.graduationDate),
    }))
    .filter(e => e.institution || e.degree);
}

export function normalizeLanguages(raw: unknown): HardData['languages'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item =>
      typeof item === 'string'
        ? { language: item.trim(), proficiency: '' }
        : item && typeof item === 'object'
          ? { language: str((item as any).language), proficiency: str((item as any).proficiency) }
          : { language: '', proficiency: '' }
    )
    .filter(l => l.language);
}

export function normalizeCertifications(raw: unknown): HardData['certifications'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item =>
      typeof item === 'string'
        ? { name: item.trim(), issuer: '', date: '' }
        : item && typeof item === 'object'
          ? { name: str((item as any).name), issuer: str((item as any).issuer), date: str((item as any).date) }
          : { name: '', issuer: '', date: '' }
    )
    .filter(c => c.name);
}

/** Lista plana y sin duplicados, conservando la escritura del CV. */
export function flattenSkillList(raw: unknown): string[] {
  const values = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.values(raw).flat()
      : [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const skill = str(value);
    const key = skill.toLowerCase();
    if (skill && !seen.has(key)) {
      seen.add(key);
      out.push(skill);
    }
  }
  return out;
}

export function buildHardData(
  row: Record<string, any>,
  contact: Record<string, unknown> = {}
): HardData {
  return {
    fullName: str(row.fullName),
    yearsExperience:
      typeof row.yearsExperience === 'number' && Number.isFinite(row.yearsExperience)
        ? row.yearsExperience
        : null,
    contact: {
      email: str(contact.email),
      phone: str(contact.phone),
      location: str(contact.location),
    },
    experience: normalizeExperience(safeJsonParse(row.experience, [])).map((e, i) => ({
      id: `exp-${i}`,
      ...e,
    })),
    education: normalizeEducation(safeJsonParse(row.education, [])),
    languages: normalizeLanguages(safeJsonParse(row.languages, [])),
    certifications: normalizeCertifications(safeJsonParse(row.certifications, [])),
    skills: flattenSkillList(safeJsonParse(row.skills, [])),
  };
}

/**
 * Lo que ve el modelo. Nombre y contacto no le hacen falta para contar la
 * historia, así que no salen del servidor.
 */
export function hardDataForPrompt(hard: HardData) {
  return {
    yearsExperience: hard.yearsExperience,
    experience: hard.experience,
    education: hard.education,
    languages: hard.languages,
    certifications: hard.certifications,
    skills: hard.skills,
  };
}

/**
 * Acepta de la propuesta del modelo solo lo que se sostiene en el CV. Lo que se
 * descarta queda registrado para mostrárselo al usuario.
 */
export function sanitizeNarrative(
  raw: unknown,
  hard: HardData
): { narrative: Narrative; adjustments: string[] } {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const adjustments: string[] = [];

  const highlights: Record<string, Highlight[]> = {};
  const rawHighlights =
    src.highlights && typeof src.highlights === 'object'
      ? (src.highlights as Record<string, unknown>)
      : {};

  for (const [id, list] of Object.entries(rawHighlights)) {
    const role = hard.experience.find(e => e.id === id);
    if (!role) {
      adjustments.push('Se ignoraron logros atribuidos a una experiencia que no existe en el CV.');
      continue;
    }
    if (!Array.isArray(list)) continue;

    const kept: Highlight[] = [];
    for (const item of list) {
      const index = Number((item as any)?.sourceIndex);
      if (!Number.isInteger(index) || index < 0 || index >= role.details.length) {
        adjustments.push('Se descartó un logro que no correspondía a ningún dato del CV original.');
        continue;
      }
      kept.push({ text: str((item as any)?.text) || role.details[index], sourceIndex: index });
    }
    if (kept.length > 0) highlights[id] = kept;
  }

  const allowed = new Map(hard.skills.map(s => [s.toLowerCase(), s]));
  const skillsFirst: string[] = [];
  for (const skill of strList(src.skillsFirst)) {
    const canonical = allowed.get(skill.toLowerCase());
    if (!canonical) {
      adjustments.push(`Se descartó la habilidad "${skill}" porque no figura en el CV.`);
      continue;
    }
    if (!skillsFirst.includes(canonical)) skillsFirst.push(canonical);
  }

  return {
    narrative: {
      headline: cap(str(src.headline), 160),
      summary: cap(str(src.summary), 1200),
      highlights,
      skillsFirst,
      rationale: cap(str(src.rationale), 600),
      language: /^en/i.test(str(src.language)) ? 'en' : 'es',
    },
    adjustments,
  };
}

/** Texto final del CV: datos duros copiados, narrativa aplicada. */
export function composeCV(hard: HardData, narrative: Narrative): string {
  const lines: string[] = [];
  const section = (title: string) => lines.push('', title.toUpperCase());
  const label = SECTION_LABELS[narrative.language] ?? SECTION_LABELS.es;

  if (hard.fullName) lines.push(hard.fullName);
  if (narrative.headline) lines.push(narrative.headline);

  const contactLine = [hard.contact.email, hard.contact.phone, hard.contact.location]
    .filter(Boolean)
    .join(' | ');
  if (contactLine) lines.push(contactLine);

  if (narrative.summary) {
    section(label.profile);
    lines.push(narrative.summary);
  }

  if (hard.experience.length > 0) {
    section(label.experience);
    hard.experience.forEach((role, i) => {
      if (i > 0) lines.push('');
      lines.push([role.title, role.company].filter(Boolean).join(' — '));

      const period = [role.startDate, role.endDate].filter(Boolean).join(' – ');
      if (period) lines.push(period);

      const chosen = narrative.highlights[role.id];
      const bullets = chosen && chosen.length > 0 ? chosen.map(h => h.text) : role.details;
      for (const bullet of bullets) lines.push(`• ${bullet}`);
    });
  }

  if (hard.education.length > 0) {
    section(label.education);
    for (const ed of hard.education) {
      // Si el título ya nombra el área ("Ingeniería Civil en Computación"),
      // repetirla como campo aparte duplicaba el texto.
      const field = ed.field && !fold(ed.degree).includes(fold(ed.field)) ? ed.field : '';
      const main = [[ed.degree, field].filter(Boolean).join(' — '), ed.institution]
        .filter(Boolean)
        .join(', ');
      lines.push(ed.graduationDate ? `${main} (${ed.graduationDate})` : main);
    }
  }

  if (hard.skills.length > 0) {
    section(label.skills);
    const rest = hard.skills.filter(s => !narrative.skillsFirst.includes(s));
    lines.push([...narrative.skillsFirst, ...rest].join(' · '));
  }

  if (hard.languages.length > 0) {
    section(label.languages);
    lines.push(
      hard.languages
        .map(l => (l.proficiency ? `${l.language} (${l.proficiency})` : l.language))
        .join(' · ')
    );
  }

  if (hard.certifications.length > 0) {
    section(label.certifications);
    for (const c of hard.certifications) {
      lines.push([c.name, c.issuer, c.date].filter(Boolean).join(' — '));
    }
  }

  return `${lines.join('\n').trim()}\n`;
}
