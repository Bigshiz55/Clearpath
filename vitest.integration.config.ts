import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Integration tests — hit REAL TMDB / Supabase when the required env vars are
 * present, and SKIP cleanly otherwise (so CI stays green without secrets and runs
 * the full suite when they're provided). Kept out of the default `npm test`.
 *   npm run test:integration
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./eval/shims/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.int.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Real network + shared room state → run serially, no isolation surprises.
    fileParallelism: false,
  },
});
