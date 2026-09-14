/**
 * PDF del CV adaptado, sin dependencias.
 *
 * Los portales piden subir un archivo y el CV adaptado es texto. Con las
 * fuentes estándar de PDF (Helvetica, codificación WinAnsi, que cubre el
 * español) alcanza para un CV limpio y legible, sin sumar una librería de PDF.
 */

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const LEADING = 1.32;
const BLANK_GAP = 5;

// Anchos de Helvetica (AFM) en milésimas de em, ASCII 32..126.
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];

// Caracteres fuera de Latin-1 que WinAnsi sí tiene (viñetas, guiones, comillas).
const WIN_ANSI_EXTRA: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

const BULLET = 0x95;

/** Texto a WinAnsi: un byte por carácter. Lo que no existe en la fuente queda como "?". */
export function toWinAnsi(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const code = ch.codePointAt(0) ?? 63;
    if (code === 9) out += ' ';
    else if (code >= 32 && code <= 126) out += ch;
    else if (code >= 0xa0 && code <= 0xff) out += String.fromCharCode(code);
    else if (WIN_ANSI_EXTRA[code] !== undefined) out += String.fromCharCode(WIN_ANSI_EXTRA[code]);
    else out += '?';
  }
  return out;
}

function charWidth(code: number): number {
  if (code >= 32 && code <= 126) return HELVETICA_WIDTHS[code - 32];
  if (code === BULLET) return 350;
  if (code === 0x96) return 556;
  if (code === 0x97) return 1000;
  if (code === 0xb7 || code === 0xa0) return 278;
  if (code >= 0xc0 && code <= 0xde) return 722;
  return 556;
}

function textWidth(text: string, size: number, bold: boolean): number {
  let units = 0;
  for (let i = 0; i < text.length; i++) units += charWidth(text.charCodeAt(i));
  // Helvetica-Bold es algo más ancha; el margen evita que una línea se salga.
  return (units * size) / 1000 * (bold ? 1.07 : 1);
}

function wrapText(text: string, maxWidth: number, size: number, bold: boolean): string[] {
  const lines: string[] = [];
  let current = '';

  for (const word of text.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, size, bold) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);

    // Una palabra más ancha que la línea (una URL larga) se corta a la fuerza.
    let rest = word;
    while (textWidth(rest, size, bold) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && textWidth(rest.slice(0, cut), size, bold) > maxWidth) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }

  if (current || lines.length === 0) lines.push(current);
  return lines;
}

export type CvLineKind = 'name' | 'lead' | 'heading' | 'strong' | 'bullet' | 'body' | 'blank';

/**
 * Rol de cada línea del CV que arma composeCV: nombre, titular y contacto
 * arriba; títulos de sección en mayúsculas tras una línea en blanco; "Cargo —
 * Empresa" en negrita; viñetas.
 */
export function classifyCvLines(content: string): Array<{ kind: CvLineKind; text: string }> {
  const out: Array<{ kind: CvLineKind; text: string }> = [];
  let seenName = false;
  let inLead = false;
  let previousBlank = true;

  for (const raw of content.replace(/\r\n?/g, '\n').split('\n')) {
    const text = raw.trim();
    if (!text) {
      out.push({ kind: 'blank', text: '' });
      previousBlank = true;
      inLead = false;
      continue;
    }

    let kind: CvLineKind;
    if (!seenName) {
      kind = 'name';
      seenName = true;
      inLead = true;
    } else if (inLead) {
      kind = 'lead';
    } else if (previousBlank && text.length <= 40 && text === text.toUpperCase() && /\p{Lu}/u.test(text)) {
      kind = 'heading';
    } else if (text.startsWith('• ')) {
      kind = 'bullet';
    } else if (text.includes(' — ')) {
      kind = 'strong';
    } else {
      kind = 'body';
    }

    out.push({ kind, text });
    previousBlank = false;
  }

  return out;
}

const STYLES: Record<Exclude<CvLineKind, 'blank'>, { size: number; bold: boolean; before: number; after: number }> = {
  name: { size: 18, bold: true, before: 0, after: 4 },
  lead: { size: 10, bold: false, before: 0, after: 1 },
  heading: { size: 11.5, bold: true, before: 8, after: 4 },
  strong: { size: 10.5, bold: true, before: 2, after: 1 },
  bullet: { size: 10, bold: false, before: 0, after: 1 },
  body: { size: 10, bold: false, before: 0, after: 1 },
};

const fmt = (n: number): string => String(Number(n.toFixed(2)));

const escapePdf = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const textOp = (text: string, x: number, y: number, size: number, bold: boolean): string =>
  `BT /${bold ? 'F2' : 'F1'} ${fmt(size)} Tf ${fmt(x)} ${fmt(y)} Td (${escapePdf(text)}) Tj ET`;

export function renderCvPdf(content: string, options: { title?: string } = {}): Buffer {
  const usableWidth = PAGE_WIDTH - 2 * MARGIN;
  const pages: string[][] = [[]];
  let y = PAGE_HEIGHT - MARGIN;

  const page = () => pages[pages.length - 1];
  const ensureRoom = (height: number) => {
    if (y - height < MARGIN) {
      pages.push([]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  for (const line of classifyCvLines(content)) {
    if (line.kind === 'blank') {
      y -= BLANK_GAP;
      continue;
    }

    const style = STYLES[line.kind];
    const bullet = line.kind === 'bullet';
    const indent = bullet ? 12 : 0;
    const segments = wrapText(toWinAnsi(bullet ? line.text.slice(2) : line.text), usableWidth - indent, style.size, style.bold);
    const lineHeight = style.size * LEADING;

    y -= style.before;
    segments.forEach((segment, i) => {
      ensureRoom(lineHeight);
      y -= lineHeight;
      if (bullet && i === 0) page().push(textOp(String.fromCharCode(BULLET), MARGIN + 2, y, style.size, false));
      page().push(textOp(segment, MARGIN + indent, y, style.size, style.bold));
    });

    if (line.kind === 'heading') {
      y -= 3;
      page().push(`0.6 w 0.7 G ${fmt(MARGIN)} ${fmt(y)} m ${fmt(PAGE_WIDTH - MARGIN)} ${fmt(y)} l S 0 G`);
    }
    y -= style.after;
  }

  // 1 catálogo, 2 páginas, 3-4 fuentes, 5 metadatos, luego página + contenido.
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 6 + i * 2);

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objects[5] = `<< /Producer (FITCV)${options.title ? ` /Title (${escapePdf(toWinAnsi(options.title))})` : ''} >>`;

  pages.forEach((ops, i) => {
    const stream = ops.join('\n');
    objects[pageIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  // Todo es de un byte por carácter, así que el largo del string es el offset en bytes.
  let pdf = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

/** "CV Nombre Apellido.pdf", con el nombre que encabeza el CV. */
export function pdfFileName(content: string): string {
  const name = content.split(/\r?\n/).map(l => l.trim()).find(Boolean) ?? '';
  const clean = name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return clean ? `CV ${clean}.pdf` : 'CV.pdf';
}

/** Versión ASCII para la cabecera Content-Disposition. */
export const asciiFileName = (name: string): string =>
  name.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\x20-\x7e]/g, '').replace(/"/g, '');
