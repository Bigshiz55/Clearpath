import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AN ERRORED SEARCH IS UNKNOWN, NOT ABSENCE. The framed-referent chooser has
 * one rule that fires on emptiness: "the literal reading resolves to NOTHING
 * exact → the frame reading is the only reading" ("the Whiplash movie"). A
 * transient TMDB failure on the literal probe used to produce the same empty
 * pool as genuine absence, so a network blip silently rewrote the user's
 * words: "the Scary Movie movie" during a half-failed probe pair became a
 * verdict about some obscure film called "Scary". The flip may only run when
 * BOTH probes actually answered; on any probe failure the literal words
 * stand, and the main lookup below fails or recovers honestly on its own.
 */
const searchTitles = vi.fn<(q: string) => Promise<unknown[]>>();
vi.mock('@/lib/tmdb/client', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  searchTitles: (q: string) => searchTitles(q),
}));
vi.mock('server-only', () => ({}));

import { askJudgeTitle } from './askJudge';

const supabase = {} as never;

const taken2008 = { id: 8681, mediaType: 'movie', title: 'Taken', year: 2008, voteCount: 12000, popularity: 60 };
const theTaken2024 = { id: 999, mediaType: 'movie', title: 'The Taken', year: 2024, voteCount: 12, popularity: 2 };
const whiplash2014 = { id: 244786, mediaType: 'movie', title: 'Whiplash', year: 2014, voteCount: 15000, popularity: 70 };

beforeEach(() => {
  searchTitles.mockReset();
});

/** The query the MAIN lookup (third call) was given — i.e. which reading won. */
const mainLookupQuery = () => searchTitles.mock.calls[2]?.[0];

describe('framed-referent probes: failure is unknown, only an ANSWER can flip', () => {
  it('literal probe ERRORS → the literal words stand (no flip on a network blip)', async () => {
    searchTitles
      .mockImplementationOnce(async () => { throw new Error('TMDB 500'); }) // literal probe fails
      .mockImplementationOnce(async () => [taken2008]) // framed probe answers
      .mockImplementation(async () => []); // main lookup — empty keeps the test honest and offline
    const out = await askJudgeTitle(supabase, 'u', 'the Taken movie', undefined, 'the Taken');
    expect(out).toBeNull();
    expect(searchTitles.mock.calls[0]?.[0]).toBe('the Taken');
    expect(searchTitles.mock.calls[1]?.[0]).toBe('Taken');
    expect(mainLookupQuery()).toBe('the Taken');
  });

  it('framed probe ERRORS → the literal words stand (symmetry pin)', async () => {
    searchTitles
      .mockImplementationOnce(async () => [theTaken2024])
      .mockImplementationOnce(async () => { throw new Error('TMDB 500'); })
      .mockImplementation(async () => []);
    const out = await askJudgeTitle(supabase, 'u', 'the Taken movie', undefined, 'the Taken');
    expect(out).toBeNull();
    expect(mainLookupQuery()).toBe('the Taken');
  });

  it('literal probe ANSWERS empty → genuine absence still flips ("the Whiplash movie")', async () => {
    searchTitles
      .mockImplementationOnce(async () => []) // answered: no film is called "the Whiplash"
      .mockImplementationOnce(async () => [whiplash2014])
      .mockImplementation(async () => []);
    const out = await askJudgeTitle(supabase, 'u', 'the Whiplash movie', undefined, 'the Whiplash');
    expect(out).toBeNull();
    expect(mainLookupQuery()).toBe('Whiplash');
  });
});
