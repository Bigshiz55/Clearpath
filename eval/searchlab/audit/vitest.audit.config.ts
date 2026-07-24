import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** Isolated config for the identity/resolution audit runner. */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../../src', import.meta.url)),
      'server-only': fileURLToPath(new URL('../../shims/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['eval/searchlab/audit/audit.searchlab.ts'],
    testTimeout: 120_000,
    silent: false,
  },
});
