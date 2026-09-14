/**
 * Piezas puras de la vinculación de la extensión.
 */
import { describe, it, expect } from 'vitest';
import {
  EXTENSION_TOKEN_PREFIX,
  generatePairingCode,
  hashSecret,
  normalizePairingCode,
} from '../src/services/extensionAuth.js';
import { sourceForUrl } from '../src/routes/extension.js';

describe('pairing codes', () => {
  it('are readable: no 0/O or 1/I, grouped in two halves', () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePairingCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
  });

  it('accept the code typed in lower case or without the dash', () => {
    expect(normalizePairingCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizePairingCode('ABCD2345')).toBe('ABCD2345');
  });

  it('are stored only as a hash', () => {
    const hash = hashSecret('ABCD2345');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashSecret('ABCD2345'));
    expect(hash).not.toBe(hashSecret('ABCD2346'));
  });

  it('use a token prefix the web JWT can never have', () => {
    expect(EXTENSION_TOKEN_PREFIX).toBe('fitcv_ext_');
  });
});

describe('sourceForUrl', () => {
  it('recognises the Chilean portals', () => {
    expect(sourceForUrl('https://cl.linkedin.com/jobs/view/123')).toBe('linkedin');
    expect(sourceForUrl('https://cl.computrabajo.com/ofertas-de-trabajo/oferta-x')).toBe('computrabajo');
    expect(sourceForUrl('https://www.laborum.cl/empleos/x.html')).toBe('laborum');
    expect(sourceForUrl('https://www.trabajando.cl/trabajo/x')).toBe('trabajando');
    expect(sourceForUrl('https://www.getonbrd.com/jobs/x')).toBe('getonbrd');
  });

  it('treats anything else as a company site, including look-alike hosts', () => {
    expect(sourceForUrl('https://careers.falabella.com/job/1')).toBe('empresa');
    expect(sourceForUrl('https://linkedin.com.evil.example/jobs/1')).toBe('empresa');
  });
});
