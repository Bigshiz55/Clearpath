import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * "Watchlist" must trigger DNA exactly like "Looks good" — the two buttons
 * should never require a user to tap both to get one credited signal. This
 * proves the wiring in recordQuizAnswer, not just the pure quizMap logic
 * quizMap.test.ts already covers: every intent (including 'watchlist')
 * reaches the real engine via recordEvents, and only 'watchlist'
 * additionally saves the title.
 */

const recordEvents = vi.fn().mockResolvedValue(undefined);
const undoEvent = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/preference/store', () => ({ recordEvents, undoEvent }));

const getCachedDimensions = vi.fn().mockResolvedValue(new Map());
vi.mock('@/lib/titleDimensions', () => ({ getCachedDimensions }));

const addToWatchlist = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/lib/actions/watchlist', () => ({ addToWatchlist }));

const rateQuizTitle = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/lib/actions/quiz', () => ({ rateQuizTitle }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}));

const { recordQuizAnswer } = await import('./dnaQuiz');

const base = {
  eventId: 'evt-123456',
  tmdbId: 603,
  mediaType: 'movie' as const,
  title: 'The Matrix',
  year: 1999,
  posterPath: '/poster.jpg',
};

beforeEach(() => {
  recordEvents.mockClear();
  addToWatchlist.mockClear();
  rateQuizTitle.mockClear();
});

describe('Watchlist triggers DNA exactly like Looks good', () => {
  it('"Looks good" records a DNA event and does not save to the watchlist', async () => {
    await recordQuizAnswer({ ...base, intent: 'looks_good' });
    expect(recordEvents).toHaveBeenCalledTimes(1);
    expect(addToWatchlist).not.toHaveBeenCalled();
  });

  it('"Watchlist" records a DNA event AND saves to the watchlist — one tap, both effects', async () => {
    await recordQuizAnswer({ ...base, intent: 'watchlist' });
    expect(recordEvents).toHaveBeenCalledTimes(1);
    expect(addToWatchlist).toHaveBeenCalledTimes(1);
    expect(addToWatchlist).toHaveBeenCalledWith(
      expect.objectContaining({ tmdbId: 603, mediaType: 'movie', status: 'possible' }),
    );
  });

  it('the DNA event for "Watchlist" carries a stronger attraction grade than "Looks good"', async () => {
    await recordQuizAnswer({ ...base, intent: 'looks_good' });
    const looksGoodEvent = recordEvents.mock.calls[0]![2][0];
    recordEvents.mockClear();

    await recordQuizAnswer({ ...base, intent: 'watchlist' });
    const watchlistEvent = recordEvents.mock.calls[0]![2][0];

    expect(looksGoodEvent.attractionGrade).toBe('interested');
    expect(watchlistEvent.attractionGrade).toBe('must_watch');
  });
});
