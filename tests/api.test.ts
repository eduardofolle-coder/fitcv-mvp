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

// Arrancar PGlite en frío bajo carga (otra suite en paralelo, un runner de CI
// lento) puede superar con holgura los 30s.
async function waitForHealth(timeoutMs = 90_000): Promise<void> {
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
}, 120_000);

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

describe('session tokens and password recovery', () => {
  const cookieToken = (res: Response): string =>
    (res.headers.get('set-cookie') ?? '').match(/refreshToken=([^;]+)/)?.[1] ?? '';

  it('accepts only the access token on protected routes, and only the refresh token to renew', async () => {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: unique(), password: PASSWORD }),
    });
    const { data } = await res.json();
    const refresh = cookieToken(res);
    expect(refresh).not.toBe('');

    const withBearer = (bearer: string) =>
      fetch(`${API}/applications/preferences`, { headers: { Authorization: `Bearer ${bearer}` } });
    expect((await withBearer(data.accessToken)).status).toBe(200);
    // El token de renovación dura 7 días: no puede servir como token de acceso.
    expect((await withBearer(refresh)).status).toBe(401);

    const renew = (value: string) =>
      fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: value }),
      });
    expect((await renew(data.accessToken)).status).toBe(401);
    const renewed = await renew(refresh);
    expect(renewed.status).toBe(200);
    expect(typeof (await renewed.json()).accessToken).toBe('string');
  });

  it('resets a forgotten password with a one-time link', async () => {
    const email = unique();
    const NEW_PASSWORD = 'OtraClaveSegura456!';
    await call('POST', '/auth/register', { email, password: PASSWORD }, false);

    // La respuesta es igual exista o no la cuenta.
    const unknown = await call('POST', '/auth/forgot-password', { email: unique() }, false);
    expect(unknown.status).toBe(200);
    expect(unknown.data.devResetUrl).toBeUndefined();

    const requested = await call('POST', '/auth/forgot-password', { email }, false);
    expect(requested.status).toBe(200);
    // Sin proveedor de correo, en desarrollo el enlace se devuelve para poder usarlo.
    const resetToken = new URL(requested.data.devResetUrl).searchParams.get('token');
    expect(resetToken).toBeTruthy();

    expect((await call('POST', '/auth/reset-password', { token: resetToken, password: 'debil' }, false)).status).toBe(400);
    expect((await call('POST', '/auth/reset-password', { token: resetToken, password: NEW_PASSWORD }, false)).status).toBe(200);
    // Un solo uso.
    expect((await call('POST', '/auth/reset-password', { token: resetToken, password: NEW_PASSWORD }, false)).status).toBe(400);

    expect((await call('POST', '/auth/login', { email, password: NEW_PASSWORD }, false)).status).toBe(200);
    expect((await call('POST', '/auth/login', { email, password: PASSWORD }, false)).status).toBe(401);
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
  }, 200_000);
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

  it('asks for a CV before showing offers for the candidate profile', async () => {
    const { status, data } = await call('GET', '/offers?match=profile');
    expect(status).toBe(200);
    expect(data.needsProfile).toBe(true);
    expect(data.data).toEqual([]);
  });

  it('searches over the accent-free text columns filled at startup', async () => {
    // Las ofertas de ejemplo se guardan sin columnas de búsqueda; el arranque las completa.
    const { status, data } = await call('GET', '/offers?search=AMAZON');
    expect(status).toBe(200);
    expect(data.data.some((o: any) => o.company === 'Amazon')).toBe(true);
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

describe('applications sent by the extension', () => {
  let extToken = '';
  let appId = '';

  const asExtension = async (method: string, endpoint: string, body?: unknown, bearer = extToken) => {
    const res = await fetch(`${API}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
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
  };

  const newPostulation = async () => {
    const offers = await call('GET', '/offers?limit=100');
    const mine = await call('GET', '/postulations?limit=100');
    const used = new Set(mine.data.data.map((p: any) => p.offerId));
    const free = offers.data.data.find((o: any) => !used.has(o.id));
    const created = await call('POST', '/postulations', { offerId: free.id, estado: 'Preparar postulación', prioridad: 'Media' });
    expect(created.status).toBe(201);
    return { id: created.data.data.postulationId as string, offer: free };
  };

  it('pairs the extension with a one-time code, never the password', async () => {
    const created = await call('POST', '/extension/pairing-codes');
    expect(created.status).toBe(201);
    const code: string = created.data.data.code;
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const paired = await asExtension('POST', '/extension/pair', { code: code.toLowerCase(), deviceName: 'Chrome de prueba' }, '');
    expect(paired.status).toBe(201);
    extToken = paired.data.data.token;
    expect(extToken.startsWith('fitcv_ext_')).toBe(true);

    const reused = await asExtension('POST', '/extension/pair', { code }, '');
    expect(reused.status).toBe(400);
  });

  it('keeps extension and web credentials apart', async () => {
    expect((await asExtension('GET', '/extension/me')).status).toBe(200);
    expect((await asExtension('GET', '/cv/profile')).status).toBe(401);
    expect((await call('GET', '/extension/me')).status).toBe(401);
  });

  it('hands queued applications to the extension exactly once', async () => {
    const { id, offer } = await newPostulation();
    appId = id;

    const queued = await call('POST', `/postulations/${appId}/queue`);
    expect(queued.status).toBe(200);
    expect(queued.data.data.applyStatus).toBe('en-cola');

    const { status, data } = await asExtension('GET', '/extension/queue?limit=10');
    expect(status).toBe(200);
    const item = data.data.find((i: any) => i.postulationId === appId);
    expect(item).toBeTruthy();
    expect(item.offer.title).toBe(offer.title);
    // LinkedIn no se envía solo salvo que el candidato lo active.
    expect(item.autoSend).toBe(offer.source !== 'linkedin');

    const again = await asExtension('GET', '/extension/queue?limit=10');
    expect(again.data.data.some((i: any) => i.postulationId === appId)).toBe(false);
  });

  it('refuses to record an automatic send without a verified form', async () => {
    const { status, data } = await asExtension('POST', `/extension/postulations/${appId}/report`, { outcome: 'enviada', mode: 'auto' });
    expect(status).toBe(409);
    expect(String(data.error)).toMatch(/could not verify/i);
  });

  it('records a verified automatic send and moves the postulation to Aplicado', async () => {
    const resolved = await asExtension('POST', `/extension/postulations/${appId}/resolve-fields`, { fields: [] });
    expect(resolved.status).toBe(200);
    expect(resolved.data.data.autoSendable).toBe(true);

    const sent = await asExtension('POST', `/extension/postulations/${appId}/report`, { outcome: 'enviada', mode: 'auto' });
    expect(sent.status).toBe(200);

    const { data } = await call('GET', `/postulations/${appId}`);
    expect(data.data.applyStatus).toBe('enviada');
    expect(data.data.estado).toBe('Aplicado');
    expect(data.data.sentAt).toBeTruthy();

    const events = await call('GET', `/postulations/${appId}/events`);
    expect(events.data.data.map((e: any) => e.toStatus)).toEqual(['en-cola', 'enviada']);
    expect(events.data.data[1].mode).toBe('auto');

    // Una postulación enviada no vuelve a enviarse.
    const repeat = await asExtension('POST', `/extension/postulations/${appId}/report`, { outcome: 'enviada', mode: 'auto' });
    expect(repeat.status).toBe(409);
  });

  it('parks an application that needs the candidate, only with a known reason', async () => {
    const { id } = await newPostulation();
    await call('POST', `/postulations/${id}/queue`);
    await asExtension('GET', '/extension/queue?limit=10');

    const invented = await asExtension('POST', `/extension/postulations/${id}/report`, { outcome: 'requiere-atencion', reason: 'saltar-captcha' });
    expect(invented.status).toBe(400);

    const parked = await asExtension('POST', `/extension/postulations/${id}/report`, {
      outcome: 'requiere-atencion',
      reason: 'sitio-empresa',
      applyUrl: 'https://careers.example.com/jobs/42',
    });
    expect(parked.status).toBe(200);

    const { data } = await call('GET', `/postulations/${id}`);
    expect(data.data.applyStatus).toBe('requiere-atencion');
    expect(data.data.applyReason).toBe('sitio-empresa');
    expect(data.data.applyUrl).toBe('https://careers.example.com/jobs/42');

    // El candidato postuló por su cuenta en el sitio de la empresa.
    const manual = await call('POST', `/postulations/${id}/mark-sent`);
    expect(manual.status).toBe(200);
  });

  it('captures an offer seen while browsing and queues it', async () => {
    const { status, data } = await asExtension('POST', '/extension/offers', {
      url: 'https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-analista-ABC123?utm=x',
      title: 'Analista de Datos',
      company: 'Empresa Ejemplo',
      description: 'SQL y Python',
      queue: true,
    });
    expect(status).toBe(201);
    expect(data.data.applyStatus).toBe('en-cola');

    const offer = await call('GET', `/offers/${data.data.offerId}`);
    expect(offer.data.data.source).toBe('computrabajo');
    expect(offer.data.data.externalId).toBe('https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-analista-ABC123');
  });

  it('requires an explicit acknowledgement to auto-send on LinkedIn', async () => {
    expect((await call('PUT', '/applications/preferences', { autoSendLinkedIn: true })).status).toBe(400);
    const enabled = await call('PUT', '/applications/preferences', { autoSendLinkedIn: true, acknowledgeLinkedInRisk: true });
    expect(enabled.status).toBe(200);
    expect(enabled.data.data.autoSendLinkedIn).toBe(true);
  });

  it('stops accepting a disconnected extension', async () => {
    const tokens = await call('GET', '/extension/tokens');
    expect(tokens.status).toBe(200);
    for (const t of tokens.data.data) {
      expect((await call('DELETE', `/extension/tokens/${t.id}`)).status).toBe(200);
    }
    expect((await asExtension('GET', '/extension/me')).status).toBe(401);
  });
});

describe('saved answers and salary authorisation', () => {
  let mine = '';

  beforeAll(async () => {
    mine = token;
    const reg = await call('POST', '/auth/register', { email: unique(), password: PASSWORD }, false);
    token = reg.data.data.accessToken;
  });

  afterAll(() => {
    token = mine;
  });

  it('saves the answers the candidate declares, and only those sent', async () => {
    const saved = await call('PUT', '/applications/preferences', {
      salaryMin: 8_000_000,
      salaryMax: 9_000_000,
      availability: 'Inmediata',
      rut: '123456785',
      willingToTravel: true,
    });
    expect(saved.status).toBe(200);
    expect(saved.data.data).toMatchObject({ salaryMin: 8_000_000, salaryMax: 9_000_000, rut: '12.345.678-5', willingToTravel: true });

    // Un cambio parcial no borra lo demás.
    const partial = await call('PUT', '/applications/preferences', { comuna: 'Providencia' });
    expect(partial.data.data).toMatchObject({ comuna: 'Providencia', rut: '12.345.678-5', salaryMin: 8_000_000 });
  });

  it('rejects an invalid RUT and an inverted salary range', async () => {
    expect((await call('PUT', '/applications/preferences', { rut: '12.345.678-9' })).status).toBe(400);
    expect((await call('PUT', '/applications/preferences', { salaryMin: 3_000_000, salaryMax: 2_000_000 })).status).toBe(400);
  });

  it('records when the candidate authorised accepting portal terms', async () => {
    const res = await call('PUT', '/applications/preferences', { acceptPortalTerms: true });
    expect(res.data.data.acceptPortalTerms).toBe(true);
    expect(res.data.data.acceptPortalTermsAt).toBeTruthy();
  });

  it('saves the hour of the daily offer analysis, and only a valid hour', async () => {
    const saved = await call('PUT', '/applications/preferences', { dailyAnalysisHour: 7 });
    expect(saved.status).toBe(200);
    expect(saved.data.data.dailyAnalysisHour).toBe(7);
    expect((await call('PUT', '/applications/preferences', { dailyAnalysisHour: 24 })).status).toBe(400);
    expect((await call('PUT', '/applications/preferences', { dailyAnalysisHour: 7.5 })).status).toBe(400);
  });

  it('asks for a CV before analysing offers, and starts with no notifications', async () => {
    expect((await call('POST', '/offers/analysis/run')).status).toBe(409);

    const notes = await call('GET', '/notifications');
    expect(notes.status).toBe(200);
    expect(notes.data.data).toEqual({ items: [], unread: 0 });

    const profileOffers = await call('GET', '/offers?match=profile');
    expect(profileOffers.data.tierCounts).toEqual({ alto: 0, medio: 0, bajo: 0 });
  });

  it('holds an offer that pays below the range until the candidate authorises it', async () => {
    // Las ofertas de ejemplo pagan como máximo $7.000.000; el rango parte en $8.000.000.
    const offers = await call('GET', '/offers?limit=100');
    const offer = offers.data.data.find((o: any) => o.salaryCurrency === 'CLP' && o.salaryMax < 8_000_000);
    const created = await call('POST', '/postulations', { offerId: offer.id, estado: 'Preparar postulación', prioridad: 'Media' });
    const id = created.data.data.postulationId;

    const queued = await call('POST', `/postulations/${id}/queue`);
    expect(queued.status).toBe(200);
    expect(queued.data.data.applyStatus).toBe('requiere-autorizacion');

    const detail = await call('GET', `/postulations/${id}`);
    expect(detail.data.data.applyReason).toBe('renta-bajo-rango');
    expect(detail.data.data.applyDetail).toContain('$8.000.000');

    const authorized = await call('POST', `/postulations/${id}/authorize`);
    expect(authorized.data.data.applyStatus).toBe('en-cola');

    const after = await call('GET', `/postulations/${id}`);
    expect(after.data.data.salaryAuthorized).toBe(true);
  });

  it('lets the candidate decline an offer below the range', async () => {
    const offers = await call('GET', '/offers?limit=100');
    const mineNow = await call('GET', '/postulations?limit=100');
    const used = new Set(mineNow.data.data.map((p: any) => p.offerId));
    const offer = offers.data.data.find((o: any) => !used.has(o.id) && o.salaryCurrency === 'CLP' && o.salaryMax < 8_000_000);
    const created = await call('POST', '/postulations', { offerId: offer.id, estado: 'Preparar postulación', prioridad: 'Media' });
    const id = created.data.data.postulationId;

    await call('POST', `/postulations/${id}/queue`);
    const declined = await call('POST', `/postulations/${id}/decline`);
    expect(declined.data.data.applyStatus).toBe('pendiente');

    const detail = await call('GET', `/postulations/${id}`);
    expect(detail.data.data.estado).toBe('Descartado');
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
