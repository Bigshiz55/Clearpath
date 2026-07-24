import { describe, it, expect } from 'vitest';
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { computeConfidence, effectiveTaste, explainTitle } from './explain';
import { deriveDna } from './engine';
import type { PreferenceEvent } from './types';

function dims(over: Record<string, number> = {}): TitleDimensions {
  const d: TitleDimensions = {};
  for (const k of DIMENSION_KEYS) d[k] = 50;
  return { ...d, ...over };
}
const ev = (over: Partial<PreferenceEvent>): PreferenceEvent => ({
  id: Math.random().toString(36).slice(2), at: 0, titleId: 'movie:1', action: 'skip', ...over,
});

/** A user who loves fast, low-romance titles and rejects animation. */
function confidentUser() {
  const events: PreferenceEvent[] = [];
  for (let i = 0; i < 5; i++) {
    events.push(ev({ id: `love${i}`, action: 'seen_liked', experienceGrade: 'loved', dims: dims({ pacing: 90, romance: 10 }) }));
    events.push(ev({ id: `anim${i}`, action: 'unseen_not_interested', genres: ['animation'] }));
  }
  return deriveDna(events, 0);
}

describe('explainability', () => {
  it('produces ✓ reasons from confident matched preferences', () => {
    const state = confidentUser();
    const x = explainTitle({ dims: dims({ pacing: 85, romance: 12 }), genres: ['crime'] }, state);
    const texts = x.reasons.map((r) => r.text);
    expect(texts).toContain('Fast-paced');
    expect(texts).toContain('Minimal romance');
    expect(x.confidence).toBeGreaterThan(60);
  });

  it('raises a ⚠ concern when a title clashes a confident preference', () => {
    const state = confidentUser();
    const x = explainTitle({ dims: dims({ pacing: 10 }) }, state); // slow, but user likes fast
    expect(x.concerns.map((c) => c.text)).toContain('Slow burn');
  });

  it('flags a genre the user reliably avoids', () => {
    const state = confidentUser();
    const x = explainTitle({ genres: ['animation'] }, state);
    expect(x.concerns.some((c) => /avoid Animation/i.test(c.text))).toBe(true);
  });

  it('adds a "Similar to X" reason when a seed is given', () => {
    const state = confidentUser();
    const x = explainTitle({ dims: dims({ pacing: 88 }), similarTo: 'Sherlock' }, state);
    expect(x.reasons.some((r) => r.kind === 'similar' && /Similar to Sherlock/.test(r.text))).toBe(true);
  });

  it('does not invent reasons it has not earned (no confident DNA ⇒ ~50%)', () => {
    const cold = deriveDna([], 0);
    const x = explainTitle({ dims: dims({ pacing: 90 }), genres: ['crime'] }, cold);
    expect(x.reasons).toHaveLength(0);
    expect(x.confidence).toBe(50);
  });

  it('Experience outweighs Attraction in the merged taste', () => {
    // Experience says "fast" (pref high), Attraction says "slow" (pref low).
    const state = deriveDna([
      ...Array.from({ length: 5 }, (_, i) => ev({ id: `e${i}`, action: 'seen_liked', experienceGrade: 'loved', dims: dims({ pacing: 90 }) })),
      ...Array.from({ length: 5 }, (_, i) => ev({ id: `a${i}`, action: 'unseen_interested', dims: dims({ pacing: 10 }) })),
    ], 0);
    const taste = effectiveTaste(state);
    expect(taste.pacing!.pref).toBeGreaterThan(50); // experience wins
  });

  it('computeConfidence is centered, one-sided, and bounded', () => {
    expect(computeConfidence(0, 0)).toBe(50);
    expect(computeConfidence(3, 0)).toBeGreaterThan(50);
    expect(computeConfidence(0, 3)).toBeLessThan(50);
    expect(computeConfidence(2, 2)).toBe(50);
    expect(computeConfidence(50, 0)).toBeLessThanOrEqual(99);
  });
});
