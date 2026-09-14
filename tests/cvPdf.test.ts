/**
 * El PDF que se sube a los portales tiene que abrir en cualquier lector: se
 * valida la estructura (offsets, largos de stream) y la codificación del español.
 */
import { describe, it, expect } from 'vitest';
import { asciiFileName, classifyCvLines, pdfFileName, renderCvPdf, toWinAnsi } from '../src/services/cvPdf.js';

const cv = [
  'Juan Pérez',
  'Backend Engineer',
  'juan@example.com | +56 9 1234 5678',
  '',
  'EXPERIENCIA',
  'Senior Backend Engineer — Mercado Libre',
  '2021-01 – 2024-06',
  '• Lideró un equipo de 4 ingenieros (backend)',
  '',
  'HABILIDADES',
  'Node.js · AWS',
].join('\n');

const byte = (code: number) => String.fromCharCode(code);

describe('classifyCvLines', () => {
  it('recognises the parts composeCV writes', () => {
    expect(classifyCvLines(cv).map(l => l.kind)).toEqual([
      'name', 'lead', 'lead', 'blank', 'heading', 'strong', 'body', 'bullet', 'blank', 'heading', 'body',
    ]);
  });
});

describe('renderCvPdf', () => {
  const pdf = renderCvPdf(cv, { title: 'CV adaptado' });
  const text = pdf.toString('latin1');

  it('writes a structurally valid PDF', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);

    const startxref = Number(text.match(/startxref\n(\d+)/)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');

    const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
    expect(offsets.length).toBeGreaterThan(5);
    offsets.forEach((offset, i) => {
      expect(text.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true);
    });

    for (const m of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = (m.index ?? 0) + m[0].length;
      expect(text.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe('\nendstream');
    }
  });

  it('encodes Spanish text and CV symbols in WinAnsi', () => {
    expect(text).toContain(`P${byte(0xe9)}rez`);
    expect(text).toContain(`Lider${byte(0xf3)}`);
    expect(text).toContain(`(${byte(0x95)})`);
    expect(text).toContain(`2021-01 ${byte(0x96)} 2024-06`);
    expect(text).toContain(`Node.js ${byte(0xb7)} AWS`);
  });

  it('escapes parentheses inside text', () => {
    expect(text).toContain('ingenieros \\(backend\\)');
  });

  it('adds pages when the CV is long', () => {
    const long = ['Juan Pérez', '', 'EXPERIENCIA', ...Array.from({ length: 150 }, (_, i) => `• Logro número ${i + 1} con una descripción suficientemente larga para ocupar espacio`)].join('\n');
    const count = Number(renderCvPdf(long).toString('latin1').match(/\/Count (\d+)/)?.[1]);
    expect(count).toBeGreaterThan(1);
  });
});

describe('file names and encoding helpers', () => {
  it('names the file after the candidate', () => {
    expect(pdfFileName(cv)).toBe('CV Juan Pérez.pdf');
    expect(pdfFileName('')).toBe('CV.pdf');
    expect(pdfFileName('Ana / Soto')).toBe('CV Ana Soto.pdf');
    expect(asciiFileName('CV Juan Pérez.pdf')).toBe('CV Juan Perez.pdf');
  });

  it('replaces characters the font cannot draw', () => {
    expect(toWinAnsi('ok 😀')).toBe('ok ?');
    expect(toWinAnsi('“hola”')).toBe(`${byte(0x93)}hola${byte(0x94)}`);
  });
});
