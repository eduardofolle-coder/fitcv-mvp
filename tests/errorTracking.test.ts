/**
 * El reporte de errores sale hacia un tercero. Estos tests fijan la promesa de
 * que los datos personales (CVs, contraseñas, tokens) nunca lo acompañan.
 */
import { describe, it, expect } from 'vitest';
import { scrub } from '../src/services/errorTracking.js';

describe('redaction before sending to Sentry', () => {
  it('redacts credentials at the top level', () => {
    const out: any = scrub({
      email: 'user@example.com',
      password: 'SuperSecret123!',
      accessToken: 'eyJhbGciOi.real.token',
    });

    expect(out.password).toBe('[redacted]');
    expect(out.accessToken).toBe('[redacted]');
    // El email sirve para depurar y no es un secreto de autenticación.
    expect(out.email).toBe('user@example.com');
  });

  it('redacts CV content, which is personal data', () => {
    const out: any = scrub({
      cvContent: 'Juan Perez, 6 anos de experiencia...',
      cvOriginalContent: 'encrypted blob',
      adaptedCV: 'adapted text',
    });

    expect(out.cvContent).toBe('[redacted]');
    expect(out.cvOriginalContent).toBe('[redacted]');
    expect(out.adaptedCV).toBe('[redacted]');
  });

  it('redacts nested values, not just the first level', () => {
    const out: any = scrub({
      request: { headers: { authorization: 'Bearer abc123', accept: 'application/json' } },
      user: { profile: { passwordHash: '$2b$10$realhash' } },
    });

    expect(out.request.headers.authorization).toBe('[redacted]');
    expect(out.request.headers.accept).toBe('application/json');
    expect(out.user.profile.passwordHash).toBe('[redacted]');
  });

  it('matches regardless of casing or separators', () => {
    const out: any = scrub({
      PASSWORD: 'x',
      access_token: 'y',
      'refresh-token': 'z',
      CLAUDE_API_KEY: 'sk-ant-real',
    });

    expect(out.PASSWORD).toBe('[redacted]');
    expect(out.access_token).toBe('[redacted]');
    expect(out['refresh-token']).toBe('[redacted]');
    expect(out.CLAUDE_API_KEY).toBe('[redacted]');
  });

  it('redacts inside arrays', () => {
    const out: any = scrub({ users: [{ id: 1, password: 'a' }, { id: 2, password: 'b' }] });

    expect(out.users[0].password).toBe('[redacted]');
    expect(out.users[1].password).toBe('[redacted]');
    expect(out.users[0].id).toBe(1);
  });

  it('survives nulls, cycles-free deep nesting and primitives', () => {
    expect(scrub(null)).toBe(null);
    expect(scrub(undefined)).toBe(undefined);
    expect(scrub('plain')).toBe('plain');
    expect(scrub(42)).toBe(42);

    // Más profundo que el límite: debe cortar, no reventar.
    let deep: any = { password: 'x' };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(() => scrub(deep)).not.toThrow();
  });
});
