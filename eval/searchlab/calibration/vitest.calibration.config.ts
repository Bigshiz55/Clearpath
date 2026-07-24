import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** Isolated config for the calibration sweep, kept separate from unit tests, the
 *  voice-search eval, and the Search Lab gold runner. */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../../src', import.meta.url)),
      'server-only': fileURLToPath(new URL('../../shims/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['eval/searchlab/calibration/sweep.searchlab.ts'],
    testTimeout: 120_000,
    silent: false,
  },
});
