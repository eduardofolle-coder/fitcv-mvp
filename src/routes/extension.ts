/**
 * API de la extensión de Chrome.
 *
 * Dos lados: la web (con la sesión del candidato) genera el código de
 * vinculación y administra los dispositivos; la extensión (con su propio token)
 * toma postulaciones de la cola, pide a FITCV que resuelva el formulario,
 * obtiene el CV adaptado y reporta cómo terminó cada envío.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { db } from '../db/client.js';
import {
  createPairingCode,
  listExtensionTokens,
  redeemPairingCode,
  requireExtension,
  revokeExtensionToken,
} from '../services/extensionAuth.js';
import {
  ATTENTION_REASONS,
  canTransition,
  isApplyStatus,
  isAttentionReason,
  qualifiesForAutoSend,
  type ApplyStatus,
} from '../services/applyStatus.js';
import {
  claimQueuedApplications,
  createPostulationForOffer,
  getApplyPreferences,
  queueApplication,
  recordResolution,
  resumeApplication,
  transitionApplication,
} from '../services/applicationQueue.js';
import { parseFields, resolveFields } from '../services/fieldResolver.js';
import { getAdaptedCv, tailorCv } from '../services/cvTailoring.js';
import { pdfFileName, renderCvPdf } from '../services/cvPdf.js';
import { upsertOffers } from '../services/offerSync.js';
import { offerIdFor, type ExternalOffer } from '../services/sources/getOnBoard.js';
import { getPortalSessions, setPortalSession } from '../services/portalSessions.js';
import { PORTALS, isKnownPortal } from '../services/portals.js';

const router = Router();

const limiter = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => req.user?.id || req.ip,
    message: { error: message },
  });

const HOUR = 60 * 60 * 1000;
const pairingCodeLimiter = limiter(HOUR, 10, 'Too many pairing codes this hour. Please try again later.');
const pairLimiter = limiter(15 * 60 * 1000, 20, 'Too many pairing attempts. Please try again later.');
const resolveLimiter = limiter(HOUR, 120, 'You have reached the limit of form resolutions for this hour.');
const tailorLimiter = limiter(HOUR, 60, 'You have reached the limit of CV adaptations for this hour.');
const captureLimiter = limiter(HOUR, 300, 'You have reached the limit of captured offers for this hour.');

const SOURCE_HOSTS: Array<[RegExp, string]> = [
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)computrabajo\.com$/, 'computrabajo'],
  [/(^|\.)laborum\.cl$/, 'laborum'],
  [/(^|\.)trabajando\.cl$/, 'trabajando'],
  [/(^|\.)getonbrd\.com$/, 'getonbrd'],
];

export const sourceForUrl = (url: string): string => {
  const host = new URL(url).hostname.toLowerCase();
  return SOURCE_HOSTS.find(([pattern]) => pattern.test(host))?.[1] ?? 'empresa';
};

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const optionalText = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

// ---------------------------------------------------------------------------
// Web: vincular y administrar dispositivos
// ---------------------------------------------------------------------------

router.post(
  '/pairing-codes',
  requireAuth,
  pairingCodeLimiter,
  asyncHandler(async (req: any, res: any) => {
    res.status(201).json({ success: true, data: await createPairingCode(req.user.id) });
  })
);

router.get(
  '/tokens',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    res.json({ success: true, data: await listExtensionTokens(req.user.id) });
  })
);

router.delete(
  '/tokens/:id',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    if (!(await revokeExtensionToken(req.user.id, req.params.id))) {
      throw new AppError(404, 'Extension not found');
    }
    res.json({ success: true, message: 'Extension disconnected' });
  })
);

// GET /api/extension/portals - En qué portales el candidato tiene sesión iniciada
router.get(
  '/portals',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    res.json({ success: true, data: await getPortalSessions(req.user.id) });
  })
);

// POST /api/extension/portals/:portal/connected - "Ya inicié sesión" en un portal
// que la extensión no puede verificar sola. Si no era cierto, el primer intento
// que tope con el login lo vuelve a marcar desconectado.
router.post(
  '/portals/:portal/connected',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    if (!isKnownPortal(req.params.portal)) throw new AppError(404, 'Unknown portal');
    await setPortalSession(req.user.id, req.params.portal, true, 'candidato');
    res.json({ success: true, data: await getPortalSessions(req.user.id) });
  })
);

// La extensión canjea el código que el candidato copió desde la web.
router.post(
  '/pair',
  pairLimiter,
  asyncHandler(async (req: any, res: any) => {
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    const paired = await redeemPairingCode(code, optionalText(req.body?.deviceName, 80));
    if (!paired) {
      throw new AppError(400, 'Invalid or expired pairing code. Generate a new one in FITCV.');
    }
    res.status(201).json({ success: true, data: { token: paired.token } });
  })
);

// ---------------------------------------------------------------------------
// Extensión
// ---------------------------------------------------------------------------

router.get(
  '/me',
  requireExtension,
  asyncHandler(async (req: any, res: any) => {
    res.json({ success: true, data: { email: req.user.email } });
  })
);

// GET /api/extension/queue?limit=N - Toma las próximas postulaciones a enviar
router.get(
  '/queue',
  requireExtension,
  asyncHandler(async (req: any, res: any) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 1, 1), 10);
    const items = await claimQueuedApplications(req.user.id, limit);
    const prefs = await getApplyPreferences(req.user.id);

    res.json({
      success: true,
      data: items.map(item => ({
        ...item,
        // En LinkedIn el envío automático es opcional y está apagado por defecto.
        autoSend: item.offer.source === 'linkedin' ? prefs.autoSendLinkedIn : true,
      })),
    });
  })
);

// POST /api/extension/postulations/:id/resolve-fields - Qué responder en el formulario
router.post(
  '/postulations/:id/resolve-fields',
  requireExtension,
  resolveLimiter,
  asyncHandler(async (req: any, res: any) => {
    const fields = parseFields(req.body?.fields, { allowEmpty: true });

    const row = await db.queryOne<any>(`
      SELECT p.applyStatus, p.salaryAuthorized, o.title, o.company, o.description, o.salaryMin, o.salaryMax, o.salaryCurrency
      FROM postulations p
      JOIN offers o ON o.id = p.offerId
      WHERE p.id = $1 AND p.userId = $2
    `, [req.params.id, req.user.id]);

    if (!row) throw new AppError(404, 'Postulation not found');
    // Se valida antes de gastar llamadas al modelo.
    if (row.applyStatus !== 'enviando') {
      throw new AppError(409, 'Only an application the extension is sending can have its form resolved.');
    }

    const result = await resolveFields(
      fields,
      {
        title: row.title ?? '',
        company: row.company ?? '',
        description: row.description ?? '',
        salaryMin: row.salaryMin ?? null,
        salaryMax: row.salaryMax ?? null,
        salaryCurrency: row.salaryCurrency ?? null,
        salaryAuthorized: row.salaryAuthorized === true,
      },
      req.user.id
    );
    const record = await recordResolution(req.params.id, req.user.id, {
      autoSendable: qualifiesForAutoSend(result.resolutions, fields),
      fieldCount: fields.length,
      summary: result.summary,
    });

    // autoSendable es el acumulado de todos los pasos del formulario, no solo de este.
    res.json({ success: true, data: { ...result, autoSendable: record.autoSendable } });
  })
);

// POST /api/extension/postulations/:id/adapted-cv - CV adaptado (lo genera si no existe)
router.post(
  '/postulations/:id/adapted-cv',
  requireExtension,
  tailorLimiter,
  asyncHandler(async (req: any, res: any) => {
    let cv = await getAdaptedCv(req.params.id, req.user.id);
    const generated = cv === null;

    if (!cv) {
      await tailorCv(req.params.id, req.user.id);
      cv = await getAdaptedCv(req.params.id, req.user.id);
    }
    if (!cv) throw new AppError(500, 'The CV was tailored but could not be loaded.');

    // Los portales piden un archivo: la extensión sube este PDF.
    res.json({
      success: true,
      data: {
        ...cv,
        generated,
        fileName: pdfFileName(cv.content),
        pdfBase64: renderCvPdf(cv.content, { title: cv.job }).toString('base64'),
      },
    });
  })
);

// POST /api/extension/postulations/:id/report - Cómo terminó el envío
router.post(
  '/postulations/:id/report',
  requireExtension,
  asyncHandler(async (req: any, res: any) => {
    const outcome = req.body?.outcome;
    if (outcome !== 'enviada' && outcome !== 'requiere-atencion' && outcome !== 'error') {
      throw new AppError(400, 'outcome must be enviada, requiere-atencion or error.');
    }

    let reason: string | null = null;
    if (outcome === 'requiere-atencion') {
      if (!isAttentionReason(req.body?.reason)) {
        throw new AppError(400, `reason must be one of: ${ATTENTION_REASONS.join(', ')}.`);
      }
      reason = req.body.reason;
    }

    const applyUrl = req.body?.applyUrl === undefined ? null : httpUrl(req.body.applyUrl);
    if (req.body?.applyUrl !== undefined && applyUrl === null) {
      throw new AppError(400, 'applyUrl must be an http(s) URL.');
    }

    const result = await transitionApplication({
      postulationId: req.params.id,
      userId: req.user.id,
      to: outcome,
      // "manual" solo cuando el candidato revisó y pulsó enviar él mismo.
      mode: outcome === 'enviada' ? (req.body?.mode === 'manual' ? 'manual' : 'auto') : null,
      reason,
      detail: optionalText(req.body?.detail, 500),
      applyUrl,
    });

    // Cada envío real enseña si hay sesión: salió → conectado; pidió login → no.
    if (outcome === 'enviada' || reason === 'login') {
      const offer = await db.queryOne<{ source: string }>(
        'SELECT o.source FROM postulations p JOIN offers o ON o.id = p.offerId WHERE p.id = $1 AND p.userId = $2',
        [req.params.id, req.user.id]
      );
      if (offer) await setPortalSession(req.user.id, offer.source, outcome === 'enviada', 'intento');
    }

    res.json({ success: true, data: { applyStatus: result.to } });
  })
);

// GET /api/extension/portal-checks - Qué página abrir para saber si hay sesión en cada portal
router.get(
  '/portal-checks',
  requireExtension,
  asyncHandler(async (_req: any, res: any) => {
    res.json({
      success: true,
      data: PORTALS.filter(p => p.checkUrl).map(p => ({ portal: p.id, domain: p.domain, checkUrl: p.checkUrl })),
    });
  })
);

// POST /api/extension/portal-sessions { results: [{ portal, connected }] } - Lo que verificó la extensión
router.post(
  '/portal-sessions',
  requireExtension,
  asyncHandler(async (req: any, res: any) => {
    const results = Array.isArray(req.body?.results) ? req.body.results.slice(0, PORTALS.length) : [];
    for (const r of results) {
      if (typeof r?.portal === 'string' && typeof r?.connected === 'boolean' && isKnownPortal(r.portal)) {
        await setPortalSession(req.user.id, r.portal, r.connected, 'verificacion');
      }
    }
    res.json({ success: true });
  })
);

// POST /api/extension/postulations/:id/resume - El candidato destrabó la pestaña: seguir solo
router.post(
  '/postulations/:id/resume',
  requireExtension,
  asyncHandler(async (req: any, res: any) => {
    const item = await resumeApplication(req.params.id, req.user.id);
    const prefs = await getApplyPreferences(req.user.id);
    res.json({ success: true, data: { ...item, autoSend: item.offer.source === 'linkedin' ? prefs.autoSendLinkedIn : true } });
  })
);

// POST /api/extension/offers - Oferta detectada mientras el candidato navega
router.post(
  '/offers',
  requireExtension,
  captureLimiter,
  asyncHandler(async (req: any, res: any) => {
    const url = httpUrl(req.body?.url);
    const title = optionalText(req.body?.title, 200);
    if (!url || !title) {
      throw new AppError(400, 'An offer needs an http(s) url and a title.');
    }

    const parsed = new URL(url);
    const source = sourceForUrl(url);
    // Una oferta de Get on Board capturada en la web es la misma que trae la API.
    const getOnBoardSlug = source === 'getonbrd' ? parsed.pathname.match(/^\/jobs\/([^/]+)/)?.[1] : undefined;
    const externalId = getOnBoardSlug ?? `${parsed.origin}${parsed.pathname}`;
    const country = optionalText(req.body?.country, 2)?.toUpperCase() ?? 'CL';

    const offer: ExternalOffer = {
      id: offerIdFor(getOnBoardSlug ? 'gob' : 'ext', externalId),
      externalId,
      source,
      title,
      company: optionalText(req.body?.company, 200) ?? 'Empresa no informada',
      level: 'N/A',
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      location: optionalText(req.body?.location, 200),
      description: optionalText(req.body?.description, 20000) ?? '',
      requirements: [],
      url,
      applyUrl: url,
      country: /^[A-Z]{2}$/.test(country) ? country : 'CL',
      remoteModality: null,
      publishedAt: null,
    };
    await upsertOffers([offer]);

    let postulationId: string | null = null;
    let applyStatus: ApplyStatus | null = null;

    if (req.body?.queue === true) {
      postulationId = (await createPostulationForOffer(req.user.id, offer.id)).id;
      const current = await db.queryOne<{ applyStatus: string }>(
        'SELECT applyStatus FROM postulations WHERE id = $1',
        [postulationId]
      );
      const status = current?.applyStatus;
      const from: ApplyStatus = isApplyStatus(status) ? status : 'pendiente';

      // Pasa por el control de renta: bajo el rango queda esperando autorización.
      applyStatus = canTransition(from, 'en-cola')
        ? (await queueApplication(postulationId, req.user.id)).to
        : from;
    }

    res.status(201).json({ success: true, data: { offerId: offer.id, postulationId, applyStatus } });
  })
);

export default router;
