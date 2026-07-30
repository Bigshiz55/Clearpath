/**
 * DETERMINISTIC SYNTHETIC CATALOG (pure, no I/O).
 *
 * THIS IS NOT REAL CATALOG DATA. It is shaped like a catalog — genre and cast
 * cardinality, franchise clustering, availability spread, metadata holes — so
 * that stage counts, query cost and ranking behaviour are measured against
 * something with realistic structure. No claim about recommendation QUALITY can
 * be made from it, because the vectors are fixtures and the titles are strings.
 *
 * Everything derives from a fixed seed, so a failing test at 50,000 titles can
 * be reproduced exactly.
 *
 * The generator deliberately injects the cases that break naive pipelines:
 * exact duplicates, near-duplicates, remakes, sequels, franchise clusters,
 * missing metadata, stale availability, conflicting metadata, tied scores,
 * sparse and obscure titles, blockbusters, unavailable titles, and titles that
 * violate every hard constraint.
 */

import { FixtureEmbeddingProvider, type EmbeddingVector } from './embedding';
import type { Genre } from './intent';

export const SYNTH_VERSION = 'synth-1';

export interface SynthTitle {
  id: string;
  mediaType: 'movie' | 'tv';
  title: string;
  alternateTitles: string[];
  releaseYear: number | null;
  runtimeMinutes: number | null;
  originalLanguage: string;
  contentRating: string | null;
  genres: Genre[];
  subgenres: string[];
  keywords: string[];
  director: string | null;
  leadPerformers: string[];
  cast: string[];
  franchise: string | null;
  sequenceOrder: number | null;
  /** Set when this title is a remake/sequel of another id. */
  remakeOf: string | null;
  sequelOf: string | null;
  synopsis: string;
  // Experience features, 0..1. NULL means UNKNOWN — never coerced to 0.
  features: Partial<Record<FeatureKey, number>>;
  /** Narrative booleans; undefined means unknown. */
  femaleLead?: boolean;
  criticScore: number | null;
  audienceScore: number | null;
  popularity: number;
  voteCount: number;
  metadataConfidence: number;
  availability: SynthAvailability[];
  /** Deterministic fixture vector. NOT semantic. */
  vector: EmbeddingVector;
  /** Which difficult-case bucket this row was generated for. */
  tags: SynthTag[];
}

export type FeatureKey =
  | 'pacing' | 'dialogueDensity' | 'actionIntensity' | 'suspense' | 'horror'
  | 'violence' | 'gore' | 'romance' | 'humor' | 'complexity'
  | 'emotionalHeaviness' | 'familySuitability' | 'endingTone'
  | 'endingSatisfaction' | 'mainstream' | 'productionScale';

export interface SynthAvailability {
  provider: string;
  monetization: 'flatrate' | 'free' | 'ads' | 'rent' | 'buy';
  region: string;
  /** Days ago it was last verified. >14 counts as stale. */
  verifiedDaysAgo: number;
  confidence: number;
}

export type SynthTag =
  | 'normal' | 'duplicate' | 'near_duplicate' | 'remake' | 'sequel'
  | 'franchise' | 'missing_metadata' | 'stale_availability' | 'conflicting'
  | 'tied_score' | 'sparse' | 'obscure' | 'blockbuster' | 'unavailable'
  | 'violates_runtime' | 'violates_language' | 'violates_rating';

const GENRE_POOL: Genre[] = [
  'action', 'adventure', 'animation', 'comedy', 'crime', 'documentary', 'drama',
  'family', 'fantasy', 'history', 'horror', 'music', 'mystery', 'romance',
  'science_fiction', 'thriller', 'war', 'western',
];
const LANGS = ['en', 'en', 'en', 'en', 'en', 'en', 'fr', 'es', 'ja', 'ko', 'de'];
const RATINGS = ['G', 'PG', 'PG-13', 'PG-13', 'R', 'R', 'NC-17'];
const PROVIDERS = ['netflix', 'hulu', 'max', 'prime_video', 'disney_plus', 'apple_tv_plus', 'peacock', 'paramount_plus'];
const FEATURE_KEYS: FeatureKey[] = [
  'pacing', 'dialogueDensity', 'actionIntensity', 'suspense', 'horror',
  'violence', 'gore', 'romance', 'humor', 'complexity',
  'emotionalHeaviness', 'familySuitability', 'endingTone',
  'endingSatisfaction', 'mainstream', 'productionScale',
];

/** Deterministic PRNG — mulberry32, seeded per-title so order never matters. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export interface SynthOptions {
  count: number;
  seed?: string;
  /** Share of rows reserved for each difficult case. Defaults are realistic. */
  difficultShare?: number;
}

/**
 * Generate `count` titles deterministically. The same (count, seed) always
 * yields byte-identical output, so tests and benchmarks are reproducible.
 */
export function generateCatalog(opts: SynthOptions): SynthTitle[] {
  const { count, seed = 'wv-synth-v1' } = opts;
  const difficult = opts.difficultShare ?? 0.18;
  const embedder = new FixtureEmbeddingProvider(`${seed}:vec`);
  const out: SynthTitle[] = [];

  for (let i = 1; i <= count; i++) {
    const r = rng(hashSeed(`${seed}:${i}`));
    const tags: SynthTag[] = [];

    // Which difficult bucket, if any. Deterministic by index so the mix is
    // identical for a given (count, seed).
    //
    // `kind` MUST come from a different function than the selector: deriving
    // both from `i % n` would make them share divisors, and only the cases
    // congruent to the selector would ever fire (the first version of this
    // generated exactly 2 of the 12 cases).
    const stride = Math.max(2, Math.round(1 / difficult));
    const isDifficult = i % stride === 0;
    const kind = isDifficult ? Math.floor(i / stride) % 12 : -1;

    const mediaType: 'movie' | 'tv' = i % 4 === 0 ? 'tv' : 'movie';
    const primary = GENRE_POOL[i % GENRE_POOL.length]!;
    const genres: Genre[] = [primary];
    if (r() > 0.4) genres.push(GENRE_POOL[(i * 7) % GENRE_POOL.length]!);
    if (r() > 0.8) genres.push(GENRE_POOL[(i * 13) % GENRE_POOL.length]!);

    let runtime: number | null = mediaType === 'movie' ? 75 + Math.floor(r() * 95) : 22 + Math.floor(r() * 40);
    let language = LANGS[i % LANGS.length]!;
    let rating: string | null = RATINGS[i % RATINGS.length]!;
    let year: number | null = 1960 + (i % 66);
    let popularity = Math.max(0, 1000 - i * (1000 / count)) + r() * 5;
    let audience: number | null = 4.5 + r() * 5.5;
    let critic: number | null = 4 + r() * 6;
    let voteCount = 10 + Math.floor(r() * 9000);
    let metaConf = 0.85 + r() * 0.15;
    let franchise: string | null = i % 5 === 0 ? `franchise_${i % Math.max(1, Math.floor(count / 33))}` : null;
    let sequenceOrder: number | null = franchise ? 1 + (i % 4) : null;
    let remakeOf: string | null = null;
    let sequelOf: string | null = null;
    let features: Partial<Record<FeatureKey, number>> = {};
    let availability: SynthAvailability[] = [];
    let titleText = `Title ${i} ${primary}`;
    let altTitles: string[] = [];

    for (const k of FEATURE_KEYS) features[k] = Math.round(r() * 100) / 100;

    // Availability: ~72% have at least one service.
    if (r() < 0.72) {
      availability.push({
        provider: PROVIDERS[i % PROVIDERS.length]!,
        monetization: (['flatrate', 'flatrate', 'flatrate', 'ads', 'rent'] as const)[i % 5]!,
        region: 'US',
        verifiedDaysAgo: Math.floor(r() * 10),
        confidence: 0.8 + r() * 0.2,
      });
      if (r() < 0.35) {
        availability.push({
          provider: PROVIDERS[(i + 3) % PROVIDERS.length]!,
          monetization: 'flatrate', region: 'US',
          verifiedDaysAgo: Math.floor(r() * 8), confidence: 0.85,
        });
      }
    }

    // ---- Difficult cases, each one a real failure mode ----
    switch (kind) {
      case 0: // EXACT DUPLICATE of an earlier title (different id, same content)
        if (out.length > 0) {
          const src = out[Math.floor(r() * out.length)]!;
          titleText = src.title;
          altTitles = [...src.alternateTitles];
          year = src.releaseYear; runtime = src.runtimeMinutes;
          features = { ...src.features };
          tags.push('duplicate');
        }
        break;
      case 1: // NEAR-DUPLICATE: same title, one year apart, near-identical features
        if (out.length > 0) {
          const src = out[Math.floor(r() * out.length)]!;
          titleText = src.title;
          year = (src.releaseYear ?? 2000) + 1;
          features = Object.fromEntries(
            Object.entries(src.features).map(([k, v]) => [k, Math.min(1, (v ?? 0) + 0.02)]),
          ) as Partial<Record<FeatureKey, number>>;
          tags.push('near_duplicate');
        }
        break;
      case 2: // REMAKE of an older title
        if (out.length > 0) {
          const src = out[Math.floor(r() * out.length)]!;
          titleText = `${src.title} (${1990 + (i % 35)})`;
          remakeOf = src.id;
          tags.push('remake');
        }
        break;
      case 3: // SEQUEL inside a franchise
        franchise = franchise ?? `franchise_${i % Math.max(1, Math.floor(count / 33))}`;
        sequenceOrder = 2 + (i % 3);
        titleText = `Title ${i} ${primary} Part ${sequenceOrder}`;
        if (out.length > 0) sequelOf = out[out.length - 1]!.id;
        tags.push('sequel', 'franchise');
        break;
      case 4: // MISSING METADATA — runtime, year and scores unknown
        runtime = null; year = null; critic = null; audience = null;
        metaConf = 0.35;
        features = {}; // no feature row at all
        tags.push('missing_metadata', 'sparse');
        break;
      case 5: // STALE AVAILABILITY — claims a service, last checked 40+ days ago
        availability = [{
          provider: PROVIDERS[i % PROVIDERS.length]!, monetization: 'flatrate',
          region: 'US', verifiedDaysAgo: 40 + Math.floor(r() * 60), confidence: 0.3,
        }];
        tags.push('stale_availability');
        break;
      case 6: // CONFLICTING METADATA — critics love it, audience hates it
        critic = 9.2; audience = 3.1; metaConf = 0.5;
        tags.push('conflicting');
        break;
      case 7: // TIED SCORES — identical popularity and ratings, to test tie-breaks
        popularity = 500; audience = 7.5; critic = 7.5; voteCount = 1000;
        tags.push('tied_score');
        break;
      case 8: // OBSCURE — good but almost no votes
        voteCount = 3; popularity = 0.4; audience = 8.1;
        features.mainstream = 0.05;
        tags.push('obscure');
        break;
      case 9: // BLOCKBUSTER — enormous popularity, middling quality
        popularity = 9500 + r() * 500; voteCount = 40000; audience = 6.6;
        features.mainstream = 0.98;
        tags.push('blockbuster');
        break;
      case 10: // UNAVAILABLE anywhere
        availability = [];
        tags.push('unavailable');
        break;
      case 11: // VIOLATES hard constraints — long, foreign, adult-rated
        runtime = 210 + Math.floor(r() * 60);
        language = 'ja';
        rating = 'NC-17';
        tags.push('violates_runtime', 'violates_language', 'violates_rating');
        break;
    }
    if (tags.length === 0) tags.push('normal');
    if (franchise && !tags.includes('franchise')) tags.push('franchise');

    const synopsis =
      `A ${primary} story about kw_${i % 400} and kw_${(i * 3) % 400}. ` +
      `Set in ${1900 + (i % 120)}.`;

    out.push({
      id: `${mediaType}-${i}`,
      mediaType,
      title: titleText,
      alternateTitles: altTitles.length ? altTitles : (i % 7 === 0 ? [`Alt Title ${i}`] : []),
      releaseYear: year,
      runtimeMinutes: runtime,
      originalLanguage: language,
      contentRating: rating,
      genres,
      subgenres: [`sub_${i % 60}`],
      keywords: [0, 1, 2, 3, 4].map((k) => `kw_${(i * (k + 1)) % 400}`),
      director: `person_${i % 1200}`,
      leadPerformers: [`person_${(i * 7) % 1150}`, `person_${(i * 7 + 1) % 1150}`],
      cast: Array.from({ length: 6 }, (_, k) => `person_${(i * 7 + k) % 1150}`),
      franchise,
      sequenceOrder,
      remakeOf,
      sequelOf,
      synopsis,
      features,
      femaleLead: i % 3 === 0 ? true : i % 3 === 1 ? false : undefined,
      criticScore: critic == null ? null : Math.round(critic * 10) / 10,
      audienceScore: audience == null ? null : Math.round(audience * 10) / 10,
      popularity: Math.round(popularity * 100) / 100,
      voteCount,
      metadataConfidence: Math.round(metaConf * 100) / 100,
      availability,
      vector: embedder.vectorFor(`${titleText} ${synopsis}`),
      tags,
    });
  }
  return out;
}

/** Summary used by the diagnostic screen and by tests, so the mix is visible. */
export function catalogSummary(titles: SynthTitle[]): Record<string, number> {
  const counts: Record<string, number> = { total: titles.length };
  for (const t of titles) for (const tag of t.tags) counts[tag] = (counts[tag] ?? 0) + 1;
  counts.withAvailability = titles.filter((t) => t.availability.length > 0).length;
  counts.staleOnly = titles.filter(
    (t) => t.availability.length > 0 && t.availability.every((a) => a.verifiedDaysAgo > 14),
  ).length;
  counts.noFeatures = titles.filter((t) => Object.keys(t.features).length === 0).length;
  return counts;
}
