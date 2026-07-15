import { describe, it, expect } from 'vitest';
import { buildInterview, nudgesFromAnswers, type InterviewContext } from './interview';

const movie = (over: Partial<InterviewContext> = {}): InterviewContext => ({
  mediaType: 'movie',
  genres: [],
  runtimeMinutes: 110,
  numberOfSeasons: null,
  ...over,
});

describe('post-watch interview', () => {
  it('never asks more than three questions', () => {
    const qs = buildInterview(movie({ genres: ['Science Fiction'], runtimeMinutes: 170 }), 'finished');
    expect(qs.length).toBeLessThanOrEqual(3);
  });

  it('leads with "why did you stop" when abandoned, and "ending" when finished', () => {
    expect(buildInterview(movie(), 'abandoned')[0]!.key).toBe('why_stopped');
    expect(buildInterview(movie(), 'finished')[0]!.key).toBe('ending');
  });

  it('asks about pacing only for long titles', () => {
    expect(buildInterview(movie({ runtimeMinutes: 95 }), 'finished').some((q) => q.key === 'pacing')).toBe(false);
    expect(buildInterview(movie({ runtimeMinutes: 165 }), 'finished').some((q) => q.key === 'pacing')).toBe(true);
  });

  it('asks about a defining genre element and maps it to a trait', () => {
    const qs = buildInterview(movie({ genres: ['Science Fiction'] }), 'finished');
    expect(qs.some((q) => q.key === 'element:science_fiction')).toBe(true);
  });

  it('derives an avoid nudge only from clearly negative answers', () => {
    // Too slow + abandoned → avoid slow burn.
    expect(nudgesFromAnswers({ why_stopped: 'too_slow' }, 'abandoned')).toContain('slow_burn');
    // Element "more" but the user finished and liked the ending → no nudge.
    expect(nudgesFromAnswers({ 'element:science_fiction': 'more', ending: 'yes' }, 'finished')).toHaveLength(0);
    // Element "more" and disliked → avoid that element.
    expect(nudgesFromAnswers({ 'element:science_fiction': 'more', ending: 'no' }, 'finished')).toContain('science_fiction');
  });
});
