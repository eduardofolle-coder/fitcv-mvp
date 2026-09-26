import { describe, it, expect, beforeAll } from 'vitest';
import { regionOf, regionVerdict } from '../src/services/regions.js';
import { db } from '../src/db/client.js';
import { initializeSchema } from '../src/db/schema.js';
import { runAutoPostulate, syncQueueWithRegions } from '../src/services/autoPostulate.js';
import { updateAnswerPreferences } from '../src/services/savedAnswers.js';

describe('regiones: cada portal escribe distinto', () => {
  it('reconoce la región en los formatos reales de los portales', () => {
    expect(regionOf('Santiago, RM')).toBe('RM'); // chiletrabajos
    expect(regionOf('Copiapó, AT')).toBe('AT');
    expect(regionOf('Santiago - Las condes, R.Metropolitana')).toBe('RM'); // computrabajo
    expect(regionOf('Las Condes, Metropolitana de Santiago')).toBe('RM'); // trabajando
    expect(regionOf("Rengo, Lib. Gral. Bdo. O'Higgins")).toBe('LI');
    expect(regionOf('San Fernando, Libertador B. O Higgins')).toBe('LI');
    expect(regionOf('Los Ángeles, Bíobío')).toBe('BI');
    expect(regionOf('Chillán, Ñuble')).toBe('NB');
    expect(regionOf('San Pedro de Atacama, Antofagasta')).toBe('AN'); // la región va al final
    expect(regionOf('Santiago, Chile · Híbrido')).toBe('RM'); // get on board con ciudad
    expect(regionOf('Santiago')).toBe('RM'); // portal minero
    expect(regionOf('Chile · Híbrido')).toBeNull(); // sin ciudad: no se adivina
    expect(regionOf(null)).toBeNull();
  });

  it('decide dónde puede postular sola', () => {
    const rm = { workRegions: ['RM' as const], acceptRemote: true };
    expect(regionVerdict({ location: 'Santiago, RM' }, rm)).toBe('dentro');
    expect(regionVerdict({ location: 'Copiapó, AT' }, rm)).toBe('fuera');
    expect(regionVerdict({ location: 'Chile · Híbrido' }, rm)).toBe('sin-ubicacion');
    expect(regionVerdict({ location: 'Remote · Remoto', remoteModality: 'remote_local' }, rm)).toBe('dentro');
    expect(regionVerdict({ location: 'Remote · Remoto', remoteModality: 'remote_local' }, { ...rm, acceptRemote: false })).toBe('fuera');
    // Sin regiones elegidas: todo Chile, como hasta ahora.
    expect(regionVerdict({ location: 'Copiapó, AT' }, { workRegions: null, acceptRemote: true })).toBe('dentro');
  });
});

describe('la postulación automática respeta las regiones', () => {
  const RUN = Date.now();
  const USER = `u-reg-${RUN}`;
  const offers = {
    santiago: [`o-rm-${RUN}`, 'Santiago, RM', null],
    copiapo: [`o-at-${RUN}`, 'Copiapó, AT', null],
    sinCiudad: [`o-na-${RUN}`, 'Chile · Híbrido', 'hybrid'],
    remoto: [`o-rem-${RUN}`, 'Remote · Remoto', 'remote_local'],
  } as const;
  const statusOf = async (offerId: string) =>
    (await db.queryOne<{ applyStatus: string }>('SELECT applyStatus FROM postulations WHERE userId = $1 AND offerId = $2', [USER, offerId]))?.applyStatus ?? null;

  beforeAll(async () => {
    await db.init();
    await initializeSchema();
    await db.query(`INSERT INTO users (id, email, passwordHash, plan) VALUES ($1, $2, 'x', 'max')`, [USER, `reg-${RUN}@test.dev`]);
    for (const [id, location, modality] of Object.values(offers)) {
      await db.query(
        `INSERT INTO offers (id, title, company, level, source, description, location, remoteModality, publishedAt)
         VALUES ($1, 'Analista', 'Acme', 'L2', 'test', 'Oferta.', $2, $3, CURRENT_TIMESTAMP)`,
        [id, location, modality]
      );
    }
    const ranked = Object.values(offers).map(([offerId]) => ({ offerId, score: 80, tier: 'alto', reasons: [] }));
    await db.query(`INSERT INTO user_match_cache (userId, ranked, tierCounts) VALUES ($1, $2, '{}')`, [USER, JSON.stringify(ranked)]);
    await updateAnswerPreferences(USER, { workRegions: ['RM'] });
  });

  it('solo encola lo que está en sus regiones o es remoto', async () => {
    expect((await runAutoPostulate(USER)).autoQueued).toBe(2);
    expect(await statusOf(offers.santiago[0])).toBe('en-cola');
    expect(await statusOf(offers.remoto[0])).toBe('en-cola');
    expect(await statusOf(offers.copiapo[0])).toBeNull(); // queda en Ofertas, no se postula sola
    expect(await statusOf(offers.sinCiudad[0])).toBeNull(); // sin ciudad: decide el candidato
  });

  it('al dejar de aceptar remoto, lo remoto sale de la cola; al volver a aceptarlo, vuelve', async () => {
    await updateAnswerPreferences(USER, { acceptRemote: false });
    expect(await syncQueueWithRegions(USER)).toEqual({ withdrawn: 1, requeued: 0 });
    expect(await statusOf(offers.remoto[0])).toBe('pendiente');
    expect(await statusOf(offers.santiago[0])).toBe('en-cola');

    await updateAnswerPreferences(USER, { acceptRemote: true });
    expect(await syncQueueWithRegions(USER)).toEqual({ withdrawn: 0, requeued: 1 });
    expect(await statusOf(offers.remoto[0])).toBe('en-cola');
  });
});
