/**
 * Regression suite para los defectos encontrados en la auditoría previa a
 * producción. Cada bloque corresponde a un bug real que ya rompió el producto:
 * si alguno vuelve a fallar, volvió el bug.
 *
 * Arranca el servidor compilado como proceso aparte contra una BD temporal, de
 * modo que se ejerce el binario real (rutas, middleware, persistencia) y no un
 * mock del mismo.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

const PORT = 3100;
const API = `http://localhost:${PORT}/api`;
const DB_DIR = path.resolve(process.cwd(), 'tests', '.tmp');

// En local corre sobre PGlite; CI inyecta un postgres:// para ejercitar además
// el driver `pg` contra un servidor real. Respetar el externo es lo que hace
// que ese job pruebe algo distinto en vez de repetir el mismo camino.
const DATABASE_URL =
  process.env.DATABASE_URL?.startsWith('postgres')
    ? process.env.DATABASE_URL
    : `pglite://${path.relative(process.cwd(), DB_DIR).split(path.sep).join('/')}/pg`;

let server: ChildProcess | undefined;
let token = '';
let offerId = '';
let postulationId = '';

const unique = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const PASSWORD = 'RegressionPass123!';

function startServer(): Promise<void> {
  server = spawn(process.execPath, ['dist/server.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(PORT),
      DATABASE_URL: DATABASE_URL,
    },
    stdio: 'ignore',
  });
  return waitForHealth();
}

async function waitForHealth(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${PORT}/health`);
      if (res.ok) return;
    } catch {
      // todavía arrancando
    }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('Server did not become healthy in time');
}

async function stopServer(): Promise<void> {
  if (!server) return;
  const proc = server;
  server = undefined;
  await new Promise<void>(resolve => {
    proc.once('exit', () => resolve());
    proc.kill();
    setTimeout(resolve, 3000);
  });
}

async function call(
  method: string,
  endpoint: string,
  body?: unknown,
  auth = true
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

beforeAll(async () => {
  fs.rmSync(DB_DIR, { recursive: true, force: true });
  fs.mkdirSync(DB_DIR, { recursive: true });
  await startServer();
}, 60_000);

afterAll(async () => {
  await stopServer();
});

describe('auth', () => {
  const email = unique();

  it('registers a user and returns a token in the shape the frontend reads', async () => {
    const { status, data } = await call('POST', '/auth/register', { email, password: PASSWORD }, false);
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    // El frontend lee data.data.accessToken / userId; cambiar esta forma
    // rompía el login sin ningún error visible.
    expect(typeof data.data.accessToken).toBe('string');
    expect(typeof data.data.userId).toBe('string');
    expect(data.data.email).toBe(email);
    token = data.data.accessToken;
  });

  it('reports the real reason for a duplicate email, not a generic failure', async () => {
    const { status, data } = await call('POST', '/auth/register', { email, password: PASSWORD }, false);
    expect(status).toBe(400);
    expect(data.error).toMatch(/already in use/i);
  });

  it('explains which rule a weak password broke', async () => {
    const { status, data } = await call('POST', '/auth/register', { email: unique(), password: 'short' }, false);
    expect(status).toBe(400);
    expect(data.error).not.toBe('Validation error');
    expect(String(data.error).length).toBeGreaterThan(10);
  });

  it('logs in with correct credentials', async () => {
    const { status, data } = await call('POST', '/auth/login', { email, password: PASSWORD }, false);
    expect(status).toBe(200);
    expect(typeof data.data.accessToken).toBe('string');
  });

  it('rejects a wrong password with 401', async () => {
    const { status } = await call('POST', '/auth/login', { email, password: 'WrongPassword123!' }, false);
    expect(status).toBe(401);
  });

  it('rejects protected routes without a token', async () => {
    const { status } = await call('GET', '/cv/profile', undefined, false);
    expect(status).toBe(401);
  });
});

describe('persistence', () => {
  // El bug nº1: la BD era 100% en memoria y cada reinicio borraba a todos.
  it('keeps users across a full server restart', async () => {
    const email = unique();

    const created = await call('POST', '/auth/register', { email, password: PASSWORD }, false);
    expect(created.status).toBe(201);

    await stopServer();
    await startServer();

    const after = await call('POST', '/auth/login', { email, password: PASSWORD }, false);
    expect(after.status).toBe(200);
    expect(after.data.data.email).toBe(email);

    token = after.data.data.accessToken;
  }, 60_000);
});

describe('offers', () => {
  it('lists offers', async () => {
    const { status, data } = await call('GET', '/offers');
    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThan(0);
    offerId = data.data[0].id;
  });

  it('serves /ranked as its own route instead of matching /:id', async () => {
    const { status, data } = await call('GET', '/offers/ranked');
    // Sin perfil responde 404 "Profile not found"; lo que NO puede pasar es que
    // lo atienda '/:id' y conteste "Job offer not found".
    expect(status).not.toBe(200);
    expect(String(data.error)).not.toMatch(/Job offer not found/i);
  });

  it('returns a single offer by id', async () => {
    const { status } = await call('GET', `/offers/${offerId}`);
    expect(status).toBe(200);
  });
});

describe('postulations', () => {
  it('accepts the real offer id format', async () => {
    // El schema exigía UUID mientras las ofertas son 'offer-001': postular era
    // imposible.
    const { status, data } = await call('POST', '/postulations', {
      offerId,
      estado: 'Por revisar',
      prioridad: 'Alta',
    });
    expect(status).toBe(201);
    postulationId = data.data.postulationId;
    expect(typeof postulationId).toBe('string');
  });

  it('updates one field without nulling the others', async () => {
    // Escribía NULL sobre lo omitido y reventaba las columnas NOT NULL.
    const updated = await call('PUT', `/postulations/${postulationId}`, { estado: 'Aplicado' });
    expect(updated.status).toBe(200);

    const { data } = await call('GET', `/postulations/${postulationId}`);
    expect(data.data.estado).toBe('Aplicado');
    expect(data.data.prioridad).toBe('Alta');
  });

  it('rejects an invalid estado', async () => {
    const { status } = await call('PUT', `/postulations/${postulationId}`, { estado: 'NoExiste' });
    expect(status).toBe(400);
  });

  it('rejects an update with no fields', async () => {
    const { status } = await call('PUT', `/postulations/${postulationId}`, {});
    expect(status).toBe(400);
  });

  it('does not leak another user postulation', async () => {
    const outsider = await call('POST', '/auth/register', { email: unique(), password: PASSWORD }, false);
    const mine = token;
    token = outsider.data.data.accessToken;

    const { status } = await call('GET', `/postulations/${postulationId}`);
    expect(status).toBe(404);

    token = mine;
  });
});

describe('learning endpoints stay up with an empty profile', () => {
  const endpoints = [
    '/learning/top-keywords',
    '/learning/patterns',
    '/learning/skill-growth',
    '/learning/recommendations',
    '/learning/market-trends',
  ];

  for (const endpoint of endpoints) {
    it(`GET ${endpoint} returns 200`, async () => {
      const { status } = await call('GET', endpoint);
      expect(status).toBe(200);
    });
  }
});

describe('cv', () => {
  it('rejects a CV that is too short', async () => {
    const { status } = await call('POST', '/cv/upload', { cvContent: 'too short' });
    expect(status).toBe(400);
  });

  it('surfaces an unusable AI key as 503, not as a bare 500', async () => {
    // Con una key válida esto devuelve 200; lo que se fija aquí es que un fallo
    // de credenciales upstream nunca se reporte como error del usuario.
    const cv = 'Juan Perez. Ingeniero de software con 6 anos de experiencia en Node.js, TypeScript, AWS y PostgreSQL. Universidad de Chile.';
    const { status, data } = await call('POST', '/cv/upload', { cvContent: cv });

    expect([200, 503]).toContain(status);
    if (status === 503) {
      expect(String(data.error)).toMatch(/AI service/i);
      expect(String(data.error)).not.toMatch(/status code/i);
    }
  }, 60_000);
});

describe('resilience', () => {
  it('survives malformed json bodies without dying', async () => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ this is not json',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);

    const health = await fetch(`http://localhost:${PORT}/health`);
    expect(health.ok).toBe(true);
  });

  it('rejects a forged token', async () => {
    const saved = token;
    // Se arma en tiempo de ejecución: un JWT literal en el repositorio hace
    // saltar a los escáneres de secretos, aunque sea deliberadamente inválido.
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'fake' })}.not-a-valid-signature`;
    const { status } = await call('GET', '/cv/profile');
    expect(status).toBe(401);
    token = saved;
  });

  it('returns 404 for unknown routes', async () => {
    const { status } = await call('GET', '/definitely-not-a-route');
    expect(status).toBe(404);
  });

  it('is still healthy after every test above', async () => {
    const res = await fetch(`http://localhost:${PORT}/health`);
    expect(res.ok).toBe(true);
  });
});
