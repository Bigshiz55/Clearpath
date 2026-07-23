/**
 * Phase 4 — frozen catalog fixtures.
 *
 * Each fixture title carries:
 *   - `meta`: a real `TitleMetadata` so the REAL deterministic engine
 *     (`buildVerdict`) scores it exactly as production would.
 *   - `facts`: independent ground-truth used by Layer B to *verify* returned
 *     titles (providers, broadcast airings, content type, attributes, language,
 *     fingerprint). Layer B never trusts the pipeline — it checks against these.
 *
 * The catalog is deliberately small and hand-designed to hit the required
 * scenarios (exactly-5, fewer-than-5, none, midnight-crossing, duplicates,
 * similar names, reruns vs premieres, taste-vs-network conflicts, weak-DNA,
 * previously watched/rejected, exclusion-carrying, on-a-service-not-subscribed).
 */
import type { TitleMetadata, WatchProviders } from '@/lib/types';
import type { ContentType } from '../contract';

export interface FixtureAiring {
  networkKey: string; // detectNetwork key, e.g. "lifetime"
  /** Hours from the run's "now" that the program STARTS (may be negative = in progress). */
  startOffsetHours: number;
  runtimeMinutes: number;
  isRerun?: boolean;
}

export interface FixtureFacts {
  contentType: ContentType;
  /** TMDB provider ids that INCLUDE this title (flatrate/free/ads). */
  providerIds: number[];
  /** Broadcast airings, if this title is on live TV. */
  airings?: FixtureAiring[];
  /** Independent attribute tags for excluded-attribute checks. */
  attributes: string[];
  language: string; // ISO code, e.g. "en"
  /** Optional 15-axis fingerprint 0..100 for ranking evaluation. */
  dims?: Record<string, number>;
}

export interface FixtureTitle {
  meta: TitleMetadata;
  facts: FixtureFacts;
}

/** Provider id → display name (subset of src/lib/services.ts STREAMING_SERVICES). */
export const PROVIDER_NAMES: Record<number, string> = {
  8: 'Netflix',
  9: 'Prime Video',
  15: 'Hulu',
  337: 'Disney+',
  1899: 'Max',
  531: 'Paramount+',
  386: 'Peacock',
  350: 'Apple TV+',
  43: 'Starz',
};

/** Synthesize a TMDB-shaped WatchProviders payload from provider ids. */
export function providersFor(providerIds: number[], region = 'US'): WatchProviders {
  if (providerIds.length === 0) return { region, link: null, options: [], available: false };
  return {
    region,
    link: `https://example.test/watch`,
    options: providerIds.map((id) => ({
      providerId: id,
      providerName: PROVIDER_NAMES[id] ?? `Provider ${id}`,
      type: 'flatrate' as const,
      logoPath: null,
    })),
    available: true,
  };
}

let AUTO_ID = 1000;
function makeMeta(over: Partial<TitleMetadata> = {}): TitleMetadata {
  return {
    id: AUTO_ID++,
    mediaType: 'movie',
    title: 'Untitled',
    year: 2021,
    overview: 'A reasonably descriptive overview so the scoring engine has text to work with.',
    genres: [],
    keywords: [],
    posterPath: '/poster.jpg', // non-null: real discoverTitles filters poster-less rows
    backdropPath: null,
    runtimeMinutes: 100,
    episodeRuntimeMinutes: null,
    numberOfSeasons: null,
    numberOfEpisodes: null,
    status: 'Released',
    contentRating: null,
    voteAverage: 6.8,
    voteCount: 1200,
    popularity: 40,
    trailerUrl: null,
    originalLanguage: 'en',
    spokenLanguages: ['English'],
    originCountries: ['US'],
    imdbId: null,
    imdbRating: null,
    rottenTomatoes: null,
    metascore: null,
    episodesAired: null,
    episodesTotal: null,
    nextEpisodeDate: null,
    englishAvailability: 'native',
    ...over,
  };
}

/** Helper to declare a fixture title compactly. `id` is stable + explicit. */
function T(
  id: number,
  title: string,
  meta: Partial<TitleMetadata>,
  facts: Partial<FixtureFacts> & { contentType: ContentType },
): FixtureTitle {
  return {
    meta: makeMeta({ id, title, ...meta }),
    facts: {
      providerIds: [],
      attributes: [],
      language: meta.originalLanguage ?? 'en',
      ...facts,
    },
  };
}

// ── Lifetime movies airing in the next 24h — the flagship scenario ──────────
// Scott (SCOTT_RULES) loves grounded domestic/crime thrillers, dislikes
// supernatural/sci-fi/noir/slow-burn. These give exactly the mix we need.

export const CATALOG: FixtureTitle[] = [
  // 5 strong-taste Lifetime movies inside the 24h window (the ideal answer set).
  T(2001, 'A Mother’s Worst Fear', { genres: ['Thriller', 'Drama'], keywords: ['kidnapping', 'domestic', 'stalker'], runtimeMinutes: 88, voteAverage: 6.4, voteCount: 400 },
    { contentType: 'movie', providerIds: [], attributes: ['domestic_thriller'], airings: [{ networkKey: 'lifetime', startOffsetHours: 2, runtimeMinutes: 88 }], dims: { darkness: 60, pacing: 55, realism: 75, suspense: 70 } }),
  T(2002, 'Deadly Vows', { genres: ['Thriller'], keywords: ['marriage', 'betrayal', 'domestic'], runtimeMinutes: 90, voteAverage: 6.2, voteCount: 320 },
    { contentType: 'movie', providerIds: [], attributes: ['domestic_thriller'], airings: [{ networkKey: 'lifetime', startOffsetHours: 5, runtimeMinutes: 90 }], dims: { darkness: 58, pacing: 60, realism: 78, suspense: 72 } }),
  T(2003, 'The Nanny Lied', { genres: ['Thriller', 'Mystery'], keywords: ['nanny', 'family', 'secrets'], runtimeMinutes: 86, voteAverage: 6.5, voteCount: 510 },
    { contentType: 'movie', providerIds: [], attributes: ['domestic_thriller'], airings: [{ networkKey: 'lifetime', startOffsetHours: 9, runtimeMinutes: 86 }], dims: { darkness: 55, pacing: 58, realism: 80, suspense: 68 } }),
  T(2004, 'Stolen by My Neighbor', { genres: ['Thriller', 'Crime'], keywords: ['abduction', 'suburb', 'grounded'], runtimeMinutes: 92, voteAverage: 6.1, voteCount: 280 },
    { contentType: 'movie', providerIds: [], attributes: ['grounded_crime', 'domestic_thriller'], airings: [{ networkKey: 'lifetime', startOffsetHours: 14, runtimeMinutes: 92 }], dims: { darkness: 62, pacing: 57, realism: 82, suspense: 74 } }),
  T(2005, 'Secrets in the Cul-de-Sac', { genres: ['Thriller', 'Drama'], keywords: ['neighbors', 'affair', 'domestic'], runtimeMinutes: 84, voteAverage: 6.3, voteCount: 350 },
    { contentType: 'movie', providerIds: [], attributes: ['domestic_thriller'], airings: [{ networkKey: 'lifetime', startOffsetHours: 20, runtimeMinutes: 84 }], dims: { darkness: 56, pacing: 59, realism: 79, suspense: 69 } }),

  // A 6th Lifetime movie that STARTS at 25h — just OUTSIDE the window (time boundary).
  T(2006, 'Vanished at Prom', { genres: ['Thriller'], keywords: ['teen', 'missing', 'domestic'], runtimeMinutes: 88, voteAverage: 6.6, voteCount: 600 },
    { contentType: 'movie', providerIds: [], attributes: ['domestic_thriller'], airings: [{ networkKey: 'lifetime', startOffsetHours: 25, runtimeMinutes: 88 }], dims: { darkness: 57, pacing: 58, realism: 80, suspense: 71 } }),

  // A Lifetime movie IN PROGRESS (started 1h ago, 2h runtime → ends inside window).
  T(2007, 'Midnight Confession', { genres: ['Thriller', 'Drama'], keywords: ['confession', 'domestic'], runtimeMinutes: 120, voteAverage: 6.0, voteCount: 210 },
    { contentType: 'movie', providerIds: [], attributes: ['domestic_thriller'], airings: [{ networkKey: 'lifetime', startOffsetHours: -1, runtimeMinutes: 120 }], dims: { darkness: 59, pacing: 56, realism: 77, suspense: 66 } }),

  // A Lifetime movie crossing midnight (starts 23h, ends 24.5h).
  T(2008, 'After the Storm', { genres: ['Drama', 'Thriller'], keywords: ['survivor', 'domestic'], runtimeMinutes: 90, voteAverage: 6.2, voteCount: 190 },
    { contentType: 'movie', providerIds: [], attributes: ['domestic_thriller'], airings: [{ networkKey: 'lifetime', startOffsetHours: 23, runtimeMinutes: 90 }], dims: { darkness: 58, pacing: 57, realism: 78, suspense: 67 } }),

  // A DUPLICATE listing of #2003 on a second Lifetime feed (dedup test).
  T(2003, 'The Nanny Lied', { genres: ['Thriller', 'Mystery'], keywords: ['nanny', 'family', 'secrets'], runtimeMinutes: 86, voteAverage: 6.5, voteCount: 510 },
    { contentType: 'movie', providerIds: [], attributes: ['domestic_thriller'], airings: [{ networkKey: 'lifetime', startOffsetHours: 9, runtimeMinutes: 86, isRerun: true }] }),

  // A supernatural Lifetime movie in-window — valid on network/time but a taste
  // VIOLATION-if-excluded and a strong Scott PENALTY (excluded_attribute test).
  T(2009, 'The Haunting of Maple Street', { genres: ['Horror', 'Thriller'], keywords: ['supernatural', 'ghost', 'haunting'], runtimeMinutes: 95, voteAverage: 6.7, voteCount: 720 },
    { contentType: 'movie', providerIds: [], attributes: ['supernatural'], airings: [{ networkKey: 'lifetime', startOffsetHours: 7, runtimeMinutes: 95 }], dims: { darkness: 80, realism: 20, suspense: 78 } }),

  // Hallmark movie — PERFECT taste-ish but WRONG NETWORK (network conflict test).
  T(2010, 'Love at the Lighthouse', { genres: ['Romance', 'Drama'], keywords: ['smalltown', 'romance', 'wholesome'], runtimeMinutes: 84, voteAverage: 7.1, voteCount: 900 },
    { contentType: 'movie', providerIds: [], attributes: [], airings: [{ networkKey: 'hallmark', startOffsetHours: 4, runtimeMinutes: 84 }], dims: { warmth: 85, darkness: 20 } }),

  // ── Streaming catalog (for platform_browse / where_to_watch) ──────────────
  // Netflix grounded crime thriller — strong taste, on Netflix.
  T(3001, 'The Silent Witness', { mediaType: 'movie', genres: ['Crime', 'Thriller'], keywords: ['detective', 'investigation', 'grounded'], runtimeMinutes: 118, voteAverage: 7.6, voteCount: 4200, imdbRating: 7.4, rottenTomatoes: 82 },
    { contentType: 'movie', providerIds: [8], attributes: ['grounded_crime', 'detective_mystery'], dims: { darkness: 65, pacing: 62, realism: 85, complexity: 70, suspense: 75 } }),
  // Netflix sci-fi — on Netflix but a Scott sci-fi PENALTY + excluded if "no sci-fi".
  T(3002, 'Orbital Decay', { mediaType: 'movie', genres: ['Science Fiction', 'Action'], keywords: ['space', 'aliens', 'future'], runtimeMinutes: 130, voteAverage: 7.9, voteCount: 8800, imdbRating: 7.7 },
    { contentType: 'movie', providerIds: [8], attributes: ['science_fiction'], dims: { realism: 15, pacing: 80, complexity: 60 } }),
  // Netflix psychological thriller — strong taste.
  T(3003, 'The Quiet Patient', { mediaType: 'movie', genres: ['Thriller', 'Mystery'], keywords: ['psychological', 'twist'], runtimeMinutes: 108, voteAverage: 7.3, voteCount: 3100, imdbRating: 7.1 },
    { contentType: 'movie', providerIds: [8], attributes: ['psychological_thriller'], dims: { darkness: 70, complexity: 78, pacing: 45, suspense: 80 } }),
  // Prime detective series — strong taste but NOT on Netflix (subscription test).
  T(3004, 'Cold Harbor', { mediaType: 'tv', genres: ['Crime', 'Drama'], keywords: ['detective', 'serial'], runtimeMinutes: null, episodeRuntimeMinutes: 50, numberOfSeasons: 3, numberOfEpisodes: 24, voteAverage: 8.1, voteCount: 5200, imdbRating: 8.0 },
    { contentType: 'tv', providerIds: [9], attributes: ['detective_mystery', 'grounded_crime'], dims: { darkness: 66, complexity: 72, realism: 84, serialized: 90 } }),
  // Disney+ family film — for "family movie night".
  T(3005, 'The Great Balloon Race', { mediaType: 'movie', genres: ['Family', 'Adventure'], keywords: ['kids', 'family', 'wholesome'], runtimeMinutes: 96, voteAverage: 7.0, voteCount: 2600, contentRating: 'PG' },
    { contentType: 'movie', providerIds: [337], attributes: ['family'], dims: { warmth: 88, darkness: 10, violence: 5 } }),
  // A noir on Netflix — Scott noir penalty / excluded if "no noir".
  T(3006, 'Rain on Fifth Street', { mediaType: 'movie', genres: ['Crime', 'Drama'], keywords: ['noir', 'detective', 'shadowy'], runtimeMinutes: 112, voteAverage: 7.2, voteCount: 1500 },
    { contentType: 'movie', providerIds: [8], attributes: ['noir'], dims: { darkness: 82, realism: 60 } }),
  // A slow-burn meditative film on Netflix (slow_burn penalty when defining).
  T(3007, 'The Long Field', { mediaType: 'movie', genres: ['Drama'], keywords: ['meditative', 'slow', 'contemplative'], runtimeMinutes: 158, voteAverage: 7.5, voteCount: 900 },
    { contentType: 'movie', providerIds: [8], attributes: ['slow_burn'], dims: { pacing: 12, darkness: 45, complexity: 70 } }),
  // Constraint-satisfied but WEAK DNA: a Netflix rom-com Scott is neutral on.
  T(3008, 'Two Weeks in Tuscany', { mediaType: 'movie', genres: ['Romance', 'Comedy'], keywords: ['vacation', 'romance'], runtimeMinutes: 100, voteAverage: 6.9, voteCount: 2200 },
    { contentType: 'movie', providerIds: [8], attributes: [], dims: { warmth: 70, humor: 65, darkness: 25 } }),

  // ── Similar-name pair (title disambiguation) ──────────────────────────────
  T(3009, 'The Detective', { mediaType: 'movie', genres: ['Crime'], keywords: ['detective'], runtimeMinutes: 105, year: 1968, voteAverage: 6.8, voteCount: 800 },
    { contentType: 'movie', providerIds: [43], attributes: ['detective_mystery'] }),
  T(3010, 'The Detectives', { mediaType: 'tv', genres: ['Crime', 'Comedy'], keywords: ['detective', 'procedural'], episodeRuntimeMinutes: 44, numberOfSeasons: 2, voteAverage: 7.0, voteCount: 650 },
    { contentType: 'tv', providerIds: [15], attributes: ['detective_mystery'] }),

  // ── Foreign-language title (language constraint / "no subtitles") ──────────
  T(3011, 'La Sombra', { mediaType: 'movie', genres: ['Thriller', 'Crime'], keywords: ['detective'], runtimeMinutes: 110, originalLanguage: 'es', spokenLanguages: ['Spanish'], englishAvailability: 'subtitles', voteAverage: 7.8, voteCount: 1900 },
    { contentType: 'movie', providerIds: [8], attributes: ['grounded_crime'], language: 'es' }),
];

/** Look up a fixture title by `${mediaType}-${id}`. Handles the duplicate 2003. */
export function catalogId(t: FixtureTitle): string {
  return `${t.meta.mediaType}-${t.meta.id}`;
}
