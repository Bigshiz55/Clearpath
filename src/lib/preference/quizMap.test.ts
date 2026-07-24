import { describe, it, expect } from 'vitest';
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { quizAnswerToEvent, gradeFor, legacyRatingFor, type QuizAnswer } from './quizMap';
import { deriveDna } from './engine';
import { resolveConfidence } from './confidence';
import { rankWithPreference } from './rank';

function dims(over: Record<string, number> = {}): TitleDimensions {
  const d: TitleDimensions = {};
  for (const k of DIMENSION_KEYS) d[k] = 50;
  return { ...d, ...over };
}
const fast = dims({ pacing: 90 });

function answer(over: Partial<QuizAnswer>): QuizAnswer {
  return { eventId: Math.random().toString(36).slice(2), titleId: 'movie:1', at: 0, recognition: 'seen', dims: fast, ...over };
}
/** Evidence accumulated on the pacing axis after N identical answers. */
function pacingEvidence(a: Partial<QuizAnswer>, n = 5): number {
  const events = Array.from({ length: n }, (_, i) => quizAnswerToEvent(answer({ ...a, eventId: `e${i}`, titleId: `t${i}` })));
  const state = deriveDna(events, 0);
  return state.experience.dims.pacing!.evidence + state.attraction.dims.pacing!.evidence;
}

describe('quiz answer → Watch DNA evidence', () => {
  it('(2) "Haven\'t seen it" creates NO taste evidence (exposure only)', () => {
    const state = deriveDna([quizAnswerToEvent(answer({ recognition: 'unseen', dims: fast }))], 0);
    expect(state.experience.samples).toBe(0);
    expect(state.attraction.samples).toBe(0);
    expect(state.experience.dims.pacing!.evidence).toBe(0);
  });

  it('(3) "Not sure / Skip" creates NO taste evidence', () => {
    const state = deriveDna([quizAnswerToEvent(answer({ recognition: 'unsure', dims: fast }))], 0);
    expect(state.experience.samples).toBe(0);
    expect(state.attraction.samples).toBe(0);
  });

  it('(4) Loved It produces stronger positive evidence than Liked It', () => {
    expect(pacingEvidence({ rating: 'loved' })).toBeGreaterThan(pacingEvidence({ rating: 'liked' }));
  });

  it('(5) Hated It produces stronger negative evidence than Disliked It', () => {
    expect(pacingEvidence({ rating: 'hated' })).toBeGreaterThan(pacingEvidence({ rating: 'disliked' }));
    // ...and both push the axis to the OPPOSITE pole (disliked a fast title ⇒ leans slow).
    const hated = deriveDna([quizAnswerToEvent(answer({ rating: 'hated' }))], 0);
    expect(hated.experience.dims.pacing!.pref).toBeLessThan(50);
  });

  it('(6) "It was okay" is weak/neutral evidence (weaker than Liked)', () => {
    expect(pacingEvidence({ rating: 'okay' })).toBeLessThan(pacingEvidence({ rating: 'liked' }));
  });

  it('(7) DNF is captured as its own grade + keeps the reason separate', () => {
    const ans = answer({ rating: 'liked', dnf: true, reasons: ['too_slow'] });
    expect(gradeFor(ans)).toBe('dnf'); // DNF overrides the tapped rating
    const ev = quizAnswerToEvent(ans);
    expect(ev.experienceGrade).toBe('dnf');
    expect(ev.reasons).toContain('too_slow'); // reason stored separately, not folded into the grade
    expect(legacyRatingFor(ans)).toBe(2);
  });

  it('(12) one answer cannot radically rewrite the profile (low confidence)', () => {
    const state = deriveDna([quizAnswerToEvent(answer({ rating: 'loved' }))], 0);
    expect(resolveConfidence(state.experience.dims.pacing!).confidence).toBeLessThan(0.3);
  });

  it('(11) recommendation ranking changes after meaningful ratings', () => {
    const slow = dims({ pacing: 8 });
    const cands = [
      { id: 'slow', objective: 74, dims: slow },
      { id: 'fast', objective: 72, dims: fast },
    ];
    const before = rankWithPreference(cands, deriveDna([], 0));
    expect(before.map((c) => c.id)).toEqual(['slow', 'fast']); // objective order

    const events = [
      ...Array.from({ length: 5 }, (_, i) => quizAnswerToEvent(answer({ eventId: `l${i}`, titleId: `l${i}`, rating: 'loved', dims: fast }))),
      ...Array.from({ length: 5 }, (_, i) => quizAnswerToEvent(answer({ eventId: `h${i}`, titleId: `h${i}`, rating: 'hated', dims: slow }))),
    ];
    const after = rankWithPreference(cands, deriveDna(events, 0));
    expect(after.map((c) => c.id)).toEqual(['fast', 'slow']); // flipped by real evidence
  });

  it('legacy 1–10 mirror preserves Loved>Liked>Okay>Disliked>Hated ordering', () => {
    const r = (rt: QuizAnswer['rating']) => legacyRatingFor(answer({ rating: rt }))!;
    expect(r('loved')).toBeGreaterThan(r('liked'));
    expect(r('liked')).toBeGreaterThan(r('okay'));
    expect(r('okay')).toBeGreaterThan(r('disliked'));
    expect(r('disliked')).toBeGreaterThan(r('hated'));
    expect(legacyRatingFor(answer({ recognition: 'unseen' }))).toBeNull();
  });
});
