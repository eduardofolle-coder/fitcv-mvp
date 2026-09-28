import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHmac } from 'crypto';

describe('firma del webhook de MercadoPago', () => {
  const ORIGINAL = process.env.MP_WEBHOOK_SECRET;

  afterEach(() => {
    process.env.MP_WEBHOOK_SECRET = ORIGINAL;
  });

  it('falla cerrado sin secreto: nadie se acredita cupo gratis posteando sin firma', async () => {
    delete process.env.MP_WEBHOOK_SECRET;
    vi.resetModules();
    const { verifyWebhookSignature } = await import('../src/services/mercadopago.js');
    expect(verifyWebhookSignature({ xSignature: 'ts=1,v1=cualquiera', xRequestId: 'r', queryDataId: 'd' })).toBe(false);
    expect(verifyWebhookSignature({ xSignature: '', xRequestId: '', queryDataId: '' })).toBe(false);
  }, 20_000);

  it('con secreto, exige la firma correcta', async () => {
    process.env.MP_WEBHOOK_SECRET = 'un-secreto-de-prueba-32-caracteres';
    vi.resetModules();
    const { verifyWebhookSignature } = await import('../src/services/mercadopago.js');

    const opts = { xRequestId: 'req-1', queryDataId: 'data-1' };
    const ts = '1700000000';
    const manifest = `id:${opts.queryDataId};request-id:${opts.xRequestId};ts:${ts};`;
    const v1 = createHmac('sha256', process.env.MP_WEBHOOK_SECRET).update(manifest).digest('hex');

    expect(verifyWebhookSignature({ ...opts, xSignature: `ts=${ts},v1=${v1}` })).toBe(true);
    // Largo distinto al esperado: no debe lanzar, debe rechazar.
    expect(verifyWebhookSignature({ ...opts, xSignature: `ts=${ts},v1=firmafalsa` })).toBe(false);
    // Mismo largo, contenido distinto.
    expect(verifyWebhookSignature({ ...opts, xSignature: `ts=${ts},v1=${'0'.repeat(v1.length)}` })).toBe(false);
  }, 20_000);
});
