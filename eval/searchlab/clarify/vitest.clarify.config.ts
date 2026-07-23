import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** Isolated config for the multilingual clarification benchmark. */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../../src', import.meta.url)),
      'server-only': fileURLToPath(new URL('../../shims/server-only.ts', import.meta.url)),
    },
  },
  test: { environment: 'node', include: ['eval/searchlab/clarify/clarify.searchlab.ts'], testTimeout: 300_000, silent: false },
});
