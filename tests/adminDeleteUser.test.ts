// El panel del dueño puede borrar una cuenta y todos sus datos, pero nunca una del equipo
// ni a pedido de un candidato. Arranca el servidor compilado (como api.test.ts) con un ADMIN_EMAILS propio.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

const PORT = 3111;
const API = `http://localhost:${PORT}/api`;
const DB_DIR = path.resolve(process.cwd(), 'tests', '.tmp-admin-delete');
const RUN = Date.now();
const ADMIN = `adm-${RUN}@example.com`;
const VICTIM = `victim-${RUN}@example.com`;
const PASSWORD = 'RegressionPass123!';

let server: ChildProcess | undefined;
let adminToken = '';
let victimToken = '';
let victimId = '';
let adminId = '';

async function call(method: string, endpoint: string, token: string, body?: unknown) {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

async function waitForHealth(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) return; } catch { /* arrancando */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('Server did not become healthy in time');
}

beforeAll(async () => {
  fs.rmSync(DB_DIR, { recursive: true, force: true });
  fs.mkdirSync(DB_DIR, { recursive: true });
  server = spawn(process.execPath, ['dist/server.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(PORT),
      DATABASE_URL: `pglite://${path.relative(process.cwd(), DB_DIR).split(path.sep).join('/')}/pg`,
      ADMIN_EMAILS: ADMIN,
      RESEND_API_KEY: '',
      // Sin esto, el .env local trae las claves reales de Twilio y la prueba mandaría un WhatsApp de verdad.
      TWILIO_ACCOUNT_SID: '',
      TWILIO_AUTH_TOKEN: '',
      TWILIO_WHATSAPP_FROM: '',
      ADMIN_WHATSAPP: '',
    },
    stdio: 'ignore',
  });
  await waitForHealth();

  const admin = await call('POST', '/auth/register', '', { email: ADMIN, password: PASSWORD, consent: true });
  const victim = await call('POST', '/auth/register', '', { email: VICTIM, password: PASSWORD, consent: true });
  adminToken = admin.data.data.accessToken;
  adminId = admin.data.data.userId;
  victimToken = victim.data.data.accessToken;
  victimId = victim.data.data.userId;
}, 120_000);

afterAll(async () => {
  if (!server) return;
  const proc = server;
  await new Promise<void>(resolve => { proc.once('exit', () => resolve()); proc.kill(); setTimeout(resolve, 3000); });
});

describe('borrar una cuenta desde el panel del dueño', () => {
  it('un candidato no puede usar el endpoint', async () => {
    expect((await call('DELETE', `/admin/users/${adminId}`, victimToken)).status).toBe(403);
  });

  it('no deja borrar una cuenta del equipo', async () => {
    expect((await call('DELETE', `/admin/users/${adminId}`, adminToken)).status).toBe(403);
    const users = (await call('GET', '/admin/users', adminToken)).data.data;
    expect(users.find((u: any) => u.email === ADMIN)?.isTeam).toBe(true);
  });

  it('borra la cuenta y sus datos, y el correo queda libre', async () => {
    expect((await call('DELETE', `/admin/users/${victimId}`, adminToken)).status).toBe(200);

    const users = (await call('GET', '/admin/users', adminToken)).data.data;
    expect(users.some((u: any) => u.email === VICTIM)).toBe(false);
    expect((await call('GET', '/cv/profile', victimToken)).status).toBe(401);
    expect((await call('POST', '/auth/register', '', { email: VICTIM, password: PASSWORD, consent: true })).status).toBe(201);
  });

  it('responde 404 si la cuenta ya no existe', async () => {
    expect((await call('DELETE', `/admin/users/${victimId}`, adminToken)).status).toBe(404);
  });
});

describe('WhatsApp de prueba del panel del dueño', () => {
  it('un candidato no puede dispararlo', async () => {
    const candidate = await call('POST', '/auth/register', '', { email: `cand-${RUN}@example.com`, password: PASSWORD, consent: true });
    expect((await call('POST', '/admin/whatsapp-test', candidate.data.data.accessToken, {})).status).toBe(403);
  });

  it('sin Twilio configurado avisa en vez de fallar en silencio', async () => {
    const res = await call('POST', '/admin/whatsapp-test', adminToken, {});
    expect(res.status).toBe(503);
    expect(String(res.data.error)).toMatch(/not configured/i);
  });
});
