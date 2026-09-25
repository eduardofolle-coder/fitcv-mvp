/**
 * Correo del candidato conectado por OAuth, solo con permiso de ENVÍO
 * (Gmail `gmail.send`, Outlook `Mail.Send`): FITCV no puede leer su bandeja.
 * El refresh token se guarda cifrado; el access token se pide en cada envío.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { db } from '../db/client.js';
import { env } from '../env.js';
import { AppError } from '../middleware/errorHandler.js';
import { EncryptionService } from './encryption.js';

export type MailProvider = 'google' | 'microsoft';

const PROVIDERS = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email https://www.googleapis.com/auth/gmail.send',
    id: () => env.GOOGLE_CLIENT_ID,
    secret: () => env.GOOGLE_CLIENT_SECRET,
  },
  microsoft: {
    authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'offline_access User.Read Mail.Send',
    id: () => env.MS_CLIENT_ID,
    secret: () => env.MS_CLIENT_SECRET,
  },
} as const;

export const isMailProvider = (v: unknown): v is MailProvider => v === 'google' || v === 'microsoft';
export const providerConfigured = (p: MailProvider) => Boolean(PROVIDERS[p].id() && PROVIDERS[p].secret());
const redirectUri = (p: MailProvider) => `${env.API_URL}/api/mail/callback/${p}`;

// El state firma quién pidió la conexión: sin él, otro podría pegar su cuenta a la tuya.
const STATE_TTL_MS = 10 * 60 * 1000;
const sign = (payload: string) => createHmac('sha256', env.DATA_ENCRYPTION_KEY).update(payload).digest('base64url');

export function makeState(userId: string, provider: MailProvider, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, p: provider, e: now + STATE_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readState(state: string, provider: MailProvider, now = Date.now()): string | null {
  const [payload, mac] = String(state).split('.');
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.p === provider && data.e > now && typeof data.u === 'string' ? data.u : null;
  } catch {
    return null;
  }
}

export function authorizeUrl(userId: string, provider: MailProvider): string {
  if (!providerConfigured(provider)) throw new AppError(503, 'This mail provider is not configured yet.');
  const cfg = PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: cfg.id(),
    redirect_uri: redirectUri(provider),
    response_type: 'code',
    scope: cfg.scope,
    state: makeState(userId, provider),
    ...(provider === 'google' ? { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false' } : { prompt: 'select_account' }),
  });
  return `${cfg.authorize}?${params}`;
}

async function tokenRequest(provider: MailProvider, body: Record<string, string>): Promise<any> {
  const cfg = PROVIDERS[provider];
  const res = await fetch(cfg.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.id(), client_secret: cfg.secret(), ...body }),
    signal: AbortSignal.timeout(15_000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new MailAuthError(String(data.error_description || data.error || res.status));
  return data;
}

export class MailAuthError extends Error {}

/** Cierra el OAuth: guarda la cuenta conectada. */
export async function connectMailAccount(provider: MailProvider, code: string, userId: string): Promise<string> {
  const tokens = await tokenRequest(provider, {
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(provider),
    ...(provider === 'microsoft' ? { scope: PROVIDERS.microsoft.scope } : {}),
  });
  if (!tokens.refresh_token) throw new MailAuthError('The provider did not return a refresh token.');
  if (provider === 'google' && !String(tokens.scope ?? '').includes('gmail.send')) {
    throw new MailAuthError('Send permission was not granted.');
  }

  const address = provider === 'google'
    ? JSON.parse(Buffer.from(String(tokens.id_token).split('.')[1] ?? '', 'base64url').toString() || '{}').email
    : await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
        .then(r => r.json()).then((me: any) => me.mail || me.userPrincipalName);
  if (!address) throw new MailAuthError('Could not read the mail address.');

  await db.query(`
    INSERT INTO mail_accounts (userId, provider, address, refreshToken, connectedAt, lastError)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, NULL)
    ON CONFLICT (userId) DO UPDATE SET provider = $2, address = $3, refreshToken = $4, connectedAt = CURRENT_TIMESTAMP, lastError = NULL
  `, [userId, provider, String(address).toLowerCase(), EncryptionService.encrypt(tokens.refresh_token)]);
  return address;
}

export async function getMailAccount(userId: string) {
  return db.queryOne<{ provider: MailProvider; address: string; connectedAt: string; lastError: string | null }>(
    'SELECT provider, address, connectedAt, lastError FROM mail_accounts WHERE userId = $1',
    [userId]
  );
}

export async function disconnectMailAccount(userId: string): Promise<void> {
  const row = await db.queryOne<{ provider: MailProvider; refreshToken: string }>(
    'SELECT provider, refreshToken FROM mail_accounts WHERE userId = $1', [userId]
  );
  await db.query('DELETE FROM mail_accounts WHERE userId = $1', [userId]);
  // Google permite revocar el permiso; en Microsoft lo quita el usuario desde su cuenta.
  if (row?.provider === 'google') {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(EncryptionService.decrypt(row.refreshToken))}`, {
      method: 'POST',
    }).catch(() => undefined);
  }
}

export interface OutgoingMail {
  to: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  attachment: { fileName: string; base64: string };
}

const b64Header = (s: string) => `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`;
const wrap76 = (s: string) => s.replace(/.{1,76}/g, '$&\r\n');

/** MIME multipart con el CV en PDF, para la API de Gmail. */
export function buildMime(from: string, mail: OutgoingMail): string {
  const boundary = `fitcv-${Date.now().toString(36)}`;
  return [
    `From: ${from}`,
    `To: ${mail.to}`,
    ...(mail.replyTo ? [`Reply-To: ${mail.replyTo}`] : []),
    `Subject: ${b64Header(mail.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(Buffer.from(mail.text).toString('base64')),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${mail.attachment.fileName}"`,
    `Content-Disposition: attachment; filename="${mail.attachment.fileName}"`,
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(mail.attachment.base64),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

/** Envía desde el correo conectado del candidato. Lanza MailAuthError si el permiso se perdió. */
export async function sendFromAccount(userId: string, mail: OutgoingMail): Promise<void> {
  const row = await db.queryOne<{ provider: MailProvider; address: string; refreshToken: string }>(
    'SELECT provider, address, refreshToken FROM mail_accounts WHERE userId = $1', [userId]
  );
  if (!row) throw new MailAuthError('No mail account connected.');

  let token: string;
  try {
    token = (await tokenRequest(row.provider, {
      grant_type: 'refresh_token',
      refresh_token: EncryptionService.decrypt(row.refreshToken),
      ...(row.provider === 'microsoft' ? { scope: PROVIDERS.microsoft.scope } : {}),
    })).access_token;
  } catch (err) {
    await db.query('UPDATE mail_accounts SET lastError = $1 WHERE userId = $2', [String((err as Error).message).slice(0, 300), userId]);
    throw err;
  }

  const res = row.provider === 'google'
    ? await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: Buffer.from(buildMime(row.address, mail)).toString('base64url') }),
        signal: AbortSignal.timeout(30_000),
      })
    : await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saveToSentItems: true,
          message: {
            subject: mail.subject,
            body: { contentType: 'Text', content: mail.text },
            toRecipients: [{ emailAddress: { address: mail.to } }],
            ...(mail.replyTo ? { replyTo: [{ emailAddress: { address: mail.replyTo } }] } : {}),
            attachments: [{
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: mail.attachment.fileName,
              contentType: 'application/pdf',
              contentBytes: mail.attachment.base64,
            }],
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });

  if (res.status === 401 || res.status === 403) {
    await db.query('UPDATE mail_accounts SET lastError = $1 WHERE userId = $2', [`HTTP ${res.status}`, userId]);
    throw new MailAuthError(`Mail provider refused the send (HTTP ${res.status}).`);
  }
  if (!res.ok) throw new Error(`Mail provider error HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
