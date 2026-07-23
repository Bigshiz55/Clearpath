import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The eval framework only imports pure modules today; the shim keeps
      // future server-only imports loadable under the unit-test runner.
      'server-only': fileURLToPath(new URL('./eval/shims/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Unit tests for the app + self-tests for the evaluation framework. The
    // eval *runner* specs (eval/runner/*.eval.ts) use eval/vitest.config.ts.
    include: ['src/**/*.test.ts', 'eval/**/*.test.ts'],
  },
});
