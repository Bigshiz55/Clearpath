import { describe, it, expect } from 'vitest';
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { quizAnswerToEvent, legacyRatingFor, savesToWatchlist, type QuizAnswer } from './quizMap';
import { deriveDna } from './engine';
import { resolveConfidence } from './confidence';
import { rankWithPreference } from './rank';
import type { DnaChannel } from './types';

function dims(over: Record<string, number> = {}): TitleDimensions {
  const d: TitleDimensions = {};
  for (const k of DIMENSION_KEYS) d[k] = 50;
  return { ...d, ...over };
}
const fast = dims({ pacing: 90 });

function answer(over: Partial<QuizAnswer>): QuizAnswer {
  return { eventId: Math.random().toString(36).slice(2), titleId: 'movie:1', at: 0, intent: 'seen', dims: fast, ...over };
}
/** Evidence accumulated on the pacing axis of a given channel after N answers. */
function pacingEvidence(a: Partial<QuizAnswer>, channel: DnaChannel, n = 5): number {
  const events = Array.from({ length: n }, (_, i) => quizAnswerToEvent(answer({ ...a, eventId: `e${i}`, titleId: `t${i}` })));
  const state = deriveDna(events, 0);
  return state[channel].dims.pacing!.evidence;
}

describe('quiz answer → Watch DNA evidence', () => {
  it('"Seen it" ratings feed the EXPERIENCE channel, not attraction', () => {
    const state = deriveDna([quizAnswerToEvent(answer({ intent: 'seen', rating: 'loved' }))], 0);
    expect(state.experience.samples).toBe(1);
    expect(state.attraction.samples).toBe(0);
  });

  it('"Looks good" / "Watchlist" feed ATTRACTION (pre-watch pull), not experience', () => {
    const looks = deriveDna([quizAnswerToEvent(answer({ intent: 'looks_good' }))], 0);
    expect(looks.attraction.samples).toBe(1);
    expect(looks.experience.samples).toBe(0);
    expect(looks.attraction.dims.pacing!.pref).toBeGreaterThan(50); // liked-the-look of a fast title

    const wl = deriveDna([quizAnswerToEvent(answer({ intent: 'watchlist' }))], 0);
    expect(wl.attraction.samples).toBe(1);
    // Actively saving is stronger pull than a passing "looks good".
    expect(pacingEvidence({ intent: 'watchlist' }, 'attraction')).toBeGreaterThan(pacingEvidence({ intent: 'looks_good' }, 'attraction'));
  });

  it('(req 14) "Not interested" is ATTRACTION-negative — DISTINCT from watched-and-disliked', () => {
    const notInterested = deriveDna([quizAnswerToEvent(answer({ intent: 'not_interested' }))], 0);
    // Pre-watch rejection lives in ATTRACTION and pushes away from the fast pole…
    expect(notInterested.attraction.samples).toBe(1);
    expect(notInterested.attraction.dims.pacing!.pref).toBeLessThan(50);
    expect(notInterested.experience.samples).toBe(0); // …and creates NO experience evidence.

    const disliked = deriveDna([quizAnswerToEvent(answer({ intent: 'seen', rating: 'disliked' }))], 0);
    // Watched-and-disliked lives in EXPERIENCE and creates NO attraction evidence.
    expect(disliked.experience.samples).toBe(1);
    expect(disliked.attraction.samples).toBe(0);
  });

  it('Loved It produces stronger positive evidence than Liked It', () => {
    expect(pacingEvidence({ rating: 'loved' }, 'experience')).toBeGreaterThan(pacingEvidence({ rating: 'liked' }, 'experience'));
  });

  it('"It was okay" is weak/neutral evidence (weaker than Liked)', () => {
    expect(pacingEvidence({ rating: 'okay' }, 'experience')).toBeLessThan(pacingEvidence({ rating: 'liked' }, 'experience'));
  });

  it('"Didn\'t like it" pushes the axis to the OPPOSITE pole', () => {
    const s = deriveDna([quizAnswerToEvent(answer({ rating: 'disliked' }))], 0);
    expect(s.experience.dims.pacing!.pref).toBeLessThan(50); // disliked a fast title ⇒ leans slow
  });

  it('one answer cannot radically rewrite the profile (low confidence)', () => {
    const state = deriveDna([quizAnswerToEvent(answer({ rating: 'loved' }))], 0);
    expect(resolveConfidence(state.experience.dims.pacing!).confidence).toBeLessThan(0.3);
  });

  it('recommendation ranking changes after meaningful ratings', () => {
    const slow = dims({ pacing: 8 });
    const cands = [
      { id: 'slow', objective: 74, dims: slow },
      { id: 'fast', objective: 72, dims: fast },
    ];
    const before = rankWithPreference(cands, deriveDna([], 0));
    expect(before.map((c) => c.id)).toEqual(['slow', 'fast']); // objective order

    const events = [
      ...Array.from({ length: 5 }, (_, i) => quizAnswerToEvent(answer({ eventId: `l${i}`, titleId: `l${i}`, rating: 'loved', dims: fast }))),
      ...Array.from({ length: 5 }, (_, i) => quizAnswerToEvent(answer({ eventId: `d${i}`, titleId: `d${i}`, rating: 'disliked', dims: slow }))),
    ];
    const after = rankWithPreference(cands, deriveDna(events, 0));
    expect(after.map((c) => c.id)).toEqual(['fast', 'slow']); // flipped by real evidence
  });

  it('legacy 1–10 mirror maps seen ratings and skips pre-watch intents', () => {
    const r = (rt: QuizAnswer['rating']) => legacyRatingFor(answer({ intent: 'seen', rating: rt }))!;
    expect(r('loved')).toBeGreaterThan(r('liked'));
    expect(r('liked')).toBeGreaterThan(r('okay'));
    expect(r('okay')).toBeGreaterThan(r('disliked'));
    expect(legacyRatingFor(answer({ intent: 'looks_good' }))).toBeNull();
    expect(legacyRatingFor(answer({ intent: 'not_interested' }))).toBeNull();
  });

  it('only "Watchlist" saves to the watchlist', () => {
    expect(savesToWatchlist(answer({ intent: 'watchlist' }))).toBe(true);
    expect(savesToWatchlist(answer({ intent: 'looks_good' }))).toBe(false);
    expect(savesToWatchlist(answer({ intent: 'seen', rating: 'loved' }))).toBe(false);
  });
});
