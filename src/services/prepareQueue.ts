/**
 * Trabajo previo para que el envío sea rápido cuando el candidato abre Chrome:
 * los CV adaptados de lo que está en cola se generan antes, y una vez al día se
 * le avisa si tiene postulaciones esperando a la extensión.
 */
import { db } from '../db/client.js';
import { logger } from './logger.js';
import { tailorCv } from './cvTailoring.js';
import { createNotification } from './notifications.js';
import { localClock } from './dailyAnalysis.js';

const NUDGE_HOUR = 9; // hora de Chile
const IDLE_HOURS = 12; // sin uso de la extensión en este plazo = hay que avisar

/** Genera los CV adaptados que faltan en la cola, de a pocos por vuelta. */
export async function prepareQueuedCvs(limit = 3): Promise<number> {
  const pending = (await db.query<{ id: string; userId: string }>(`
    SELECT p.id, p.userId FROM postulations p
    WHERE p.applyStatus = 'en-cola'
      AND NOT EXISTS (SELECT 1 FROM adapted_cvs a WHERE a.postulationId = p.id)
    ORDER BY COALESCE(p.matchScore, 50) DESC, p.applyQueuedAt ASC NULLS LAST
    LIMIT $1
  `, [limit])).rows;

  let done = 0;
  for (const p of pending) {
    try {
      await tailorCv(p.id, p.userId);
      done++;
    } catch (err) {
      logger.warn('CV prep failed', { postulationId: p.id, err: String(err) });
    }
  }
  return done;
}

export const nudgeText = (n: number) => ({
  title: `${n === 1 ? 'Tienes 1 postulación lista' : `Tienes ${n} postulaciones listas`} para enviar`,
  body: 'Abre Chrome con la extensión de FITCV y las enviamos por ti. Si algún portal pide un CAPTCHA, te avisamos.',
});

/** Un aviso diario (desde las 9:00) a quien tiene cola de portal y no ha abierto la extensión. */
export async function nudgeOpenChrome(now = new Date()): Promise<number> {
  const clock = localClock(now);
  if (clock.hour < NUDGE_HOUR) return 0;

  const users = (await db.query<{ userId: string; n: string }>(`
    SELECT p.userId, COUNT(*) AS n FROM postulations p
    WHERE p.applyStatus = 'en-cola' AND p.channel = 'portal'
      AND NOT EXISTS (
        SELECT 1 FROM extension_tokens t
        WHERE t.userId = p.userId AND t.revokedAt IS NULL
          AND t.lastUsedAt > CURRENT_TIMESTAMP - make_interval(hours => $1)
      )
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.userId = p.userId AND n.kind = 'open-chrome'
          AND n.createdAt > CURRENT_TIMESTAMP - INTERVAL '20 hours'
      )
    GROUP BY p.userId
  `, [IDLE_HOURS])).rows;

  for (const u of users) {
    await createNotification({ userId: u.userId, kind: 'open-chrome', link: '/postulations', ...nudgeText(Number(u.n)) });
  }
  return users.length;
}
