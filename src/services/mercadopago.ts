/**
 * Integración MercadoPago — pagos de planes y recargas.
 *
 * Flow:
 *   1. Frontend llama POST /api/plans/me/checkout
 *   2. Este servicio crea una preferencia y devuelve init_point (URL de pago)
 *   3. El usuario paga en MP; MP redirige al success_url y llama al webhook
 *   4. El webhook verifica la firma, registra el pago y acredita la recarga
 */
import { MercadoPagoConfig, Preference } from 'mercadopago';
import crypto from 'crypto';
import { env } from '../env.js';
import { logger } from './logger.js';

const client = new MercadoPagoConfig({ accessToken: env.MP_ACCESS_TOKEN });

export interface CheckoutResult {
  checkoutUrl: string;
  preferenceId: string;
}

export async function createTopupCheckout(opts: {
  userId: string;
  plan: 'pro' | 'max';
  slots: number;
  priceCLP: number;
  appUrl: string;
}): Promise<CheckoutResult> {
  const preference = new Preference(client);

  const result = await preference.create({
    body: {
      items: [{
        id: `topup-${opts.plan}-${opts.slots}`,
        title: `FITCV ${opts.plan.toUpperCase()} — ${opts.slots} postulaciones extra`,
        quantity: 1,
        unit_price: opts.priceCLP,
        currency_id: 'CLP',
      }],
      external_reference: `${opts.userId}|${opts.plan}|${opts.slots}`,
      back_urls: {
        success: `${opts.appUrl}/dashboard?pago=ok`,
        failure: `${opts.appUrl}/dashboard?pago=error`,
        pending: `${opts.appUrl}/dashboard?pago=pendiente`,
      },
      auto_return: 'approved',
      // ponytail: en producción agregar notification_url apuntando al webhook
      notification_url: `${opts.appUrl}/api/plans/webhook`,
    },
  });

  logger.info('MercadoPago preference created', { userId: opts.userId, preferenceId: result.id });

  if (!result.init_point || !result.id) throw new Error('MercadoPago did not return a checkout URL');
  return {
    checkoutUrl: result.init_point,
    preferenceId: result.id,
  };
}

/**
 * Verifica la firma del webhook IPN de MercadoPago.
 * MP envía x-signature con "ts=...&v1=..." y x-request-id.
 */
export function verifyWebhookSignature(opts: {
  xSignature: string;
  xRequestId: string;
  queryDataId: string; // data.id del query param
}): boolean {
  if (!env.MP_WEBHOOK_SECRET) return true; // en dev sin secret siempre pasa

  const { ts, v1 } = Object.fromEntries(
    opts.xSignature.split(',').map(part => part.split('=') as [string, string]),
  );
  if (!ts || !v1) return false;

  const manifest = `id:${opts.queryDataId};request-id:${opts.xRequestId};ts:${ts};`;
  const expected = crypto
    .createHmac('sha256', env.MP_WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
