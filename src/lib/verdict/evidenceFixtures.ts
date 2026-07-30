// Data conditions the verdict evidence panel has to survive. Shared by the unit
// tests and the /dev/verdict harness so the browser tests and the unit tests
// exercise the SAME inputs — a scenario can't pass in one and quietly differ in
// the other.
//
// These are fixtures, not fabrications: they stand in for TMDB/OMDb responses so
// the layout can be verified without live keys. Nothing here is ever served on a
// real title page.
import type { TitleMetadata } from '@/lib/types';

export interface Scenario {
  id: string;
  label: string;
  /** What this case is meant to prove. */
  intent: string;
  meta: TitleMetadata;
}

const BASE: TitleMetadata = {
  id: 0,
  mediaType: 'movie',
  title: 'Fixture Title',
  year: 2019,
  overview:
    'Fixture metadata used to verify the verdict screen renders honestly across every combination of available and unavailable rating sources.',
  genres: ['Drama', 'Mystery'],
  keywords: [],
  posterPath: null,
  backdropPath: null,
  runtimeMinutes: 118,
  episodeRuntimeMinutes: null,
  numberOfSeasons: null,
  numberOfEpisodes: null,
  status: 'Released',
  contentRating: 'PG-13',
  voteAverage: null,
  voteCount: 0,
  popularity: 24.5,
  trailerUrl: null,
  originalLanguage: 'en',
  spokenLanguages: ['English'],
  originCountries: ['US'],
  imdbId: null,
  imdbRating: null,
  rottenTomatoes: null,
  rtAudience: null,
  metascore: null,
  metacriticUser: null,
  trakt: null,
  letterboxd: null,
  rogerEbert: null,
  episodesAired: null,
  episodesTotal: null,
  nextEpisodeDate: null,
  englishAvailability: 'native',
};

const meta = (over: Partial<TitleMetadata>): TitleMetadata => ({ ...BASE, ...over });

export const SCENARIOS: Scenario[] = [
  {
    id: 'A',
    label: 'Only TMDB available',
    intent: 'The reported production case: one real source, eight unavailable.',
    meta: meta({ title: 'A — TMDB only', voteAverage: 8.3, voteCount: 443 }),
  },
  {
    id: 'B',
    label: 'IMDb and TMDB available',
    intent: 'Two counted sources, meaningful volume.',
    meta: meta({ title: 'B — IMDb + TMDB', voteAverage: 7.8, voteCount: 5100, imdbRating: 8.1 }),
  },
  {
    id: 'C',
    label: 'Rotten Tomatoes critics and audience',
    intent: 'Two editorial aggregates, no vote volume reported anywhere.',
    meta: meta({ title: 'C — RT critics + audience', rottenTomatoes: 91, rtAudience: 84 }),
  },
  {
    id: 'D',
    label: 'Multiple rating providers',
    intent: 'Full coverage — every counted source plus context-only feeds.',
    meta: meta({
      title: 'D — Everything',
      voteAverage: 8.1,
      voteCount: 12400,
      imdbRating: 8.4,
      rottenTomatoes: 94,
      rtAudience: 89,
      metascore: 81,
      metacriticUser: 8.2,
      trakt: 86,
      letterboxd: 4.1,
      rogerEbert: 3.5,
    }),
  },
  {
    id: 'E',
    label: 'No external rating source',
    intent: 'Nothing at all — the score must be qualified, not presented as measured.',
    meta: meta({ title: 'E — No ratings anywhere', popularity: null }),
  },
  {
    id: 'F',
    label: 'Very low vote volume',
    intent: 'A single thin source must not read as confident.',
    meta: meta({ title: 'F — Thin votes', voteAverage: 9.4, voteCount: 7 }),
  },
  {
    id: 'G',
    label: 'Very high vote volume',
    intent: 'Large counts must format cleanly and not overflow.',
    meta: meta({ title: 'G — Huge volume', voteAverage: 8.7, voteCount: 2_847_193 }),
  },
  {
    id: 'H',
    label: 'Missing critics, strong audience',
    intent: 'Audience-only evidence must never imply a critic score exists.',
    meta: meta({ title: 'H — Audience only', voteAverage: 8.0, voteCount: 41_000, rtAudience: 88 }),
  },
  {
    id: 'I',
    label: 'Missing audience, critics available',
    intent: 'Critic-only evidence — the audience bar sits at a neutral baseline.',
    meta: meta({ title: 'I — Critics only', rottenTomatoes: 88, metascore: 76 }),
  },
  {
    id: 'J',
    label: 'Long localized labels',
    intent: 'Long title, long genres, TV shape — no clipping or overflow.',
    meta: meta({
      title:
        'J — Une très longue série télévisée internationale dont le titre ne rentre pas sur une seule ligne',
      mediaType: 'tv',
      runtimeMinutes: null,
      episodeRuntimeMinutes: 62,
      numberOfSeasons: 4,
      status: 'Canceled',
      genres: ['Drame psychologique', 'Thriller international', 'Science-fiction spéculative'],
      voteAverage: 7.4,
      voteCount: 1_284,
      imdbRating: 7.6,
      originalLanguage: 'fr',
      englishAvailability: 'subtitles',
    }),
  },
];

export const scenarioById = (id: string): Scenario | undefined =>
  SCENARIOS.find((s) => s.id.toLowerCase() === id.toLowerCase());
