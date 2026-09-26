/**
 * Regiones de Chile y cómo reconocerlas en la ubicación de una oferta.
 *
 * Cada portal escribe distinto: "Santiago, RM", "Colina, R.Metropolitana",
 * "Las Condes, Metropolitana de Santiago", "Copiapó, AT", "Rengo, Lib. Gral.
 * Bdo. O'Higgins". Aquí todo se lleva a uno de los 16 códigos.
 */

export const REGIONS = [
  { code: 'AP', name: 'Arica y Parinacota' },
  { code: 'TA', name: 'Tarapacá' },
  { code: 'AN', name: 'Antofagasta' },
  { code: 'AT', name: 'Atacama' },
  { code: 'CO', name: 'Coquimbo' },
  { code: 'VS', name: 'Valparaíso' },
  { code: 'RM', name: 'Metropolitana' },
  { code: 'LI', name: "O'Higgins" },
  { code: 'ML', name: 'Maule' },
  { code: 'NB', name: 'Ñuble' },
  { code: 'BI', name: 'Biobío' },
  { code: 'AR', name: 'La Araucanía' },
  { code: 'LR', name: 'Los Ríos' },
  { code: 'LL', name: 'Los Lagos' },
  { code: 'AI', name: 'Aysén' },
  { code: 'MA', name: 'Magallanes' },
] as const;

export type RegionCode = (typeof REGIONS)[number]['code'];

const CODES = new Set<string>(REGIONS.map(r => r.code));
export const isRegionCode = (value: unknown): value is RegionCode => typeof value === 'string' && CODES.has(value);
export const regionName = (code: string): string => REGIONS.find(r => r.code === code)?.name ?? code;

// Nombres de la región y ciudades que la identifican sin ambigüedad.
// ponytail: solo capitales y ciudades grandes; la lista completa de comunas llega con los selectores de "Mis respuestas".
const ALIASES: Record<RegionCode, string[]> = {
  AP: ['arica y parinacota', 'arica', 'parinacota'],
  TA: ['tarapaca', 'iquique', 'alto hospicio'],
  AN: ['antofagasta', 'calama', 'mejillones', 'tocopilla', 'taltal'],
  AT: ['atacama', 'copiapo', 'vallenar', 'chanaral', 'caldera'],
  CO: ['coquimbo', 'la serena', 'ovalle', 'illapel'],
  VS: ['valparaiso', 'vina del mar', 'quilpue', 'villa alemana', 'san antonio', 'quillota', 'los andes'],
  RM: ['metropolitana', 'region metropolitana', 'santiago', 'r metropolitana'],
  LI: ['higgins', 'ohiggins', 'libertador', 'rancagua', 'san fernando'],
  ML: ['maule', 'talca', 'curico', 'linares'],
  NB: ['nuble', 'chillan'],
  BI: ['biobio', 'bio bio', 'concepcion', 'los angeles', 'talcahuano'],
  AR: ['araucania', 'temuco', 'angol'],
  LR: ['los rios', 'valdivia'],
  LL: ['los lagos', 'puerto montt', 'osorno', 'castro'],
  AI: ['aysen', 'aisen', 'coyhaique'],
  MA: ['magallanes', 'punta arenas'],
};
// Códigos que usan los portales y no coinciden con los nuestros.
const EXTRA_CODES: Record<string, RegionCode> = { OH: 'LI', XV: 'AP', XIV: 'LR' };

const normalize = (text: string): string =>
  ` ${text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** Región de una ubicación libre, o null si no se puede saber (ej. "Chile · Híbrido"). */
export function regionOf(location: string | null | undefined): RegionCode | null {
  if (!location) return null;
  // La región suele ir al final ("Comuna, Región"): se mira de atrás hacia adelante.
  const parts = location.split(/,|·| - /).map(p => p.trim()).filter(Boolean).reverse();
  for (const part of parts) {
    if (CODES.has(part)) return part as RegionCode;
    if (EXTRA_CODES[part]) return EXTRA_CODES[part];
    const text = normalize(part);
    for (const region of REGIONS) {
      if (ALIASES[region.code].some(alias => text.includes(` ${alias} `))) return region.code;
    }
  }
  return null;
}

const REMOTE_MODALITIES = new Set(['remote', 'remote_local', 'fully_remote']);

export const isRemoteOffer = (offer: { location?: string | null; remoteModality?: string | null }): boolean =>
  REMOTE_MODALITIES.has(offer.remoteModality ?? '') || /remot|teletrabajo|home office/i.test(offer.location ?? '');

export interface RegionPreferences {
  /** null o vacío: todo Chile. */
  workRegions: RegionCode[] | null;
  acceptRemote: boolean;
}

/**
 * "dentro": FITCV puede postular sola. "fuera": no, el candidato no trabaja
 * ahí. "sin-ubicacion": la oferta no dice dónde es; decide el candidato.
 */
export type RegionVerdict = 'dentro' | 'fuera' | 'sin-ubicacion';

export function regionVerdict(
  offer: { location?: string | null; remoteModality?: string | null },
  prefs: RegionPreferences
): RegionVerdict {
  if (isRemoteOffer(offer)) return prefs.acceptRemote ? 'dentro' : 'fuera';
  if (!prefs.workRegions?.length) return 'dentro';
  const region = regionOf(offer.location);
  if (!region) return 'sin-ubicacion';
  return prefs.workRegions.includes(region) ? 'dentro' : 'fuera';
}
