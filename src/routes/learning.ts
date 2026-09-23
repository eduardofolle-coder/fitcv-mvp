/**
 * Diagnóstico del candidato.
 *
 * - GET /api/learning/diagnosis - Por qué su CV alcanza las ofertas que alcanza
 *
 * Antes este router exponía cinco endpoints de analítica (top-keywords,
 * patterns, skill-growth, recommendations, market-trends) que leían
 * `successful_adaptations`, una tabla que ningún flujo del producto escribía:
 * devolvían listas vacías para todo usuario real, y las dos últimas rellenaban
 * con textos fijos ("Strong tech hiring") que no salían de ningún dato. Se
 * reemplazaron por un diagnóstico calculado sobre las ofertas vigentes y el
 * perfil extraído del CV, que son datos que sí existen.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { buildDiagnosis } from '../services/diagnosis.js';
import { getCachedMatch, recomputeUserMatches } from '../services/matchCache.js';
import { logger } from '../services/logger.js';

const router = Router();

/**
 * GET /api/learning/diagnosis
 * Sin CV analizado responde 200 con data null: es el estado inicial de todos,
 * no un error.
 */
router.get(
  '/diagnosis',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;

    // Camino rápido: diagnóstico precalculado en background. Si aún no existe,
    // se calienta para la próxima y se calcula en vivo esta vez (lento, una sola).
    const cached = await getCachedMatch(userId);
    if (cached?.diagnosis) {
      return res.json({ success: true, data: cached.diagnosis });
    }
    if (!cached) void recomputeUserMatches(userId);

    const diagnosis = await buildDiagnosis(userId);
    if (!diagnosis) {
      return res.json({ success: true, data: null, reason: 'no-cv' });
    }

    logger.info('Diagnosis built', { userId, matched: diagnosis.matched, gaps: diagnosis.gaps.length });
    res.json({ success: true, data: diagnosis });
  })
);

export default router;
