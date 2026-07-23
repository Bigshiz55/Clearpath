import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** Isolated config for the Search Lab runner, separate from unit tests and the
 *  voice-search eval runner so it never blocks `npm test` or the other suites. */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../src', import.meta.url)),
      'server-only': fileURLToPath(new URL('../shims/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['eval/searchlab/run.searchlab.ts'],
    testTimeout: 120_000,
    silent: false,
  },
});
