/**
 * Watchdog: vigila los subsistemas y auto-recupera lo recuperable.
 *
 * No arregla bugs de lógica —eso no lo puede hacer ningún proceso—, pero sí
 * detecta fallos conocidos y actúa: si el sync de ofertas quedó atascado, lo
 * vuelve a disparar; si la BD no responde o algo no se recupera, avisa a Sentry
 * y por WhatsApp al admin. Render ya reinicia el proceso si crashea.
 */
import { db } from '../db/client.js';
import { logger } from './logger.js';
import { captureException } from './errorTracking.js';
import { sendWhatsApp, whatsappEnabled } from './whatsapp.js';
import { runSyncOnce } from './offerSync.js';

export interface HealthReport {
  ok: boolean;
  checkedAt: string;
  db: 'ok' | 'fail';
  offers: number;
  offerSync: 'fresh' | 'stale' | 'unknown';
  notes: string[];
}

let lastReport: HealthReport | null = null;
/** Último diagnóstico del watchdog, para exponerlo en /status. */
export const getHealthReport = (): HealthReport | null => lastReport;

// A quién avisar los problemas graves por WhatsApp. Sin esto, solo van a Sentry.
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || '';

async function checkOnce(offerSyncMinutes: number): Promise<HealthReport> {
  const notes: string[] = [];
  let dbOk = true;
  let offers = 0;
  let offerSync: 'fresh' | 'stale' | 'unknown' = 'unknown';

  try {
    const row = await db.queryOne<{ n: string }>('SELECT COUNT(*) AS n FROM offers');
    offers = Number(row?.n ?? 0);
  } catch (err) {
    dbOk = false;
    notes.push('BD no responde: ' + (err instanceof Error ? err.message : String(err)));
  }

  // Frescura del sync: cuánto hace que no entra una oferta nueva.
  if (dbOk && offerSyncMinutes > 0) {
    try {
      const row = await db.queryOne<{ last: string | null }>('SELECT MAX(createdAt) AS last FROM offers');
      if (row?.last) {
        const ageMin = (Date.now() - new Date(row.last).getTime()) / 60000;
        // Atascado si pasó más del triple del intervalo sin ofertas nuevas.
        offerSync = ageMin > offerSyncMinutes * 3 ? 'stale' : 'fresh';
        if (offerSync === 'stale') {
          notes.push(`Sync atascado: ${Math.round(ageMin)} min sin ofertas nuevas — re-disparando`);
          // Auto-recuperación: vuelve a correr el sync (guard anti-solape adentro).
          void runSyncOnce();
        }
      }
    } catch {
      // La frescura es informativa; que falle no vuelve inestable al watchdog.
    }
  }

  const ok = dbOk && offerSync !== 'stale';
  lastReport = { ok, checkedAt: new Date().toISOString(), db: dbOk ? 'ok' : 'fail', offers, offerSync, notes };
  return lastReport;
}

// No spamear: se avisa al ENTRAR en falla y al RECUPERARSE, no en cada ciclo.
let alerted = false;

/** Arranca el watchdog cada `intervalMinutes`. Con 0 queda apagado. */
export function startWatchdog(intervalMinutes: number, offerSyncMinutes: number): () => void {
  if (!(intervalMinutes > 0)) return () => undefined;

  const run = async () => {
    const report = await checkOnce(offerSyncMinutes);
    if (!report.ok && !alerted) {
      alerted = true;
      const msg = 'FITCV watchdog: ' + report.notes.join(' · ');
      logger.error(msg, { report });
      captureException(new Error(msg), { report });
      if (whatsappEnabled() && ADMIN_WHATSAPP) void sendWhatsApp(ADMIN_WHATSAPP, '⚠️ ' + msg);
    } else if (report.ok && alerted) {
      alerted = false;
      logger.info('FITCV watchdog: sistemas recuperados', { report });
      if (whatsappEnabled() && ADMIN_WHATSAPP) void sendWhatsApp(ADMIN_WHATSAPP, '✅ FITCV: sistemas recuperados');
    }
  };

  const timer = setInterval(() => void run(), intervalMinutes * 60_000);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
