import { describe, it, expect } from 'vitest';
import { withAiSlot } from '../src/services/agentInvoker.js';

describe('AI concurrency cap', () => {
  it('nunca corre más que el tope a la vez y completa todo', async () => {
    let active = 0, peak = 0, done = 0;
    const task = () =>
      withAiSlot(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise(r => setTimeout(r, 20));
        active--;
        done++;
      });

    await Promise.all(Array.from({ length: 12 }, task));

    expect(done).toBe(12);
    expect(peak).toBeLessThanOrEqual(4); // AI_MAX_CONCURRENCY por defecto
    expect(peak).toBeGreaterThan(1); // sí corre en paralelo hasta el tope
  });
});
