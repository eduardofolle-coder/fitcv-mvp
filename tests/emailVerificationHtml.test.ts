// El correo de verificación sale con texto plano de respaldo y una versión HTML con botón.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const RUN = Date.now();
const USER = `u-verhtml-${RUN}`;
const sent: any[] = [];
let db: typeof import('../src/db/client.js')['db'];
let sendVerificationEmail: typeof import('../src/services/emailVerification.js')['sendVerificationEmail'];

beforeAll(async () => {
  process.env.RESEND_API_KEY = 're_test';
  process.env.EMAIL_FROM = 'FITCV <contacto@fitcv.cl>';
  vi.stubGlobal('fetch', async (_url: string, init: any) => {
    sent.push(JSON.parse(init.body));
    return { ok: true } as Response;
  });
  ({ db } = await import('../src/db/client.js'));
  const { initializeSchema } = await import('../src/db/schema.js');
  ({ sendVerificationEmail } = await import('../src/services/emailVerification.js'));
  await db.init();
  await initializeSchema();
  await db.query(`INSERT INTO users (id, email, passwordHash) VALUES ($1, $2, 'x')`, [USER, `verhtml-${RUN}@test.dev`]);
});

afterAll(() => vi.unstubAllGlobals());

describe('correo de verificación', () => {
  it('manda texto plano y HTML con el botón y el mismo enlace', async () => {
    await sendVerificationEmail(USER, `verhtml-${RUN}@test.dev`);
    const mail = sent.at(-1);
    const link = mail.text.match(/https?:\/\/\S+verify-email\?token=\S+/)?.[0];

    expect(link).toBeTruthy();
    expect(mail.html).toContain('Confirmar mi correo');
    expect(mail.html).toContain(`href="${link}"`);
  });
});
