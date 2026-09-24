import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPlanState } from '../services/planQuota.js';

const router = Router();
router.use(requireAuth);

router.get('/me', async (req, res, next) => {
  try {
    res.json(await getPlanState((req as any).user.id));
  } catch (err) {
    next(err);
  }
});

export default router;
