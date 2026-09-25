/**
 * Correo de postulación dentro del texto de una oferta ("envía tu CV a ...").
 *
 * Solo cuenta si el correo aparece cerca de una frase que lo pide para postular:
 * un correo suelto en la descripción suele ser de soporte o del portal.
 */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ASKS_FOR_CV = /(env[ií]a|enviar|mand[ae]|remit|postul|curr[ií]cul|\bcv\b|antecedentes|interesad)/i;
const IGNORED = /(no-?reply|noreply|donotreply|soporte|support|privacidad|privacy|@(linkedin|computrabajo|laborum|trabajando|getonbrd|bumeran|indeed)\.)/i;

export function extractApplyEmail(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const match of text.matchAll(EMAIL)) {
    const email = match[0].replace(/\.+$/, '').toLowerCase();
    if (IGNORED.test(email)) continue;
    const at = match.index ?? 0;
    const around = text.slice(Math.max(0, at - 160), at);
    if (ASKS_FOR_CV.test(around)) return email;
  }
  return null;
}
