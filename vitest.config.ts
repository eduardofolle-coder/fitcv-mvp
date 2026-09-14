import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Las suites de integración levantan cada una un servidor con su propio
    // PostgreSQL (PGlite). En paralelo compiten por CPU y el arranque superaba
    // el tiempo de espera; con un solo worker corren una tras otra, y los tests
    // unitarios son lo bastante rápidos como para no notarlo.
    maxThreads: 1,
    minThreads: 1,
  },
});
