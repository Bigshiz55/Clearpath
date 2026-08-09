/**
 * TEMPORAL TASTE MEMORY (§5, §6, §15) — the derived-state snapshot, and the
 * guarantee that EXPLICIT high-weight signals dominate WEAK inferred ones.
 *
 * The event log (preference_events) is already append-only and auditable; here
 * we lock two properties of the DERIVED state that the Knowledge-Layer work
 * makes persistable:
 *   • confidence is a monotonic function of accumulated evidence, so a
 *     post-watch "loved" grade outweighs an "interested" impression;
 *   • the snapshot preserves that ordering into trait_confidence rows.
 */
import { describe, it, expect } from 'vitest';
import { deriveDna } from './engine';
import { snapshotDna } from './snapshot';
import type { PreferenceEvent } from './types';
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';

const ev = (over: Partial<PreferenceEvent>): PreferenceEvent => ({
  id: `e${Math.round(Math.random() * 1e9)}`,
  at: 0,
  titleId: 'movie:1',
  action: 'skip',
  ...over,
});

const dims = (o: Record<string, number>): Record<string, number> => {
  const full: Record<string, number> = {};
  for (const k of DIMENSION_KEYS) full[k] = o[k] ?? 50;
  return full;
};

describe('temporal taste memory — snapshot of derived state', () => {
  it('EXPLICIT post-watch love outweighs a WEAK unseen impression (§6/§15)', () => {
    const fast = dims({ pacing: 90 });
    // One explicit, high-weight signal: "I watched it and loved it."
    const explicit = deriveDna([ev({ action: 'seen_liked', experienceGrade: 'loved', dims: fast })], 0);
    // One weak inferred signal: "haven't seen it, looks interesting" (a soft lean).
    const weak = deriveDna([ev({ action: 'unseen_interested', attractionGrade: 'interested', dims: fast })], 0);

    const eSnap = snapshotDna(explicit);
    const wSnap = snapshotDna(weak);
    const ePacing = eSnap.traits.find((t) => t.channel === 'experience' && t.traitKey === 'pacing');
    const wPacing = wSnap.traits.find((t) => t.channel === 'attraction' && t.traitKey === 'pacing');
    expect(ePacing).toBeTruthy();
    expect(wPacing).toBeTruthy();
    // The explicit post-watch signal accumulates more evidence → higher confidence.
    expect(ePacing!.evidence).toBeGreaterThan(wPacing!.evidence);
    expect(ePacing!.confidence).toBeGreaterThan(wPacing!.confidence);
  });

  it('confidence rises with repeated corroborating evidence, and "developed" grows', () => {
    const fast = dims({ pacing: 90 });
    const one = snapshotDna(deriveDna([ev({ action: 'seen_liked', experienceGrade: 'loved', dims: fast })], 0));
    const many = snapshotDna(
      deriveDna(Array.from({ length: 6 }, (_, i) => ev({ id: `x${i}`, action: 'seen_liked', experienceGrade: 'loved', dims: fast })), 0),
    );
    const c1 = one.traits.find((t) => t.channel === 'experience' && t.traitKey === 'pacing')!.confidence;
    const c6 = many.traits.find((t) => t.channel === 'experience' && t.traitKey === 'pacing')!.confidence;
    expect(c6).toBeGreaterThan(c1);
    expect(many.developed).toBeGreaterThanOrEqual(one.developed);
  });

  it('an all-zero belief is never emitted, and the snapshot exposes provenance columns', () => {
    const snap = snapshotDna(deriveDna([ev({ action: 'seen_liked', experienceGrade: 'loved', dims: dims({ pacing: 90 }) })], 0));
    expect(snap.traits.length).toBeGreaterThan(0);
    for (const t of snap.traits) {
      expect(t.evidence).toBeGreaterThan(0);
      expect(t.confidence).toBeGreaterThanOrEqual(0);
      expect(t.confidence).toBeLessThanOrEqual(1);
      expect(['experience', 'attraction', 'discovery']).toContain(t.channel);
    }
    expect(typeof snap.developed).toBe('number');
    expect(snap.categories).toHaveProperty('experience');
  });
});
