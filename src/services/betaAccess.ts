/**
 * Beta cerrada (E6): con BETA_CLOSED=true solo se crean cuentas para correos
 * invitados desde el panel, y cada una parte con el plan de su invitación.
 */
import { db } from '../db/client.js';
import { env } from '../env.js';

/** undefined = beta abierta; null = no invitado; si no, el plan de la invitación. */
export async function invitedPlan(email: string): Promise<string | null | undefined> {
  if (!env.BETA_CLOSED) return undefined;
  const row = await db.queryOne<{ plan: string }>('SELECT plan FROM beta_invites WHERE email = $1', [email.toLowerCase()]);
  return row?.plan ?? null;
}

/** Aplica el plan invitado y deja constancia del consentimiento (Ley 21.719). */
export async function onboardUser(userId: string, email: string, plan: string | null | undefined): Promise<void> {
  await db.query('UPDATE users SET consentAt = COALESCE(consentAt, CURRENT_TIMESTAMP) WHERE id = $1', [userId]);
  if (plan) {
    await db.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);
    await db.query('UPDATE beta_invites SET usedAt = CURRENT_TIMESTAMP WHERE email = $1', [email.toLowerCase()]);
  }
}

export const BETA_CLOSED_MESSAGE = 'FITCV is in closed beta. Ask for an invitation to join.';
