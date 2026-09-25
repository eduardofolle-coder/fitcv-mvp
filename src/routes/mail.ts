/**
 * Canal correo: conectar el correo del candidato (OAuth, solo envío) y recibir
 * las respuestas que llegan a los alias.
 */
import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { env } from '../env.js';
import { logger } from '../services/logger.js';
import {
  authorizeUrl,
  connectMailAccount,
  disconnectMailAccount,
  getMailAccount,
  isMailProvider,
  providerConfigured,
  readState,
} from '../services/mailAccounts.js';
import { backupConfigured } from '../services/mailChannel.js';
import { handleInbound } from '../services/inbox.js';

const router = Router();

// GET /api/mail/account - Correo conectado y qué proveedores se pueden usar
router.get(
  '/account',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    res.json({
      success: true,
      data: {
        account: await getMailAccount(req.user.id),
        providers: { google: providerConfigured('google'), microsoft: providerConfigured('microsoft') },
        backup: backupConfigured(),
      },
    });
  })
);

// GET /api/mail/connect/:provider - URL de consentimiento (la web redirige)
router.get(
  '/connect/:provider',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    if (!isMailProvider(req.params.provider)) throw new AppError(400, 'Unknown mail provider.');
    res.json({ success: true, data: { url: authorizeUrl(req.user.id, req.params.provider) } });
  })
);

// GET /api/mail/callback/:provider - Vuelta del proveedor
router.get(
  '/callback/:provider',
  asyncHandler(async (req: any, res: any) => {
    const back = (status: string) => res.redirect(`${env.APP_URL}/dashboard?mail=${status}`);
    const provider = req.params.provider;
    if (!isMailProvider(provider) || req.query.error) return back('cancelled');

    const userId = readState(String(req.query.state ?? ''), provider);
    if (!userId || typeof req.query.code !== 'string') return back('invalid');

    try {
      await connectMailAccount(provider, req.query.code, userId);
      return back('connected');
    } catch (err) {
      logger.warn('Mail connect failed', { provider, err: String(err) });
      return back('failed');
    }
  })
);

// DELETE /api/mail/account - Desconectar (revoca el permiso en Google)
router.delete(
  '/account',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    await disconnectMailAccount(req.user.id);
    res.json({ success: true });
  })
);

const secretOk = (given: unknown) => {
  if (!env.INBOUND_SECRET || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(env.INBOUND_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
};

// POST /api/mail/inbound - Webhook del proveedor de entrada (Cloudflare Email Worker, etc.)
// Cuerpo: { to, from, subject, text }. Cabecera x-inbound-secret = INBOUND_SECRET.
router.post(
  '/inbound',
  asyncHandler(async (req: any, res: any) => {
    if (!secretOk(req.get('x-inbound-secret'))) throw new AppError(401, 'Unauthorized');
    const b = req.body ?? {};
    const text = String(b.text ?? b.plain ?? String(b.html ?? '').replace(/<[^>]+>/g, ' ')).slice(0, 100_000);
    const handled = await handleInbound({
      to: String(b.to ?? ''),
      from: String(b.from ?? ''),
      subject: String(b.subject ?? '').slice(0, 500),
      text,
    });
    // 200 aunque el alias no exista: el remitente no debe poder sondear alias.
    res.json({ success: true, data: { handled } });
  })
);

export default router;
