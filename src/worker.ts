/**
 * Worker de FITCV: corre el trabajo pesado de fondo (crawling de portales,
 * análisis diario, watchdog y el recompute masivo del matching) en un proceso
 * APARTE del que atiende a los usuarios.
 *
 * Por qué: puntuar ofertas y crawlear portales es CPU/red y bloquea el event
 * loop; si vive en el mismo proceso que la API, cada sync le mete latencia a los
 * usuarios. Con el worker, la instancia web solo sirve requests.
 *
 * En producción: la web corre con RUN_SCHEDULERS=false y este worker corre los
 * schedulers. En local no hace falta: el server los corre si RUN_SCHEDULERS!=false.
 */
import { db } from './db/client.js';
import { initializeSchema } from './db/schema.js';
import { backfillOfferSearch, startOfferSync } from './services/offerSync.js';
import { startDailyAnalysis } from './services/dailyAnalysis.js';
import { startWatchdog } from './services/watchdog.js';
import { env } from './env.js';
import { logger } from './services/logger.js';
import { initErrorTracking, captureException } from './services/errorTracking.js';

async function main(): Promise<void> {
  initErrorTracking();
  await db.init();
  await initializeSchema(); // idempotente (IF NOT EXISTS); seguro si arranca solo
  await backfillOfferSearch();

  logger.info('FITCV worker arrancado: schedulers en marcha', {
    offerSyncMinutes: env.OFFER_SYNC_MINUTES,
    watchdogMinutes: env.WATCHDOG_MINUTES,
  });

  startOfferSync(env.OFFER_SYNC_MINUTES);
  startDailyAnalysis();
  startWatchdog(env.WATCHDOG_MINUTES, env.OFFER_SYNC_MINUTES);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    logger.info('Worker recibió ' + signal + ', cerrando');
    await db.close();
    process.exit(0);
  });
}

process.on('uncaughtException', err => {
  logger.error('Worker uncaught exception', { message: err?.message, stack: err?.stack });
  captureException(err, { source: 'worker-uncaughtException' });
});
process.on('unhandledRejection', reason => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error('Worker unhandled rejection', { message: err.message, stack: err.stack });
  captureException(err, { source: 'worker-unhandledRejection' });
});

main().catch(err => {
  console.error('❌ Worker no pudo arrancar:', err);
  process.exit(1);
});
