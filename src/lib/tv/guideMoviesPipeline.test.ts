import { describe, it, expect } from 'vitest';
import { ingestedRowToAiring, showTypeForProgrammeType, type IngestedAiringRow } from './ingestedGuide';
import {
  GUIDE_CATEGORIES,
  buildChannelGuide,
  diagnoseMoviesEmpty,
  filterGuideByCategory,
  filterGuideByMedia,
  guideSummary,
  moviesDiagnostics,
} from './channelGuide';
import { buildProgrammeRow, classifyProgrammeType, type TvmazeShow } from '@/lib/viewing/ingest/tvmazeIngest';
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

/** Both coverage regimes, named. A licensed grid may call a window empty;
 *  an episode database may not — that difference IS the production incident. */
const LICENSED = { fullGridProviderLive: true };
const EPISODE_DB_ONLY = { fullGridProviderLive: false };

describe('TRUE EMPTY vs PIPELINE DEFECT vs COVERAGE — the smoke distinction', () => {
  it('a window with movies that a category intersection removed says FILTERED-OUT, under either coverage', () => {
    const rows = buildChannelGuide(fixtureAirings(), NOW);
    for (const coverage of [LICENSED, EPISODE_DB_ONLY]) {
      const d = diagnoseMoviesEmpty(rows, fixtureAirings(), NOW, coverage);
      expect(d.kind).toBe('filtered-out'); // movies exist; only a combination can zero them
    }
  });

  it('movie listings hidden by a MISSING SOURCE RUNTIME are named as the failing boundary', () => {
    // One movie, started 30 minutes ago, no runtime: `onNowOf` honestly
    // refuses it, so it appears nowhere — and the diagnosis must say WHY
    // instead of calling the schedule empty.
    const airings = [
      row({ stationName: 'HBO', title: 'Runtime-less Premiere', programmeType: 'movie', startAtUtc: iso(-30), runtimeMinutes: null }),
    ].map(ingestedRowToAiring);
    const rows = buildChannelGuide(airings, NOW);
    for (const coverage of [LICENSED, EPISODE_DB_ONLY]) {
      expect(diagnoseMoviesEmpty(rows, airings, NOW, coverage)).toEqual({ kind: 'unprovable-now', startedNoRuntime: 1 });
    }
  });

  it('a movie-free window is TRUE EMPTY only when a LICENSED GRID proves the coverage', () => {
    const airings = [
      row({ stationName: 'Bravo', title: 'Below Deck', programmeType: 'series', startAtUtc: iso(-5), runtimeMinutes: 60 }),
    ].map(ingestedRowToAiring);
    const rows = buildChannelGuide(airings, NOW);
    expect(diagnoseMoviesEmpty(rows, airings, NOW, LICENSED)).toEqual({ kind: 'true-empty', channelsWithListings: 1 });
  });

  it('WITHOUT a licensed grid, the same window is COVERAGE-UNPROVABLE — never "that\'s the schedule"', () => {
    // THE PRODUCTION SENTENCE THIS PINS: "No listing in this window is
    // classified as a movie… That's the schedule, not missing data" — said
    // while the only source was TVmaze, an episode database in which
    // Hallmark, LMN and TCM are absent ENTIRELY (measured live,
    // docs/tv-coverage/SOURCE_AND_CHANNEL_REPORT.md). Absence of evidence
    // from a source that cannot see movies is not evidence of an empty
    // schedule, and the diagnosis now makes the claim structurally
    // impossible: `true-empty` is unreachable without provable coverage.
    const airings = [
      row({ stationName: 'Bravo', title: 'Below Deck', programmeType: 'series', startAtUtc: iso(-5), runtimeMinutes: 60 }),
    ].map(ingestedRowToAiring);
    const rows = buildChannelGuide(airings, NOW);
    expect(diagnoseMoviesEmpty(rows, airings, NOW, EPISODE_DB_ONLY)).toEqual({
      kind: 'coverage-unprovable',
      channelsWithListings: 1,
    });
  });

  it('lack of coverage is NEVER converted into movies: the filter still returns zero unrelated channels', () => {
    // The other production failure: a movies question answered with a wall of
    // unrelated shows. Whatever the coverage story says, the Movies filter
    // must never pad — the honest zero stands.
    const airings = [
      row({ stationName: 'Bravo', title: 'Below Deck', programmeType: 'series', startAtUtc: iso(-5), runtimeMinutes: 60 }),
      row({ stationName: 'CNN', title: 'The Lead', programmeType: 'news', startAtUtc: iso(-10), runtimeMinutes: 60 }),
    ].map(ingestedRowToAiring);
    const rows = buildChannelGuide(airings, NOW);
    expect(filterGuideByMedia(rows, 'movie')).toEqual([]);
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

  it('"not missing data" is a claim only provable coverage may render', () => {
    /* The copy audit, pinned at the source level: every occurrence of the
       phrase must be either in the true-empty arm (unreachable without
       provable coverage — proven on the pure function above) or behind the
       `coverageProvable` ternary. Counting keeps a future arm from quietly
       reintroducing the unconditional claim. */
    const cmp = readFileSync(join(__dirname, '..', '..', 'components', 'ChannelGuide.tsx'), 'utf8');
    const claims = cmp.match(/not missing data/g) ?? [];
    expect(claims.length).toBe(2); // true-empty arm + the coverageProvable branch
    expect(cmp).toContain('coverageProvable');
    expect(cmp).toMatch(/coverageProvable\s*\?/);
  });
});

describe('structured observability — the numbers behind the sentence', () => {
  it('moviesDiagnostics reports coverage, window contents and exclusion reasons', () => {
    const airings = [
      row({ stationName: 'HBO', title: 'Runtime-less Premiere', programmeType: 'movie', startAtUtc: iso(-30), runtimeMinutes: null }),
      row({ stationName: 'Bravo', title: 'Below Deck', programmeType: 'series', startAtUtc: iso(-5), runtimeMinutes: 60 }),
    ].map(ingestedRowToAiring);
    const rows = buildChannelGuide(airings, NOW);
    const d = moviesDiagnostics(rows, airings, NOW, EPISODE_DB_ONLY);
    expect(d.coverage).toBe('episode-db-only');
    expect(d.listingsInWindow).toBe(2);
    expect(d.movieListings).toBe(1);
    expect(d.moviesVisible).toBe(0); // started, runtime-less → honestly invisible
    expect(d.startedNoRuntime).toBe(1);
    expect(d.showTypeHistogram).toEqual({ Movie: 1, Scripted: 1 });
    expect(moviesDiagnostics(rows, airings, NOW, LICENSED).coverage).toBe('licensed-grid');
  });
});

describe('RAW PROVIDER PAYLOAD through the REAL classification path', () => {
  /* THE COVERAGE HOLE THIS CLOSES: every fixture above starts from an
     `IngestedAiringRow` whose `programmeType` is ALREADY 'movie' — the
     classification boundary itself (raw TVmaze show → programme_type) was
     never crossed by any Movies test, so a regression there could not fail
     anything. These fixtures are shaped like the provider's own /schedule
     payload (episode + embedded show) and run the REAL boundary chain:

       classifyProgrammeType / buildProgrammeRow   (ingest classification)
         → programme_type                          (persisted verbatim —
                                                    tvmazeWriter.ts maps
                                                    row.programmeType to the
                                                    column 1:1)
         → ingestedRowToAiring                     (reader normalization)
         → buildChannelGuide → filterGuideByMedia  (what Movies shows)
  */
  const rawShow = (over: Partial<TvmazeShow>): TvmazeShow => ({
    id: 7001,
    name: 'Untitled',
    type: null,
    genres: [],
    runtime: 90,
    network: { name: 'Hallmark' },
    ...over,
  });

  /** The persisted row for a raw show, via the REAL builder — then read back
   *  exactly as the DB reader would (columns map 1:1). */
  function throughPipeline(show: TvmazeShow, startAtUtc: string, runtimeMinutes: number | null = 90) {
    const programme = buildProgrammeRow({
      episode: { id: 5001, airdate: '2026-08-14', airstamp: startAtUtc, runtime: runtimeMinutes },
      show,
    });
    return ingestedRowToAiring(
      row({
        stationName: show.network?.name ?? 'Unknown',
        title: programme.title,
        programmeType: programme.programmeType, // ← the real classification, persisted verbatim
        runtimeMinutes: programme.runtimeMinutes,
        startAtUtc,
      }),
    );
  }

  it('a raw provider MOVIE survives every boundary into the Movies filter — nothing is lost at ours', () => {
    // The canary's loss condition: "a raw provider movie lost at our
    // classification boundary". show.type 'Movie' is the provider's own
    // evidence, and it must arrive on screen still a movie.
    const airing = throughPipeline(rawShow({ type: 'Movie', name: 'A Recipe for Romance', genres: ['Romance'] }), iso(30));
    expect(airing.showType).toBe('Movie');
    const rows = buildChannelGuide([airing], NOW);
    const movies = filterGuideByMedia(rows, 'movie');
    expect(movies).toHaveLength(1);
    expect(movies[0]!.upNext[0]?.showName ?? movies[0]!.onNow?.showName).toBe('A Recipe for Romance');
  });

  it('VERIFIED: a film inside a SPECIAL container show persists as Special and is invisible to Movies — a provider-typing loss, not ours', () => {
    // The suspected container-show mismatch, verified at the code boundary:
    // TVmaze types the SHOW, not the airing. A film broadcast under a show
    // record typed 'Special' carries no machine-readable movie evidence in
    // the payload we receive, so the pipeline preserves the provider's own
    // typing. The fix for THIS loss is a source with airing-level typing
    // (the licensed-grid requirement) — NOT a guess at our boundary, which
    // the negative tests below forbid.
    const airing = throughPipeline(rawShow({ type: 'Special', name: 'The Wizard of Oz' }), iso(30));
    expect(airing.showType).toBe('Special');
    expect(filterGuideByMedia(buildChannelGuide([airing], NOW), 'movie')).toEqual([]);
  });

  it('NEGATIVE: a Special is never guessed into a Movie — by name, genre, runtime or channel', () => {
    // Movie-ish evidence that is NOT the provider's type field must not flip
    // the classification: a 'Romance' genre, a two-hour runtime, a movie
    // channel and a filmic title together still classify by show.type only.
    const tempting = rawShow({
      type: 'Special',
      name: 'Christmas in Evergreen',
      genres: ['Romance'],
      runtime: 120,
      network: { name: 'Hallmark Movies & Mysteries' },
    });
    expect(classifyProgrammeType(tempting)).toBe('special');
    expect(throughPipeline(tempting, iso(30), 120).showType).toBe('Special');
    // A 'Family' genre reroutes to the documented 'kids' bucket — a different
    // non-movie truth, still never a movie however filmic the trappings.
    expect(classifyProgrammeType(rawShow({ type: 'Special', genres: ['Romance', 'Family'], runtime: 120 }))).toBe('kids');
  });

  it('NEGATIVE: an unknown/missing type stays on the documented catch-all — never movie', () => {
    for (const type of [null, undefined, '', 'Documentary', 'Variety', 'Panel Show']) {
      const t = classifyProgrammeType(rawShow({ type: type as string | null }));
      expect(t, `type=${String(type)}`).not.toBe('movie');
    }
    expect(classifyProgrammeType(rawShow({ type: null }))).toBe('special');
  });

  it('NEGATIVE: Movies never shows a channel card without an evidenced movie on it', () => {
    // The guide's card is the CHANNEL. Movies may keep a mixed channel (the
    // series that ends at 9 to start a film is that film's context — pinned
    // above), but every card shown under Movies must EARN its place with at
    // least one visible listing the provider itself typed as a movie, and a
    // channel with none may never appear, whatever else is on it.
    const airings = [
      throughPipeline(rawShow({ id: 1, type: 'Movie', name: 'Real Film', network: { name: 'Hallmark' } }), iso(30)),
      throughPipeline(rawShow({ id: 2, type: 'Special', name: 'Award Night', network: { name: 'CBS' } }), iso(40)),
      throughPipeline(rawShow({ id: 3, type: 'Scripted', name: 'A Drama', network: { name: 'NBC' } }), iso(50)),
      throughPipeline(rawShow({ id: 4, type: 'News', name: 'Evening News', network: { name: 'CNN' } }), iso(60)),
    ];
    const movies = filterGuideByMedia(buildChannelGuide(airings, NOW), 'movie');
    expect(movies.map((r) => r.network)).toEqual(['Hallmark']);
    for (const r of movies) {
      const listings = [...(r.onNow ? [r.onNow] : []), ...r.upNext];
      expect(listings.some((a) => a.showType === 'Movie'), r.network).toBe(true);
    }
  });
});
