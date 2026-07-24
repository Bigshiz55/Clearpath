import { describe, it, expect } from 'vitest';
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { deriveDna, deriveCorrections } from './engine';
import { preferenceNudge, preferenceConfidence, hasPreferenceSignal, rankWithPreference } from './rank';
import type { PreferenceEvent } from './types';

const DAY = 86_400_000;
function dims(over: Record<string, number> = {}): TitleDimensions {
  const d: TitleDimensions = {};
  for (const k of DIMENSION_KEYS) d[k] = 50;
  return { ...d, ...over };
}
const ev = (over: Partial<PreferenceEvent>): PreferenceEvent => ({
  id: Math.random().toString(36).slice(2), at: 0, titleId: 't', action: 'skip', ...over,
});
const many = (n: number, over: Partial<PreferenceEvent>) => Array.from({ length: n }, (_, i) => ev({ id: `${over.action}${i}`, titleId: `x${i}`, ...over }));

const fast = dims({ pacing: 92 });
const slow = dims({ pacing: 8 });
const dark = dims({ darkness: 90 });

describe('preference nudge — production ranking contribution', () => {
  it('is a strict no-op with no preference evidence', () => {
    const empty = deriveDna([], 0);
    expect(hasPreferenceSignal(empty)).toBe(false);
    expect(preferenceNudge({ dims: fast }, empty).nudge).toBe(0);
  });

  it('stays within ±PREF_NUDGE_MAX', () => {
    const strong = deriveDna(many(20, { action: 'seen_liked', experienceGrade: 'loved', dims: fast }), 0);
    const n = preferenceNudge({ dims: fast }, strong).nudge;
    expect(Math.abs(n)).toBeLessThanOrEqual(10 + 1e-9);
  });

  it('(a) EXPERIENCE outweighs ATTRACTION for the same reaction', () => {
    const exp = deriveDna(many(8, { action: 'seen_liked', dims: fast }), 0);
    const att = deriveDna(many(8, { action: 'unseen_interested', dims: fast }), 0);
    const nExp = preferenceNudge({ dims: fast }, exp).nudge;
    const nAtt = preferenceNudge({ dims: fast }, att).nudge;
    expect(nExp).toBeGreaterThan(0);
    expect(nAtt).toBeGreaterThan(0);
    expect(nExp).toBeGreaterThan(nAtt);
  });

  it('(b) explicit CORRECTIONS override inferred signals', () => {
    // Inferred: dislikes dark (rejected dark titles). Correction: actually likes dark.
    const events = many(5, { action: 'seen_disliked', dims: dark });
    const dna = deriveDna(events, 0);
    const inferred = preferenceNudge({ dims: dark }, dna).nudge;
    expect(inferred).toBeLessThan(0); // inferred dislikes dark ⇒ dark title penalized

    const corrected = deriveCorrections([ev({ corrections: [{ key: 'darkness', target: 90 }] })]);
    const nudge = preferenceNudge({ dims: dark }, dna, { corrections: corrected }).nudge;
    expect(nudge).toBeGreaterThan(0); // the correction wins
  });

  it('(c) rejection / DNF patterns lower matching titles', () => {
    const hatesSlow = deriveDna([
      ...many(3, { action: 'seen_disliked', experienceGrade: 'hated', dims: slow }),
      ...many(2, { action: 'seen_liked', experienceGrade: 'dnf', dims: slow }), // DNF slow titles too
    ], 0);
    const nSlow = preferenceNudge({ dims: slow }, hatesSlow).nudge;
    const nFast = preferenceNudge({ dims: fast }, hatesSlow).nudge;
    expect(nSlow).toBeLessThan(0);
    expect(nFast).toBeGreaterThan(nSlow);
  });

  it('(d) temporary mood decays without a permanent penalty', () => {
    const moodReject = many(8, { action: 'unseen_not_interested', dims: fast, reasons: ['not_in_the_mood'] });
    const now = preferenceNudge({ dims: fast }, deriveDna(moodReject, 0)).nudge;
    const later = preferenceNudge({ dims: fast }, deriveDna(moodReject, 60 * DAY)).nudge;
    expect(Math.abs(later)).toBeLessThan(Math.abs(now)); // penalty fades
  });

  it('(e) low-confidence users get lower-confidence nudges', () => {
    const thin = deriveDna([ev({ action: 'seen_liked', dims: fast })], 0);
    const rich = deriveDna(
      DIMENSION_KEYS.flatMap((k, i) => many(3, { action: 'seen_liked', experienceGrade: 'loved', dims: dims({ [k]: i % 2 ? 90 : 10 }) })),
      0,
    );
    expect(preferenceConfidence(thin)).toBeLessThan(preferenceConfidence(rich));
    expect(preferenceConfidence(thin)).toBeLessThan(0.3);
  });

  it('(f) completing a round MATERIALLY changes recommendation order', () => {
    const candidates = [
      { id: 'slow', objective: 72, dims: slow },
      { id: 'fast', objective: 70, dims: fast },
    ];
    // Before: no DNA ⇒ objective order (slow 72 > fast 70).
    const before = rankWithPreference(candidates, deriveDna([], 0));
    expect(before.map((c) => c.id)).toEqual(['slow', 'fast']);

    // After a round establishing "loves fast, dislikes slow", the order flips.
    const round = deriveDna([
      ...many(5, { action: 'seen_liked', experienceGrade: 'loved', dims: fast }),
      ...many(5, { action: 'seen_disliked', experienceGrade: 'hated', dims: slow }),
    ], 0);
    const after = rankWithPreference(candidates, round);
    expect(after.map((c) => c.id)).toEqual(['fast', 'slow']);
    expect(after.find((c) => c.id === 'fast')!.nudge).toBeGreaterThan(0);
  });
});
