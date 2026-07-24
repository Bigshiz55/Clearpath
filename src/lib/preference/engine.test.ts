import { describe, it, expect } from 'vitest';
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import {
  deriveDna,
  emptyDna,
  understanding,
  topTraits,
  undoLast,
  withoutEvent,
} from './engine';
import { resolveConfidence } from './confidence';
import type { PreferenceEvent } from './types';

const DAY = 86_400_000;

/** A full 15-axis fingerprint, defaulting every axis to neutral 50. */
function dims(over: Record<string, number> = {}): TitleDimensions {
  const d: TitleDimensions = {};
  for (const k of DIMENSION_KEYS) d[k] = 50;
  return { ...d, ...over };
}

const ev = (over: Partial<PreferenceEvent>): PreferenceEvent => ({
  id: Math.random().toString(36).slice(2), at: 0, titleId: 'movie:1', action: 'skip', ...over,
});

describe('preference engine — derive', () => {
  it('a skip event creates zero DNA', () => {
    const s = deriveDna([ev({ action: 'skip', dims: dims({ pacing: 90 }) })], 0);
    expect(s.experience.samples).toBe(0);
    expect(s.attraction.samples).toBe(0);
    expect(understanding(s)).toBe(0);
  });

  it('EXPERIENCE and ATTRACTION never mix (the core separation)', () => {
    const fast = dims({ pacing: 90 });
    const exp = deriveDna([ev({ action: 'seen_liked', dims: fast })], 0);
    expect(exp.experience.dims.pacing!.pref).toBeGreaterThan(70);
    expect(exp.attraction.dims.pacing!.evidence).toBe(0); // untouched

    const att = deriveDna([ev({ action: 'unseen_interested', dims: fast })], 0);
    expect(att.attraction.dims.pacing!.pref).toBeGreaterThan(70);
    expect(att.experience.dims.pacing!.evidence).toBe(0); // untouched
  });

  it('a disliked title credits the OPPOSITE pole', () => {
    const slow = dims({ pacing: 10 });
    const s = deriveDna([ev({ action: 'seen_disliked', dims: slow })], 0);
    // Disliked a slow title ⇒ leans toward fast.
    expect(s.experience.dims.pacing!.pref).toBeGreaterThan(70);
  });

  it('builds confidence only with repeated, consistent evidence', () => {
    const fast = dims({ pacing: 90 });
    const one = deriveDna([ev({ action: 'seen_liked', experienceGrade: 'loved', dims: fast })], 0);
    expect(resolveConfidence(one.experience.dims.pacing!).confidence).toBeLessThan(0.3);

    const many = deriveDna(
      Array.from({ length: 5 }, (_, i) => ev({ id: `x${i}`, action: 'seen_liked', experienceGrade: 'loved', dims: fast })),
      0,
    );
    expect(resolveConfidence(many.experience.dims.pacing!).confidence).toBeGreaterThan(0.4);
  });

  it('a specific reason does not smear blame across every axis (dampening)', () => {
    const animatedComedy = dims({ humor: 90 });
    const noReason = deriveDna(
      [ev({ action: 'unseen_not_interested', dims: animatedComedy, genres: ['animation'] })], 0,
    );
    const withReason = deriveDna(
      [ev({ action: 'unseen_not_interested', dims: animatedComedy, genres: ['animation'], reasons: ['animation'] })], 0,
    );
    // The humor axis is blamed less when the real reason (animation) is given…
    expect(withReason.attraction.dims.humor!.evidence).toBeLessThan(noReason.attraction.dims.humor!.evidence);
    // …and the animation genre is rejected more strongly.
    expect(withReason.attraction.genres.animation!.evidence).toBeGreaterThan(noReason.attraction.genres.animation!.evidence);
    expect(withReason.attraction.genres.animation!.pref).toBeLessThan(50);
  });

  it('mood signals decay with age; permanent ones do not', () => {
    const e = ev({ action: 'skip', discoveryGrade: 'know_but_skipped', genres: ['drama'] });
    const now0 = deriveDna([e], 0);
    const later = deriveDna([e], 60 * DAY);
    expect(now0.discovery.genres.drama!.evidence).toBeGreaterThan(later.discovery.genres.drama!.evidence);

    const perm = ev({ action: 'seen_liked', genres: ['crime'] });
    const p0 = deriveDna([perm], 0);
    const pLater = deriveDna([perm], 60 * DAY);
    expect(pLater.experience.genres.crime!.evidence).toBeCloseTo(p0.experience.genres.crime!.evidence, 6);
  });

  it('presentation-only reasons never move taste dimensions', () => {
    const t = dims({ pacing: 95 });
    const s = deriveDna([ev({ action: 'unseen_not_interested', dims: t, reasons: ['poster'] })], 0);
    // The primary not-interested still learns from the title, but the poster
    // reason adds no dimensional taste of its own — assert it's present but the
    // reason itself contributed no separate dim evidence beyond the primary.
    const primaryOnly = deriveDna([ev({ action: 'unseen_not_interested', dims: t })], 0);
    expect(s.attraction.dims.pacing!.evidence).toBeCloseTo(primaryOnly.attraction.dims.pacing!.evidence, 6);
  });

  it('understanding grows with evidence but never hits 100 quickly', () => {
    const varied = [
      ev({ id: 'a', action: 'seen_liked', experienceGrade: 'loved', dims: dims({ pacing: 90, violence: 80 }) }),
      ev({ id: 'b', action: 'unseen_interested', dims: dims({ humor: 85, romance: 15 }) }),
      ev({ id: 'c', action: 'seen_disliked', dims: dims({ complexity: 90 }) }),
    ];
    const u = understanding(deriveDna(varied, 0));
    expect(u).toBeGreaterThan(0);
    expect(u).toBeLessThan(60);
  });

  it('topTraits surfaces confident, directional axes', () => {
    const fast = dims({ pacing: 92 });
    const s = deriveDna(Array.from({ length: 6 }, (_, i) => ev({ id: `t${i}`, action: 'seen_liked', experienceGrade: 'loved', dims: fast })), 0);
    const top = topTraits(s.experience, { min: 0.3 });
    const pacing = top.find((t) => t.kind === 'dim' && t.key === 'pacing');
    expect(pacing).toBeTruthy();
    expect(pacing!.conf.polarity).toBe(1);
  });
});

describe('preference engine — undo (edit DNA forever)', () => {
  const e1 = ev({ id: 'e1', action: 'seen_liked', dims: dims({ pacing: 90 }) });
  const e2 = ev({ id: 'e2', action: 'seen_disliked', dims: dims({ violence: 90 }) });

  it('undoLast re-derives without the most recent event', () => {
    const full = deriveDna([e1, e2], 0);
    const undone = deriveDna(undoLast([e1, e2]), 0);
    expect(full.experience.samples).toBe(2);
    expect(undone.experience.samples).toBe(1);
    // The violence signal from e2 is gone.
    expect(undone.experience.dims.violence!.evidence).toBe(0);
    expect(undone.experience.dims.pacing!.evidence).toBeGreaterThan(0);
  });

  it('withoutEvent removes a specific event by id', () => {
    const s = deriveDna(withoutEvent([e1, e2], 'e1'), 0);
    expect(s.experience.dims.pacing!.evidence).toBe(0);
    expect(s.experience.dims.violence!.evidence).toBeGreaterThan(0);
  });

  it('re-deriving is deterministic and order-independent in evidence', () => {
    const a = deriveDna([e1, e2], 0);
    const b = deriveDna([e2, e1], 0);
    expect(a.experience.dims.pacing!.evidence).toBeCloseTo(b.experience.dims.pacing!.evidence, 9);
    expect(a.experience.dims.violence!.evidence).toBeCloseTo(b.experience.dims.violence!.evidence, 9);
  });

  it('emptyDna has all dimensions initialized', () => {
    const s = emptyDna();
    for (const k of DIMENSION_KEYS) expect(s.experience.dims[k]!.pref).toBe(50);
  });
});
