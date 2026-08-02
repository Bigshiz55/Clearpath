import { describe, it, expect } from 'vitest';
import { TOUR_STEPS } from './tourSteps';

// Every route a tour step links to must actually exist as an app route —
// a typo here would silently 404 someone mid-walkthrough. Kept as a plain
// allowlist rather than a filesystem scan so it fails loudly and specifically
// when a new step is added, not only when the whole route tree moves.
const REAL_ROUTES = new Set(['/app', '/app/watch', '/app/taste-quiz', '/app/dna', '/app/together', '/packs', '/app/tv']);

describe('TOUR_STEPS', () => {
  it('has at least one step covering the gavel/docket mechanic', () => {
    const hasGavel = TOUR_STEPS.some((s) => /gavel|docket/i.test(s.title) || /gavel|docket/i.test(s.body));
    expect(hasGavel).toBe(true);
  });

  it('has at least one step covering building Watch DNA', () => {
    const hasDna = TOUR_STEPS.some((s) => /dna/i.test(s.title));
    expect(hasDna).toBe(true);
  });

  it('gives every step a unique, non-empty id, title and body', () => {
    const ids = new Set<string>();
    for (const s of TOUR_STEPS) {
      expect(s.id.length).toBeGreaterThan(0);
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });

  it('only links to routes that actually exist in the app', () => {
    for (const s of TOUR_STEPS) {
      for (const a of s.actions ?? []) {
        expect(REAL_ROUTES.has(a.href), `${s.id} links to unknown route ${a.href}`).toBe(true);
        expect(a.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('ends on a step that returns the visitor to the home hub', () => {
    const last = TOUR_STEPS[TOUR_STEPS.length - 1]!;
    expect(last.actions?.some((a) => a.href === '/app')).toBe(true);
  });
});
