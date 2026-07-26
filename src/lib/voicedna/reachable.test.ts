import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A feature only reachable by typing a URL is not shipped.
 *
 * Voice DNA and the taste import both live OUTSIDE `/app` on purpose — they
 * work signed-out, and `/app` is gated by the middleware. That is exactly how
 * they ended up orphaned: no gated screen linked to them, and nothing failed.
 *
 * These are source-level assertions rather than browser tests because the
 * entry points sit on authenticated screens, which redirect to /login in the
 * Playwright harness. Same pattern as `viewing/independence.test.ts`.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const ROUTES = [
  { route: '/voice-dna', page: 'src/app/voice-dna/page.tsx' },
  { route: '/import-taste', page: 'src/app/import-taste/page.tsx' },
];

describe('public taste-building routes are reachable', () => {
  const nav = read('src/components/Nav.tsx');
  const dna = read('src/app/app/dna/page.tsx');

  for (const { route } of ROUTES) {
    it(`${route} is listed in the app navigation`, () => {
      expect(nav).toContain(`href: '${route}'`);
    });

    it(`${route} is offered from Your Watch DNA`, () => {
      expect(dna).toContain(`href="${route}"`);
    });
  }

  for (const { route, page } of ROUTES) {
    it(`${route} carries its own way back — it is outside the gated /app tree`, () => {
      const src = read(page);
      expect(src, `${page} must link back to /app`).toContain('href="/app"');
      expect(src).toContain('data-testid="back-to-app"');
    });
  }

  it('the Watch DNA empty state points somewhere other than the quiz', () => {
    // "Rate a few titles" is the slowest possible on-ramp; someone with an
    // empty profile must be offered the interview too.
    const emptyState = dna.slice(dna.indexOf('your dials will appear here'));
    expect(emptyState).toContain('/voice-dna');
  });
});
