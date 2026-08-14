import { describe, it, expect } from 'vitest';
import { ingestedRowToAiring, showTypeForProgrammeType, type IngestedAiringRow } from './ingestedGuide';
import {
  GUIDE_CATEGORIES,
  buildChannelGuide,
  diagnoseMoviesEmpty,
  filterGuideByCategory,
  filterGuideByMedia,
  guideSummary,
} from './channelGuide';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * FULL GUIDE + MOVIES — the owner's fixture matrix over the REAL pipeline.
 *
 * "0 channels with listings" under the Movies chip, with valid programme
 * data in the tables, was the defect. These fixtures run the actual
 * production functions end to end — ingested row → Airing → channel rows →
 * media filter → category filter → summary — with the exact mix the owner
 * required: movie listings, ordinary TV listings, mixed channels, missing
 * optional metadata, a CURRENT movie and an UPCOMING movie. No mocks of the
 * pipeline itself, no hardcoded networks, and the empty states are proven
 * to tell TRUE EMPTY apart from a pipeline gap.
 */

const NOW = Date.parse('2026-08-14T20:00:00Z');
const iso = (offsetMin: number) => new Date(NOW + offsetMin * 60_000).toISOString();

const row = (over: Partial<IngestedAiringRow>): IngestedAiringRow => ({
  startAtUtc: iso(30),
  providerAiringId: null,
  stationName: 'Channel X',
  stationLogoUrl: null,
  programmeProviderId: null,
  title: 'Untitled Programme',
  episodeTitle: null,
  programmeType: 'series',
  seasonNumber: null,
  episodeNumber: null,
  genres: [],
  description: null,
  runtimeMinutes: 60,
  artworkUrl: null,
  ...over,
});

/** The owner's fixture: mixed channels, current + upcoming movies, plain TV,
 *  and missing optional metadata — through the real mapper. */
function fixtureAirings() {
  return [
    // CURRENT movie: started 40 min ago, 120-minute runtime → provably on now.
    row({ stationName: 'TCM', title: 'Casablanca', programmeType: 'movie', startAtUtc: iso(-40), runtimeMinutes: 120 }),
    // UPCOMING movie on the same channel, inside the window.
    row({ stationName: 'TCM', title: 'The Maltese Falcon', programmeType: 'movie', startAtUtc: iso(90), runtimeMinutes: 100 }),
    // MIXED channel: a show on now, a movie up next.
    row({ stationName: 'AMC', title: 'Talking Preview', programmeType: 'series', startAtUtc: iso(-10), runtimeMinutes: 30 }),
    row({ stationName: 'AMC', title: 'Halloween', programmeType: 'movie', startAtUtc: iso(45), runtimeMinutes: 105 }),
    // ORDINARY TV channel: shows only.
    row({ stationName: 'Bravo', title: 'Below Deck', programmeType: 'series', startAtUtc: iso(-5), runtimeMinutes: 60 }),
    row({ stationName: 'Bravo', title: 'Below Deck', programmeType: 'series', startAtUtc: iso(55), runtimeMinutes: 60 }),
    // MISSING OPTIONAL METADATA: an upcoming movie with no runtime, no art,
    // no description — still a listing.
    row({ stationName: 'Lifetime Movie Network', title: 'A Recipe for Romance', programmeType: 'movie', startAtUtc: iso(120), runtimeMinutes: null, artworkUrl: null, description: null }),
    // Sports channel, for category independence.
    row({ stationName: 'ESPN', title: 'SportsCenter', programmeType: 'sports', startAtUtc: iso(-15), runtimeMinutes: 60 }),
  ].map(ingestedRowToAiring);
}

describe('classification survives the reader boundary', () => {
  it('the documented vocabulary maps, and stale-taxonomy case/whitespace variants map identically', () => {
    expect(showTypeForProgrammeType('movie')).toBe('Movie');
    // THE SILENT KILLER this phase exists for: an exact-match lookup turned
    // any case/whitespace variant into 'Special' — invisible to the Movies
    // filter, the movies count and the movie-only selector at once.
    expect(showTypeForProgrammeType('Movie')).toBe('Movie');
    expect(showTypeForProgrammeType(' MOVIE ')).toBe('Movie');
    expect(showTypeForProgrammeType('series')).toBe('Scripted');
    // Unknowns still land on the documented catch-all — never guessed.
    expect(showTypeForProgrammeType('other')).toBe('Special');
    expect(showTypeForProgrammeType(null)).toBe('Special');
  });
});

describe('the Movies filter over the real pipeline', () => {
  const rows = buildChannelGuide(fixtureAirings(), NOW);

  it('a CURRENT movie makes its channel a movie channel', () => {
    const movies = filterGuideByMedia(rows, 'movie');
    expect(movies.map((r) => r.network)).toContain('TCM');
    const tcm = movies.find((r) => r.network === 'TCM')!;
    expect(tcm.onNow?.showName).toBe('Casablanca');
  });

  it('an UPCOMING movie qualifies a channel even when nothing is provably on now', () => {
    const movies = filterGuideByMedia(rows, 'movie');
    expect(movies.map((r) => r.network)).toContain('Lifetime Movie Network');
  });

  it('a MIXED channel appears under Movies AND under Shows', () => {
    expect(filterGuideByMedia(rows, 'movie').map((r) => r.network)).toContain('AMC');
    expect(filterGuideByMedia(rows, 'tv').map((r) => r.network)).toContain('AMC');
  });

  it('an ordinary TV channel is excluded from Movies, kept in Shows and All', () => {
    expect(filterGuideByMedia(rows, 'movie').map((r) => r.network)).not.toContain('Bravo');
    expect(filterGuideByMedia(rows, 'tv').map((r) => r.network)).toContain('Bravo');
    expect(filterGuideByMedia(rows, 'all').map((r) => r.network)).toContain('Bravo');
  });

  it('the summary counts the movies the filter sees — the sentence and the filter can never disagree', () => {
    const movies = filterGuideByMedia(rows, 'movie');
    expect(movies.length).toBeGreaterThan(0);
    expect(guideSummary(movies).channels).toBe(movies.length);
    expect(guideSummary(rows).movies).toBeGreaterThanOrEqual(4);
  });

  it('the media filter reads CLASSIFICATION only — never channel names', () => {
    const src = readFileSync(join(__dirname, 'channelGuide.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export function filterGuideByMedia'), src.indexOf('ONE-TAP CHANNEL GROUPS'));
    expect(fn).not.toContain('network');
    expect(fn).toContain("showType === 'Movie'");
  });
});

describe('category chips, proven independently of the media filter', () => {
  const rows = buildChannelGuide(fixtureAirings(), NOW);

  it.each([
    ['movies', 'TCM'],
    ['movies', 'Lifetime Movie Network'],
    ['feelgood', 'Lifetime Movie Network'],
    ['sports', 'ESPN'],
  ])('the %s chip matches %s', (key, network) => {
    const got = filterGuideByCategory(rows, key).map((r) => r.network);
    expect(got).toContain(network);
  });

  it('a chip never invents membership — Bravo matches no listed category above', () => {
    for (const key of ['movies', 'feelgood', 'sports', 'crime']) {
      expect(filterGuideByCategory(rows, key).map((r) => r.network)).not.toContain('Bravo');
    }
  });

  it('the category vocabulary is the canonical GUIDE_CATEGORIES list', () => {
    const keys = GUIDE_CATEGORIES.map((c) => c.key);
    for (const k of ['movies', 'feelgood', 'crime', 'sports']) expect(keys).toContain(k);
  });
});

describe('TRUE EMPTY vs PIPELINE DEFECT — the smoke distinction', () => {
  it('a window with movies that a category intersection removed says FILTERED-OUT', () => {
    const rows = buildChannelGuide(fixtureAirings(), NOW);
    const d = diagnoseMoviesEmpty(rows, fixtureAirings(), NOW);
    expect(d.kind).toBe('filtered-out'); // movies exist; only a combination can zero them
  });

  it('movie listings hidden by a MISSING SOURCE RUNTIME are named as the failing boundary', () => {
    // One movie, started 30 minutes ago, no runtime: `onNowOf` honestly
    // refuses it, so it appears nowhere — and the diagnosis must say WHY
    // instead of calling the schedule empty.
    const airings = [
      row({ stationName: 'HBO', title: 'Runtime-less Premiere', programmeType: 'movie', startAtUtc: iso(-30), runtimeMinutes: null }),
    ].map(ingestedRowToAiring);
    const rows = buildChannelGuide(airings, NOW);
    const d = diagnoseMoviesEmpty(rows, airings, NOW);
    expect(d).toEqual({ kind: 'unprovable-now', startedNoRuntime: 1 });
  });

  it('a genuinely movie-free window is TRUE EMPTY — a statement about the data', () => {
    const airings = [
      row({ stationName: 'Bravo', title: 'Below Deck', programmeType: 'series', startAtUtc: iso(-5), runtimeMinutes: 60 }),
    ].map(ingestedRowToAiring);
    const rows = buildChannelGuide(airings, NOW);
    expect(diagnoseMoviesEmpty(rows, airings, NOW)).toEqual({ kind: 'true-empty', channelsWithListings: 1 });
  });

  it('the guide never works around a zero: no auto-switch, no disabled chip, no hardcoded networks', () => {
    const cmp = readFileSync(join(__dirname, '..', '..', 'components', 'ChannelGuide.tsx'), 'utf8');
    expect(cmp).toContain('diagnoseMoviesEmpty');
    // Clearing filters is the USER's button; nothing programmatic flips the
    // media filter back to 'all' outside that handler.
    const clears = cmp.match(/setMedia\('all'\)/g) ?? [];
    expect(clears.length).toBe(1);
    expect(cmp).not.toMatch(/disabled[^\n]*media/);
  });
});
