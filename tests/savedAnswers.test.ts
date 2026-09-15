/**
 * El RUT que se guarda en "Mis respuestas frecuentes" tiene que ser válido: un
 * RUT mal escrito en cien postulaciones es cien postulaciones con un error.
 */
import { describe, it, expect } from 'vitest';
import { formatRut, isValidRut } from '../src/services/savedAnswers.js';

describe('RUT', () => {
  it('accepts valid RUTs written in any common way', () => {
    expect(isValidRut('12.345.678-5')).toBe(true);
    expect(isValidRut('123456785')).toBe(true);
    expect(isValidRut('11.111.111-1')).toBe(true);
    expect(isValidRut('7.654.321-6')).toBe(true);
  });

  it('accepts K as the verification digit', () => {
    expect(isValidRut('20.000.003-K')).toBe(true);
    expect(isValidRut('20000003k')).toBe(true);
  });

  it('rejects a wrong verification digit or a malformed value', () => {
    expect(isValidRut('12.345.678-9')).toBe(false);
    expect(isValidRut('abc')).toBe(false);
    expect(isValidRut('1-9')).toBe(false);
  });

  it('formats with dots and dash', () => {
    expect(formatRut('123456785')).toBe('12.345.678-5');
    expect(formatRut('20000003k')).toBe('20.000.003-K');
  });
});
