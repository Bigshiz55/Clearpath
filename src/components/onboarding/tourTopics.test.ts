import { describe, it, expect } from 'vitest';
import { TOUR_TOPICS } from './tourTopics';

// Every route a topic links to must actually exist as an app route — a typo
// here would silently 404 someone browsing the tour. Kept as a plain
// allowlist rather than a filesystem scan so it fails loudly and specifically
// when a new topic is added, not only when the whole route tree moves.
const REAL_ROUTES = new Set([
  '/app',
  '/app/watch',
  '/app/verdict',
  '/app/taste-quiz',
  '/app/dna',
  '/import-taste',
  '/app/rapid-fire',
  '/app/tv',
  '/app/tv?view=guide',
  '/app/reminders',
  '/app/together',
  '/packs',
  '/app/new',
  '/app/watchlist',
  '/app/chambers',
  '/app/friends',
  '/app/subscriptions',
  '/app/pro',
  '/app/settings',
]);

describe('TOUR_TOPICS', () => {
  it('has at least one topic covering the gavel/docket mechanic', () => {
    const hasGavel = TOUR_TOPICS.some((t) => /gavel|docket/i.test(t.title) || /gavel|docket/i.test(t.body));
    expect(hasGavel).toBe(true);
  });

  it('has at least one topic covering building Watch DNA', () => {
    const hasDna = TOUR_TOPICS.some((t) => /dna/i.test(t.title));
    expect(hasDna).toBe(true);
  });

  it('gives every topic a unique, non-empty id, icon, title, teaser and body', () => {
    const ids = new Set<string>();
    for (const t of TOUR_TOPICS) {
      expect(t.id.length).toBeGreaterThan(0);
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      expect(t.icon.length).toBeGreaterThan(0);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.teaser.length).toBeGreaterThan(0);
      expect(t.body.length).toBeGreaterThan(0);
    }
  });

  it('only links to routes that actually exist in the app', () => {
    for (const t of TOUR_TOPICS) {
      for (const a of t.actions ?? []) {
        expect(REAL_ROUTES.has(a.href), `${t.id} links to unknown route ${a.href}`).toBe(true);
        expect(a.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives every topic teaser a mobile-friendly length (button copy, not a paragraph)', () => {
    for (const t of TOUR_TOPICS) {
      expect(t.teaser.length, `${t.id} teaser is too long for a button`).toBeLessThanOrEqual(70);
    }
  });

  it('has at least one topic that leads back to the home hub', () => {
    const hasHomeLink = TOUR_TOPICS.some((t) => t.actions?.some((a) => a.href === '/app'));
    expect(hasHomeLink).toBe(true);
  });
});
