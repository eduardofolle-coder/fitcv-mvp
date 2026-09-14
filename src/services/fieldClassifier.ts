/**
 * Decide qué hace FITCV con cada campo de un formulario de postulación antes
 * de escribir nada.
 *
 * La regla que ordena todo: los datos duros se copian del perfil; las
 * decisiones personales (renta, disponibilidad, documentos, datos sensibles)
 * nunca las toma FITCV; y la IA solo redacta donde la respuesta sale de la
 * experiencia del candidato, que después se verifica.
 */
import type { HardData } from './cvComposer.js';

export type FieldCategory =
  | 'hard-data'
  | 'cv-upload'
  | 'experience-question'
  | 'capability-check'
  | 'personal-decision'
  | 'motivation'
  | 'unknown';

export type HardDataKey =
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'location'
  | 'yearsExperience'
  | 'currentTitle'
  | 'currentCompany'
  | 'education'
  | 'languages';

export interface ApplicationField {
  id: string;
  label: string;
  type?: string;
  options?: string[];
  maxLength?: number;
}

export interface Classification {
  category: FieldCategory;
  hardDataKey?: HardDataKey;
  capability?: string;
}

interface Base {
  fieldId: string;
  category: FieldCategory;
}

export type Resolution =
  | (Base & { status: 'filled'; value: string; source: string })
  | (Base & { status: 'needs-approval'; value: string; reason: string })
  | (Base & { status: 'needs-user'; reason: string; suggestion?: string })
  | (Base & { status: 'use-adapted-cv' })
  | (Base & { status: 'needs-generation' });

const NOT_IN_CV = 'Este dato no está en tu CV: complétalo tú.';

const fold = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Etiqueta normalizada: sin tildes, sin signos de pregunta ni asteriscos. */
const clean = (s: string): string =>
  fold(s).replace(/^[¿¡\s]+/, '').replace(/[?!:*.\s]+$/, '');

const CV_UPLOAD = /\b(cv|curriculum|curriculo|resume|hoja de vida)\b/;

const PERSONAL_DECISION =
  /(salari|sueldo|\brenta\b|pretension|expectativa|compensation|remuneracion|disponibilidad|availability|start date|fecha de inicio|cuando podrias|cuando puedes|notice period|preaviso|reubica|relocat|traslad|\bvisa\b|permiso de trabajo|work permit|authoriz|autorizacion|genero|gender|discapacidad|disabilit|etnia|ethnic|nacionalidad|nationality|nacimiento|birth|\bedad\b|\bage\b|\brut\b|\bdni\b|pasaporte|passport|estado civil|marital|^direccion|domicilio|\baddress\b|referencia|reference)/;

const CAPABILITY_START =
  /^(tienes|posees|cuentas con|manejas|dominas|conoces|sabes usar|sabes|usas|has trabajado con|has usado|do you have|are you familiar with|are you experienced (in|with)|have you (used|worked with)|do you know|can you use)\s+/;

const CAPABILITY_OBJECT =
  /(?:experiencia|experience|conocimientos?|knowledge|manejo|dominio)\s+(?:en|con|in|with|of|de)\s+(.+)$/;

const MOTIVATION =
  /(por que (quieres|te interesa|deseas|postulas|te gustaria)|why (do you|are you|would you)|motivacion|motivation|carta de presentacion|cover letter|que te atrae|what attracts|que te motiva|what motivates|tu interes|your interest)/;

const EXPERIENCE_QUESTION =
  /(experiencia|describe|describa|cuentanos|cuentame|ejemplo|logro|proyecto|situacion|desafio|lideraste|experience|tell us|example|achievement|project|situation|challenge|programming languages|lenguajes de programacion)/;

const YES = new Set(['si', 'yes']);
const YES_NO = new Set(['si', 'yes', 'no']);

const isYesNo = (options?: string[]): boolean =>
  Array.isArray(options) &&
  options.length >= 2 &&
  options.length <= 3 &&
  options.every(o => YES_NO.has(clean(o)));

/** La opción afirmativa del campo, o "Sí" si la respuesta es texto libre. */
export function yesOption(options?: string[]): string | undefined {
  if (!options || options.length === 0) return 'Sí';
  return options.find(o => YES.has(clean(o)));
}

function hardDataKeyFor(label: string, type: string): HardDataKey | 'per-skill-years' | undefined {
  if (type === 'email' || /\b(e-?mail|correo)\b/.test(label)) return 'email';
  if (type === 'tel' || /(telefono|celular|movil|phone|whatsapp)/.test(label)) return 'phone';
  if (/(apellido|last name|surname|family name)/.test(label)) return 'lastName';
  if (/(primer nombre|first name|given name)/.test(label) || /^nombres$/.test(label)) return 'firstName';
  if (/(nombre completo|full name)/.test(label) || /^(nombre|name)$/.test(label)) return 'fullName';

  if (/(anos|years)\s+(de\s+)?(experiencia|experience)|(experiencia|experience)\s+(total|laboral|profesional)/.test(label)) {
    // "Años de experiencia en Java" no es el total del CV: responderlo con el
    // total afirmaría años en una tecnología que el CV no desglosa.
    return /(experiencia|experience)\b.*\b(en|con|in|with|using)\s+\S/.test(label)
      ? 'per-skill-years'
      : 'yearsExperience';
  }

  if (/(cargo actual|puesto actual|current (job )?title|current position|current role)/.test(label)) return 'currentTitle';
  if (/(empresa actual|empleador actual|current (company|employer))/.test(label)) return 'currentCompany';
  if (/(ciudad|comuna|region|ubicacion|location|\bcity\b|residencia)/.test(label)) return 'location';
  if (/(idioma|language|nivel de ingles|english level)/.test(label) && !/(programacion|programming)/.test(label)) {
    return 'languages';
  }
  if (/(nivel (educacional|de estudios|academico|educativo)|education level|highest (degree|education|level)|titulo profesional|\bcarrera\b|universidad|university|\bdegree\b|estudios)/.test(label)) {
    return 'education';
  }
  return undefined;
}

export function classifyField(field: ApplicationField): Classification {
  const label = clean(field.label);
  const type = field.type ?? '';

  if (CV_UPLOAD.test(label)) return { category: 'cv-upload' };
  if (PERSONAL_DECISION.test(label)) return { category: 'personal-decision' };

  const start = label.match(CAPABILITY_START);
  if (start || isYesNo(field.options)) {
    const rest = start ? label.slice(start[0].length) : label;
    const capability = (rest.match(CAPABILITY_OBJECT)?.[1] ?? rest).trim();
    if (capability) return { category: 'capability-check', capability };
  }

  const key = hardDataKeyFor(label, type);
  if (key === 'per-skill-years') return { category: 'unknown' };
  if (key) return { category: 'hard-data', hardDataKey: key };

  if (MOTIVATION.test(label)) return { category: 'motivation' };

  if (EXPERIENCE_QUESTION.test(label) && (type === '' || type === 'textarea' || (field.maxLength ?? 0) > 150)) {
    return { category: 'experience-question' };
  }

  return { category: 'unknown' };
}

/**
 * Si el CV nombra la capacidad como palabra completa. El límite de palabra
 * importa: "Java" no puede calzar con "JavaScript", o FITCV respondería que sí
 * a una tecnología que el candidato no declara.
 */
export function mentionedInCv(capability: string, hard: HardData): boolean {
  const needle = fold(capability).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!needle) return false;

  const haystack = fold(
    [
      ...hard.skills,
      ...hard.experience.flatMap(e => [e.title, ...e.details]),
      ...hard.certifications.map(c => c.name),
    ].join(' \n ')
  );

  return new RegExp(`(^|[^a-z0-9])${needle}([^a-z0-9]|$)`).test(haystack);
}

/** Elige el tramo ("3-5", "Más de 10", "5+") que contiene el valor. */
export function pickRangeOption(value: number, options: string[]): string | undefined {
  for (const option of options) {
    const text = fold(option);
    const numbers = (text.match(/\d+/g) ?? []).map(Number);

    if (numbers.length === 2) {
      const [low, high] = numbers;
      if (value >= Math.min(low, high) && value <= Math.max(low, high)) return option;
      continue;
    }
    if (numbers.length !== 1) continue;

    const [n] = numbers;
    if (/(mas de|more than|over)/.test(text)) {
      if (value > n) return option;
      continue;
    }
    if (/(\+|o mas|or more|al menos|at least)/.test(text)) {
      if (value >= n) return option;
      continue;
    }
    if (/(menos de|less than|under)/.test(text)) {
      if (value < n) return option;
      continue;
    }
    if (text.replace(/[^0-9]/g, '') === String(n) && value === n) return option;
  }
  return undefined;
}

const LANGUAGES: Array<{ asked: RegExp; known: RegExp }> = [
  { asked: /(ingles|english)/, known: /(ingl|engl)/ },
  { asked: /(espanol|spanish|castellano)/, known: /(espan|spanish|castell)/ },
  { asked: /(portugues|portuguese)/, known: /portug/ },
  { asked: /(frances|french)/, known: /(franc|french)/ },
  { asked: /(aleman|german)/, known: /(alem|german)/ },
];

function resolveHardData(
  field: ApplicationField,
  base: Base,
  key: HardDataKey | undefined,
  hard: HardData
): Resolution {
  const fill = (value: string, source: string): Resolution =>
    value
      ? { ...base, status: 'filled', value, source }
      : { ...base, status: 'needs-user', reason: NOT_IN_CV };

  switch (key) {
    case 'email':
      return fill(hard.contact.email, 'Correo de tu CV.');
    case 'phone':
      return fill(hard.contact.phone, 'Teléfono de tu CV.');
    case 'location':
      return fill(hard.contact.location, 'Ubicación de tu CV.');
    case 'fullName':
      return fill(hard.fullName, 'Nombre de tu CV.');

    case 'firstName':
    case 'lastName': {
      const parts = hard.fullName.split(/\s+/).filter(Boolean);
      if (parts.length !== 2) {
        return {
          ...base,
          status: 'needs-user',
          reason: 'No es posible separar con certeza nombres y apellidos de tu CV.',
          ...(hard.fullName ? { suggestion: hard.fullName } : {}),
        };
      }
      return fill(key === 'firstName' ? parts[0] : parts[1], 'Nombre de tu CV.');
    }

    case 'yearsExperience': {
      if (hard.yearsExperience === null) return fill('', '');
      if (field.options && field.options.length > 0) {
        const option = pickRangeOption(hard.yearsExperience, field.options);
        return option
          ? fill(option, `Tu CV indica ${hard.yearsExperience} años de experiencia.`)
          : {
              ...base,
              status: 'needs-user',
              reason: 'Ninguna opción corresponde a los años de experiencia de tu CV.',
              suggestion: String(hard.yearsExperience),
            };
      }
      return fill(String(hard.yearsExperience), 'Años de experiencia de tu CV.');
    }

    case 'currentTitle':
    case 'currentCompany': {
      const role = hard.experience[0];
      const ongoing = role && (!role.endDate || /(present|actual|current|hoy|now|a la fecha)/.test(fold(role.endDate)));
      if (!role || !ongoing) {
        return { ...base, status: 'needs-user', reason: 'Tu CV no indica un trabajo actual.' };
      }
      return fill(key === 'currentTitle' ? role.title : role.company, 'Experiencia más reciente de tu CV.');
    }

    case 'education': {
      const ed = hard.education[0];
      const text = ed ? [ed.degree, ed.institution].filter(Boolean).join(', ') : '';
      if (field.options && field.options.length > 0) {
        // Traducir un título a "Universitaria completa" o "Técnico" es interpretar.
        return {
          ...base,
          status: 'needs-user',
          reason: 'Elegir el nivel educacional exige interpretar tu título; confírmalo tú.',
          ...(text ? { suggestion: text } : {}),
        };
      }
      return fill(text, 'Educación de tu CV.');
    }

    case 'languages': {
      const asked = LANGUAGES.find(l => l.asked.test(clean(field.label)));
      if (!asked) {
        const all = hard.languages
          .map(l => (l.proficiency ? `${l.language} (${l.proficiency})` : l.language))
          .join(', ');
        return fill(all, 'Idiomas de tu CV.');
      }

      const known = hard.languages.find(l => asked.known.test(fold(l.language)));
      if (!known || !known.proficiency) {
        return { ...base, status: 'needs-user', reason: 'Tu CV no indica tu nivel en ese idioma.' };
      }

      if (field.options && field.options.length > 0) {
        const level = fold(known.proficiency);
        const option = field.options.find(o => fold(o).includes(level) || level.includes(fold(o)));
        return option
          ? fill(option, `Tu CV indica nivel ${known.proficiency}.`)
          : {
              ...base,
              status: 'needs-user',
              reason: 'Ninguna opción corresponde al nivel que indica tu CV.',
              suggestion: known.proficiency,
            };
      }
      return fill(known.proficiency, 'Nivel de idioma de tu CV.');
    }

    default:
      return fill('', '');
  }
}

/**
 * Resuelve sin IA todo lo que se puede. Lo que necesita redacción queda como
 * "needs-generation" para que la ruta lo pase por el modelo y el verificador.
 */
export function resolveDeterministic(
  field: ApplicationField,
  classification: Classification,
  hard: HardData
): Resolution {
  const base: Base = { fieldId: field.id, category: classification.category };

  switch (classification.category) {
    case 'cv-upload':
      return { ...base, status: 'use-adapted-cv' };

    case 'personal-decision':
      return { ...base, status: 'needs-user', reason: 'Es una decisión tuya: FITCV no la responde por ti.' };

    case 'motivation':
    case 'experience-question':
      return { ...base, status: 'needs-generation' };

    case 'capability-check': {
      const capability = classification.capability ?? '';
      if (capability && mentionedInCv(capability, hard)) {
        const yes = yesOption(field.options);
        return yes
          ? { ...base, status: 'filled', value: yes, source: `Tu CV menciona "${capability}".` }
          : { ...base, status: 'needs-user', reason: 'No hay una opción afirmativa que elegir.' };
      }
      // No figura literalmente: puede estar descrito con otras palabras, así
      // que decide el modelo con verificación, nunca un "sí" por defecto.
      return { ...base, status: 'needs-generation' };
    }

    case 'hard-data':
      return resolveHardData(field, base, classification.hardDataKey, hard);

    default:
      return { ...base, status: 'needs-user', reason: NOT_IN_CV };
  }
}
