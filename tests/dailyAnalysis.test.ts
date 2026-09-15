/**
 * El análisis diario corre a la hora de Chile que eligió el candidato, una sola
 * vez por día, y el aviso cuenta bien las ofertas por calce.
 */
import { describe, it, expect } from 'vitest';
import { digestMessage, isAnalysisDue, localClock } from '../src/services/dailyAnalysis.js';
import { matchTier } from '../src/services/offerMatching.js';

describe('localClock', () => {
  it('uses Chilean local time, including the date change around midnight', () => {
    // Junio: horario de invierno, UTC-4.
    expect(localClock(new Date('2026-06-15T12:30:00Z'))).toEqual({ date: '2026-06-15', hour: 8 });
    expect(localClock(new Date('2026-06-15T02:00:00Z'))).toEqual({ date: '2026-06-14', hour: 22 });
  });
});

describe('isAnalysisDue', () => {
  const at = (hour: number) => ({ date: '2026-09-15', hour });

  it('runs at the chosen hour, once per day', () => {
    expect(isAnalysisDue(8, null, at(8))).toBe(true);
    expect(isAnalysisDue(8, '2026-09-14', at(8))).toBe(true);
    expect(isAnalysisDue(8, '2026-09-15', at(9))).toBe(false);
  });

  it('does not run before the chosen hour, but catches up later the same day', () => {
    expect(isAnalysisDue(8, '2026-09-14', at(7))).toBe(false);
    expect(isAnalysisDue(8, '2026-09-14', at(15))).toBe(true);
  });

  it('never runs for a candidate who did not choose an hour', () => {
    expect(isAnalysisDue(null, null, at(12))).toBe(false);
  });
});

describe('matchTier', () => {
  it('splits affinity into high, medium and low', () => {
    expect(matchTier(100)).toBe('alto');
    expect(matchTier(60)).toBe('alto');
    expect(matchTier(59)).toBe('medio');
    expect(matchTier(35)).toBe('medio');
    expect(matchTier(34)).toBe('bajo');
    expect(matchTier(15)).toBe('bajo');
  });
});

describe('digestMessage', () => {
  it('leads with new high-match offers', () => {
    const message = digestMessage({ alto: 4, medio: 6, bajo: 2 }, { alto: 2, medio: 1, bajo: 0 });
    expect(message.title).toBe('2 ofertas nuevas de calce alto para ti');
    expect(message.body).toBe('Hoy tienes 12 ofertas afines: 4 de calce alto, 6 medio y 2 bajo. 3 son nuevas desde tu último análisis.');
  });

  it('uses the singular for a single offer', () => {
    expect(digestMessage({ alto: 1, medio: 0, bajo: 0 }, { alto: 1, medio: 0, bajo: 0 })).toEqual({
      title: '1 oferta nueva de calce alto para ti',
      body: 'Hoy tienes 1 oferta afín: 1 de calce alto, 0 medio y 0 bajo. Una es nueva desde tu último análisis.',
    });
  });

  it('says so when there is nothing new or nothing at all', () => {
    expect(digestMessage({ alto: 0, medio: 3, bajo: 0 }, { alto: 0, medio: 0, bajo: 0 }).body).toContain('No hay nuevas');
    expect(digestMessage({ alto: 0, medio: 0, bajo: 0 }, { alto: 0, medio: 0, bajo: 0 }).body).toContain('no hay ofertas vigentes');
  });
});
