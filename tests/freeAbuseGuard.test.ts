// Plan Free: correo verificado, CV con contenido real y una cuota por persona.
import { describe, it, expect, beforeAll } from 'vitest';

const RUN = Date.now();
const id = (n: string) => `u-abuse-${n}-${RUN}`;
let db: typeof import('../src/db/client.js')['db'];
let guard: typeof import('../src/services/abuseGuard.js');

async function addUser(n: string, opts: { plan?: string; verified?: boolean; createdAt?: string } = {}) {
  await db.query(
    `INSERT INTO users (id, email, passwordHash, plan, emailVerifiedAt, createdAt) VALUES ($1, $2, 'x', $3, $4, $5)`,
    [id(n), `${n}-${RUN}@test.dev`, opts.plan ?? 'free', opts.verified === false ? null : new Date().toISOString(), opts.createdAt ?? new Date().toISOString()]
  );
}

async function addProfile(n: string, opts: { experience?: unknown[]; education?: unknown[]; cv?: string; phone?: string | null } = {}) {
  await db.query(
    `INSERT INTO candidate_profiles (id, userId, experience, education, cvFingerprint, phoneHash) VALUES ($1, $2, $3, $4, $5, $6)`,
    [`p-${n}-${RUN}`, id(n), JSON.stringify(opts.experience ?? [{ role: 'Analista' }]), JSON.stringify(opts.education ?? []),
      guard.cvFingerprint(opts.cv ?? `CV distinto de ${n} ${RUN}`), guard.phoneFingerprint(opts.phone ?? null)]
  );
}

beforeAll(async () => {
  ({ db } = await import('../src/db/client.js'));
  const { initializeSchema } = await import('../src/db/schema.js');
  guard = await import('../src/services/abuseGuard.js');
  await db.init();
  await initializeSchema();
});

describe('huellas', () => {
  it('los alias de un buzón comparten huella', () => {
    expect(guard.normalizeEmail('Ana.Perez+fitcv@gmail.com')).toBe('anaperez@gmail.com');
    expect(guard.normalizeEmail('ana.perez@googlemail.com')).toBe('anaperez@gmail.com');
    expect(guard.normalizeEmail('juan+x@empresa.cl')).toBe('juan@empresa.cl');
  });

  it('el mismo CV con otra puntuación o tildes tiene la misma huella', () => {
    expect(guard.cvFingerprint('Ingeniero Civil — Universidad de Chile.')).toBe(guard.cvFingerprint('ingeniero civil, universidad de chile'));
    expect(guard.cvFingerprint('Educación')).toBe(guard.cvFingerprint('educacion'));
  });

  it('el teléfono se compara por sus últimos 9 dígitos', () => {
    expect(guard.phoneFingerprint('+56 9 1234 5678')).toBe(guard.phoneFingerprint('912345678'));
    expect(guard.phoneFingerprint('123')).toBeNull();
    expect(guard.phoneFingerprint(undefined)).toBeNull();
  });
});

describe('freeApplyBlock', () => {
  it('exige el correo verificado', async () => {
    await addUser('sinverificar', { verified: false });
    await addProfile('sinverificar');
    expect(await guard.freeApplyBlock(id('sinverificar'))).toMatch(/Verify your email/);
  });

  it('exige haber subido el CV', async () => {
    await addUser('sincv');
    expect(await guard.freeApplyBlock(id('sincv'))).toMatch(/Upload your CV/);
  });

  it('rechaza un CV sin experiencia ni estudios', async () => {
    await addUser('cvvacio');
    await addProfile('cvvacio', { experience: [], education: [] });
    expect(await guard.freeApplyBlock(id('cvvacio'))).toMatch(/no work experience/);
  });

  it('deja postular a una cuenta Free en regla', async () => {
    await addUser('enregla');
    await addProfile('enregla', { experience: [], education: [{ school: 'UChile' }] });
    expect(await guard.freeApplyBlock(id('enregla'))).toBeNull();
  });

  it('una cuenta nueva con el mismo CV o teléfono no recibe cuota; la original sí', async () => {
    await addUser('original', { createdAt: '2026-01-01T00:00:00Z' });
    await addProfile('original', { cv: `mismo cv ${RUN}`, phone: '+56 9 8765 4321' });
    await addUser('clonCv', { createdAt: '2026-02-01T00:00:00Z' });
    await addProfile('clonCv', { cv: `Mismo CV, ${RUN}!` });
    await addUser('clonTel', { createdAt: '2026-03-01T00:00:00Z' });
    await addProfile('clonTel', { phone: '987654321' });

    expect(await guard.freeApplyBlock(id('original'))).toBeNull();
    expect(await guard.freeApplyBlock(id('clonCv'))).toMatch(/one quota per person/);
    expect(await guard.freeApplyBlock(id('clonTel'))).toMatch(/one quota per person/);
  });

  it('los planes pagos no pasan por el control', async () => {
    await addUser('pro', { plan: 'pro', verified: false });
    expect(await guard.freeApplyBlock(id('pro'))).toBeNull();
  });

  it('assertCanApply rechaza con 403', async () => {
    await expect(guard.assertCanApply(id('sinverificar'))).rejects.toMatchObject({ statusCode: 403 });
  });
});
