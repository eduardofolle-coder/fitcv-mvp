import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { addOverage, getPlanState, OVERAGE_CONFIG } from '../services/planQuota.js';

const router = Router();
router.use(requireAuth);

router.get('/me', async (req, res, next) => {
  try {
    res.json(await getPlanState((req as any).user.id));
  } catch (err) {
    next(err);
  }
});

// POST /api/plans/me/topup
// Añade un paquete de recarga al ciclo activo.
// TODO: añadir verificación de pago (paymentId) cuando se integre la pasarela.
router.post('/me/topup', async (req, res, next) => {
  try {
    const userId = (req as any).user.id;
    const result = await addOverage(userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/plans/overage-config — precios de recargas (público, para mostrar en UI)
router.get('/overage-config', (_req, res) => {
  res.json(OVERAGE_CONFIG);
});

export default router;
