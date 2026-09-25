/**
 * Trabajo de fondo de los canales de envío: cada minuto el canal correo; cada
 * 10 minutos la preparación de CVs de la cola y el aviso diario "abre Chrome".
 */
import { logger } from './logger.js';
import { processMailQueue } from './mailChannel.js';
import { nudgeOpenChrome, prepareQueuedCvs } from './prepareQueue.js';

export function startChannelJobs(): () => void {
  let busy = false;
  let ticks = 0;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await processMailQueue();
      if (ticks++ % 10 === 0) {
        await prepareQueuedCvs();
        await nudgeOpenChrome();
      }
    } catch (err) {
      logger.error('Channel jobs failed', { message: err instanceof Error ? err.message : String(err) });
    } finally {
      busy = false;
    }
  };

  const first = setTimeout(() => void tick(), 20_000);
  const every = setInterval(() => void tick(), 60_000);
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
