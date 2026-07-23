/**
 * WatchVerdict Search Lab — frozen seed-similarity fixtures.
 *
 * Every title carries a Title-DNA record grounded in the SAME 15-axis fingerprint
 * the production engine uses (src/lib/scoring/dimensions.ts, 0..100 each), plus
 * genres and interpretable keyword anchors. These are hand-designed ground-truth
 * for deterministic, offline grading — they are TEST DATA, never production
 * shortcuts. The production gate derives the identical shape from real TMDB
 * metadata + the cached title fingerprint; here we supply it directly so the
 * suite runs with no live TMDB/OpenAI/Supabase calls.
 *
 * `personalScore` simulates a user's personalized fit (0..100). It is deliberately
 * set HIGH on some contradiction titles (e.g. Edward Scissorhands) to prove that
 * personalization/popularity CANNOT rescue a candidate that fails the gate.
 */
import type { SeedTitle } from '@/lib/search/titleDna';

export interface FixtureTitle extends SeedTitle {
  /** Simulated personalized fit for the acting user (0..100). */
  personalScore: number;
  /** Simulated raw provider "similar/recommendations" rank position, if this
   *  title is in the seed's TMDB neighbour list (lower = TMDB ranked it higher). */
  providerRank?: number;
}

/** Neutral-ish helper so fixtures stay readable; unspecified axes are omitted
 *  (treated as unknown/low-confidence by the gate). */
type Dims = Partial<Record<string, number>>;

function t(
  canonicalId: string,
  tmdbId: number,
  title: string,
  year: number,
  genres: string[],
  keywords: string[],
  dims: Dims,
  personalScore: number,
  opts: { mediaType?: 'movie' | 'tv'; collectionId?: number | null; providerRank?: number } = {},
): FixtureTitle {
  return {
    canonicalId,
    tmdbId,
    title,
    year,
    mediaType: opts.mediaType ?? 'movie',
    genres,
    keywords,
    dims,
    collectionId: opts.collectionId ?? null,
    dimsConfidence: 0.9,
    personalScore,
    providerRank: opts.providerRank,
  };
}

// ---------------------------------------------------------------------------
// ROCKY universe (dev set)
// ---------------------------------------------------------------------------

export const ROCKY_SEED = t(
  'rocky-1976', 1366, 'Rocky', 1976,
  ['Drama', 'Sport'],
  ['boxing', 'underdog', 'training', 'perseverance', 'working_class', 'earned_payoff'],
  { realism: 88, character: 72, emotion: 80, warmth: 74, humor: 24, darkness: 42, stakes: 42, violence: 55, suspense: 55, pacing: 42, complexity: 38, romance: 40 },
  50, { collectionId: 1575 },
);

/** Candidate pool as if returned by the provider "similar/recommendations" list
 *  for Rocky — a realistic mix of genuine matches, franchise, contradictions,
 *  a duplicate seed record, and a canonical duplicate. */
export const ROCKY_CANDIDATES: FixtureTitle[] = [
  // Duplicate seed record (different TMDB id, same work) — must be excluded.
  t('rocky-1976', 999001, 'Rocky', 1976, ['Drama', 'Sport'], ['boxing', 'underdog', 'training'],
    { realism: 88, character: 72, emotion: 80, warmth: 74, humor: 24, realism_dup: 0 }, 60, { collectionId: 1575, providerRank: 3 }),
  // Exact seed by same id — must be excluded.
  t('rocky-1976', 1366, 'Rocky', 1976, ['Drama', 'Sport'], ['boxing', 'underdog'],
    { realism: 88, character: 72, emotion: 80 }, 88, { collectionId: 1575, providerRank: 1 }),

  // Franchise sequels (same collection) — eligible but franchise-capped.
  t('rocky-ii', 1367, 'Rocky II', 1979, ['Drama', 'Sport'], ['boxing', 'underdog', 'training', 'perseverance'],
    { realism: 85, character: 70, emotion: 78, warmth: 72, humor: 26, violence: 58, stakes: 45 }, 84, { collectionId: 1575, providerRank: 2 }),
  t('rocky-iv', 1374, 'Rocky IV', 1985, ['Drama', 'Sport'], ['boxing', 'underdog', 'training'],
    { realism: 62, character: 55, emotion: 66, stakes: 70, violence: 62, humor: 22 }, 70, { collectionId: 1575, providerRank: 4 }),

  // GENUINE non-seed matches (should qualify).
  t('creed-2015', 312221, 'Creed', 2015, ['Drama', 'Sport'], ['boxing', 'underdog', 'training', 'perseverance', 'working_class'],
    { realism: 85, character: 74, emotion: 82, warmth: 72, humor: 28, darkness: 46, stakes: 44, violence: 58 }, 66, { providerRank: 6 }),
  t('the-fighter-2010', 45317, 'The Fighter', 2010, ['Drama', 'Sport'], ['boxing', 'underdog', 'family', 'working_class', 'perseverance'],
    { realism: 90, character: 78, emotion: 80, warmth: 60, humor: 30, darkness: 55, stakes: 42, violence: 58 }, 61, { providerRank: 9 }),
  t('warrior-2011', 59440, 'Warrior', 2011, ['Drama', 'Sport'], ['mma', 'underdog', 'family', 'perseverance', 'working_class'],
    { realism: 86, character: 76, emotion: 84, warmth: 55, humor: 22, darkness: 58, stakes: 50, violence: 66 }, 58, { providerRank: 12 }),
  // Non-boxing underdog (should qualify when the lens supports underdog).
  t('rudy-1993', 21641, 'Rudy', 1993, ['Drama', 'Sport'], ['football', 'underdog', 'perseverance', 'working_class', 'earned_payoff', 'inspirational'],
    { realism: 84, character: 74, emotion: 82, warmth: 80, humor: 30, darkness: 30, stakes: 38, violence: 20 }, 55, { providerRank: 15 }),

  // CONTRADICTIONS (must FAIL the default Rocky gate) — with deliberately HIGH
  // personalScore to prove personalization can't rescue them.
  t('edward-scissorhands-1990', 162, 'Edward Scissorhands', 1990, ['Fantasy', 'Drama', 'Romance'],
    ['outsider', 'gothic', 'suburbia', 'fairy_tale', 'whimsical'],
    { realism: 12, character: 70, emotion: 82, warmth: 62, humor: 44, darkness: 55, stakes: 34, violence: 28, romance: 70 }, 90, { providerRank: 5 }),
  t('the-shape-of-water-2017', 399055, 'The Shape of Water', 2017, ['Fantasy', 'Drama', 'Romance'],
    ['fairy_tale', 'monster', 'outsider', 'cold_war'],
    { realism: 20, character: 72, emotion: 80, warmth: 60, humor: 30, darkness: 58, stakes: 40, violence: 45, romance: 78 }, 82, { providerRank: 8 }),
  t('la-la-land-2016', 313369, 'La La Land', 2016, ['Comedy', 'Drama', 'Romance', 'Music'],
    ['musical', 'romance', 'jazz', 'dreams'],
    { realism: 40, character: 66, emotion: 72, warmth: 70, humor: 55, darkness: 30, stakes: 28, violence: 8, romance: 88 }, 74, { providerRank: 11 }),
];

// ---------------------------------------------------------------------------
// HOLDOUT universe (NOT used to design/tune the gate — different seeds/genres)
// ---------------------------------------------------------------------------

export const JAWS_SEED = t(
  'jaws-1975', 578, 'Jaws', 1975, ['Thriller', 'Horror', 'Adventure'],
  ['shark', 'survival', 'ocean', 'man_vs_nature', 'suspense'],
  { realism: 78, suspense: 92, emotion: 60, darkness: 60, violence: 62, stakes: 66, pacing: 60, humor: 30, character: 55, warmth: 45 },
  50,
);
export const JAWS_CANDIDATES: FixtureTitle[] = [
  t('jaws-1975', 578, 'Jaws', 1975, ['Thriller', 'Horror'], ['shark', 'survival'], { suspense: 92, realism: 78 }, 88, { providerRank: 1 }),
  // genuine matches
  t('the-shallows-2016', 332567, 'The Shallows', 2016, ['Thriller', 'Horror'], ['shark', 'survival', 'ocean', 'man_vs_nature'],
    { realism: 74, suspense: 88, emotion: 52, darkness: 55, violence: 55, stakes: 55 }, 52, { providerRank: 5 }),
  t('the-meg-2018', 345940, 'The Meg', 2018, ['Action', 'Horror', 'Thriller'], ['shark', 'survival', 'ocean', 'monster'],
    { realism: 45, suspense: 74, emotion: 40, darkness: 45, violence: 55, stakes: 62, humor: 45 }, 50, { providerRank: 7 }),
  // contradiction (must fail): a gentle animated fish comedy shares "ocean" only.
  t('finding-nemo-2003', 12, 'Finding Nemo', 2003, ['Animation', 'Family', 'Comedy'], ['ocean', 'fish', 'family', 'journey'],
    { realism: 15, suspense: 30, emotion: 70, darkness: 15, violence: 8, humor: 70, warmth: 88, romance: 5 }, 80, { providerRank: 3 }),
];

export const GROUNDHOG_SEED = t(
  'groundhog-day-1993', 137, 'Groundhog Day', 1993, ['Comedy', 'Fantasy', 'Romance'],
  ['time_loop', 'redemption', 'romance', 'high_concept', 'feel_good'],
  { realism: 45, humor: 78, warmth: 82, emotion: 62, darkness: 25, complexity: 55, character: 74, romance: 70, violence: 6, pacing: 48 },
  50,
);
export const GROUNDHOG_CANDIDATES: FixtureTitle[] = [
  t('groundhog-day-1993', 137, 'Groundhog Day', 1993, ['Comedy', 'Fantasy'], ['time_loop'], { humor: 78, warmth: 82 }, 88, { providerRank: 1 }),
  t('palm-springs-2020', 587792, 'Palm Springs', 2020, ['Comedy', 'Romance', 'Fantasy'], ['time_loop', 'romance', 'high_concept', 'feel_good'],
    { realism: 42, humor: 76, warmth: 78, emotion: 60, darkness: 28, character: 72, romance: 74 }, 54, { providerRank: 4 }),
  t('about-time-2013', 122906, 'About Time', 2013, ['Drama', 'Romance', 'Fantasy'], ['time_travel', 'romance', 'family', 'feel_good'],
    { realism: 48, humor: 60, warmth: 88, emotion: 78, darkness: 20, character: 78, romance: 82 }, 57, { providerRank: 6 }),
  // contradiction (must fail): a bleak time-loop horror shares only "time_loop".
  t('triangle-2009', 24855, 'Triangle', 2009, ['Thriller', 'Horror', 'Mystery'], ['time_loop', 'survival', 'ocean'],
    { realism: 50, humor: 8, warmth: 12, emotion: 45, darkness: 82, violence: 62, suspense: 85, romance: 4 }, 78, { providerRank: 3 }),
];

export interface SeedFixture {
  key: string;
  seed: FixtureTitle;
  candidates: FixtureTitle[];
}

/** A seed whose only provider "neighbours" are contradictions — the zero-qualified
 *  case: the gate must return NO similar items (honest no-close-matches), never
 *  padding with these. */
export const ROCKY_ONLY_CONTRADICTIONS: FixtureTitle[] = ROCKY_CANDIDATES.filter((c) =>
  ['edward-scissorhands-1990', 'the-shape-of-water-2017', 'la-la-land-2016'].includes(c.canonicalId),
);

export const DEV_FIXTURES: SeedFixture[] = [
  { key: 'rocky', seed: ROCKY_SEED, candidates: ROCKY_CANDIDATES },
  { key: 'rocky_zero', seed: ROCKY_SEED, candidates: ROCKY_ONLY_CONTRADICTIONS },
];
export const HOLDOUT_FIXTURES: SeedFixture[] = [
  { key: 'jaws', seed: JAWS_SEED, candidates: JAWS_CANDIDATES },
  { key: 'groundhog', seed: GROUNDHOG_SEED, candidates: GROUNDHOG_CANDIDATES },
];
