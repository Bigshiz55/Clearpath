import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Dedicated config for RUNNING the evaluation (the runner spec), separate from
 * the unit-test config so a 25k-case stress run never blocks `npm test`. Aliases
 * `@` → src and `server-only` → an empty shim so pipeline modules can load.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./shims/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['eval/runner/*.eval.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    // The runner logs a summary; keep console output.
    silent: false,
  },
});
