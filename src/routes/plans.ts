import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { addOverage, getPlanState, OVERAGE_CONFIG, type Plan } from '../services/planQuota.js';
import { createTopupCheckout, verifyWebhookSignature } from '../services/mercadopago.js';
import { env } from '../env.js';
import { logger } from '../services/logger.js';

const router = Router();

// GET /api/plans/overage-config — público, para mostrar precios en UI
router.get('/overage-config', (_req, res) => {
  res.json(OVERAGE_CONFIG);
});

// POST /api/plans/webhook — MercadoPago IPN (sin requireAuth, viene de MP)
router.post('/webhook', asyncHandler(async (req: any, res: any) => {
  try {
    const sig = req.headers['x-signature'] as string ?? '';
    const reqId = req.headers['x-request-id'] as string ?? '';
    const dataId = (req.query as any)['data.id'] as string ?? '';

    if (!verifyWebhookSignature({ xSignature: sig, xRequestId: reqId, queryDataId: dataId })) {
      logger.warn('MercadoPago webhook: firma inválida');
      return res.sendStatus(400);
    }

    // Solo procesamos pagos aprobados
    if (req.body?.type !== 'payment' || req.body?.action !== 'payment.updated') {
      return res.sendStatus(200);
    }

    const extRef: string = req.body?.data?.external_reference ?? '';
    const [userId, plan] = extRef.split('|');
    if (!userId || !plan) return res.sendStatus(200);

    await addOverage(userId);
    logger.info('MercadoPago topup acreditado', { userId, plan });
    res.sendStatus(200);
  } catch (err) {
    logger.error('MercadoPago webhook error', { err });
    res.sendStatus(500);
  }
}));

router.use(requireAuth);

router.get('/me', asyncHandler(async (req: any, res: any, next: any) => {
  try {
    res.json(await getPlanState((req as any).user.id));
  } catch (err) {
    next(err);
  }
}));

// POST /api/plans/me/checkout — crea preferencia MP y devuelve URL de pago
router.post('/me/checkout', asyncHandler(async (req: any, res: any, next: any) => {
  try {
    const userId = (req as any).user.id;
    const state = await getPlanState(userId);
    const plan = state.plan as Plan;

    if (plan === 'free') {
      return res.status(400).json({ error: 'El plan gratuito no tiene recargas disponibles.' });
    }
    if (!env.MP_ACCESS_TOKEN || env.MP_ACCESS_TOKEN.startsWith('TEST-aqui')) {
      return res.status(503).json({ error: 'Pasarela de pago no configurada.' });
    }

    const cfg = OVERAGE_CONFIG[plan as 'pro' | 'max'];
    const result = await createTopupCheckout({
      userId,
      plan,
      slots: cfg.slots,
      priceCLP: cfg.priceCLP,
      appUrl: env.APP_URL,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}));

// Las recargas solo entran por /checkout + webhook: el antiguo /me/topup las regalaba.

export default router;
