// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://www.chiletrabajos.cl/trabajo/analista-123" }
/**
 * Extractor de ofertas de la extensión. Antes, en cualquier portal que no fuera LinkedIn ni Laborum, tomaba
 * como oferta todo enlace con "job", "offer" o "trabajo" en la dirección. En chiletrabajos.cl y
 * computrabajo.com "trabajo" está en el dominio, así que entraba TODO el menú ("Salir", "Mi cuenta"...) a la cola.
 */
import { describe, it, expect, beforeAll } from 'vitest';

let extractor: any;

beforeAll(async () => {
  document.body.innerHTML = `
    <nav>
      <a href="https://www.chiletrabajos.cl/">Home (current)</a>
      <a href="https://www.chiletrabajos.cl/trabajo/buscar">Buscar empleos</a>
      <a href="https://www.chiletrabajos.cl/panel">Panel de control</a>
      <a href="https://www.chiletrabajos.cl/logout">Salir</a>
      <a href="https://www.chiletrabajos.cl/trabajo/analista-123/compartir">Compartir</a>
    </nav>
    <h1>Analista de Abastecimiento</h1>`;
  await import('../fitcv-extension/content/offerExtractor.js');
  extractor = (globalThis as any).FitcvOfferExtractor;
});

describe('extractor de ofertas', () => {
  it('no convierte el menú de un portal en ofertas', () => {
    expect(window.location.hostname).toBe('www.chiletrabajos.cl');
    const result = extractor.extractOffers();
    expect(result.count).toBe(0);
    expect(result.offers).toEqual([]);
  });
});
