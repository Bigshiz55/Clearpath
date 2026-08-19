import { describe, it, expect } from 'vitest';
import { IMMERSIVE_ROUTES, IMMERSIVE_ROUTE_PATTERNS, isImmersiveRoute } from './immersiveRoutes';

/**
 * SUPPRESSION MUST BE EXACTLY AS WIDE AS THE COLLISION.
 *
 * The whole value of this list is that it is narrow. A prefix test, or a
 * pattern that forgot an anchor, would strip the feedback button off a subtree
 * nobody was looking at — and the absence of a control is the kind of defect
 * that goes unnoticed for months.
 */
describe('routes that own the whole screen', () => {
  it('names the full-bleed surfaces', () => {
    for (const p of ['/app/showdown', '/app/tonight', '/app/taste-quiz', '/dev/dna-showdown']) {
      expect(isImmersiveRoute(p), p).toBe(true);
    }
  });

  it('covers a Verdict Room, whatever its code', () => {
    for (const code of ['ABC123', 'harness1', 'a', '9', 'A-b_2']) {
      expect(isImmersiveRoute(`/court/${code}`), code).toBe(true);
    }
    // …and the harnesses that mount the same interiors, so QA photographs the
    // screen a juror actually gets.
    expect(isImmersiveRoute('/dev/court')).toBe(true);
    expect(isImmersiveRoute('/dev/court-vote')).toBe(true);
  });

  it('does not swallow anything else', () => {
    for (const p of [
      '/', '/app', '/app/ask', '/app/watchlist', '/app/showdown/results',
      '/court', '/court/ABC123/settings', '/courtroom', '/court/ABC123/',
      '/dev/courtroom', '/app/together', '/show/knives-out',
    ]) {
      expect(isImmersiveRoute(p), p).toBe(false);
    }
  });

  it('is inert on a missing path', () => {
    expect(isImmersiveRoute(null)).toBe(false);
    expect(isImmersiveRoute(undefined)).toBe(false);
    expect(isImmersiveRoute('')).toBe(false);
  });

  it('every pattern is anchored at both ends — an unanchored one would match a subtree', () => {
    for (const re of IMMERSIVE_ROUTE_PATTERNS) {
      expect(re.source.startsWith('^'), re.source).toBe(true);
      expect(re.source.endsWith('$'), re.source).toBe(true);
    }
  });

  it('every exact entry is an absolute path with no trailing slash', () => {
    for (const p of IMMERSIVE_ROUTES) {
      expect(p.startsWith('/'), p).toBe(true);
      expect(p.endsWith('/'), p).toBe(false);
    }
  });
});
