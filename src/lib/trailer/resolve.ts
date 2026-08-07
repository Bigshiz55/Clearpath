/**
 * TRAILER RESOLVER — deterministic, confidence-ranked (pure core).
 *
 * The one rule that makes this trustworthy: we NEVER search YouTube for
 * "<title> trailer" and take the first hit. We ask TMDB for the videos it has
 * editorially attached to a SPECIFIC title id (`/movie/{id}/videos` or
 * `/tv/{id}/videos`). Because the input is a tmdbId — not a text query — the
 * title and year are correct by construction: "The Thing" (1982) and "The
 * Thing" (2011) are different ids and can never cross-contaminate, and a
 * reaction / review / "ending explained" / fan-edit upload simply is not in a
 * title's TMDB video list. This module's job is only to pick the BEST video
 * among that title's own videos, and to refuse rather than guess.
 *
 * Pure and side-effect-free: it takes an already-fetched video list plus the
 * viewer's language and returns the chosen trailer + confidence, or null. The
 * fetch + cache live in resolveTrailer.ts (server); the coordinator and player
 * live in the client. Keeping the ranking here makes the "never a fan trailer,
 * never the wrong year" guarantee unit-testable without a network.
 */

/** A raw TMDB video row (the fields we rank on). */
export interface TmdbVideo {
  key: string; // YouTube video id
  site: string; // 'YouTube' | 'Vimeo' | …
  type: string; // 'Trailer' | 'Teaser' | 'Clip' | 'Featurette' | …
  official: boolean;
  name: string;
  iso_639_1?: string | null; // language, e.g. 'en'
  iso_3166_1?: string | null; // country, e.g. 'US'
  published_at?: string | null;
  size?: number | null;
}

export type TrailerVideoType = 'trailer' | 'teaser';

export interface ResolvedTrailer {
  provider: 'youtube';
  videoId: string;
  source: 'tmdb';
  language: string | null;
  country: string | null;
  type: TrailerVideoType;
  official: boolean;
  /** 0–100. Below CONFIDENCE_FLOOR we return null (poster) rather than guess. */
  confidence: number;
  /** Whether this is safe to AUTOPLAY, vs. only offer as a manual play. Only
   *  official trailers/teasers on YouTube autoplay; everything else is manual. */
  autoplayEligible: boolean;
}

export interface ResolveOptions {
  /** The viewer's app language (ISO-639-1), e.g. 'en'. */
  preferredLanguage: string;
}

/** Below this we do not surface a trailer at all — poster wins. */
export const CONFIDENCE_FLOOR = 40;

// Only these YouTube-hosted types are ever eligible. A Clip / Featurette /
// "Behind the Scenes" / Bloopers is not a trailer and is never shown here.
const ELIGIBLE_TYPES: Record<string, TrailerVideoType> = {
  trailer: 'trailer',
  teaser: 'teaser',
};

function scoreVideo(v: TmdbVideo, preferredLanguage: string): number | null {
  if (v.site !== 'YouTube') return null; // only YouTube embeds are supported
  if (!v.key) return null;
  const kind = ELIGIBLE_TYPES[v.type?.trim().toLowerCase()];
  if (!kind) return null; // not a trailer/teaser → never substituted in

  let score = 0;
  // Type: a full trailer beats a teaser.
  score += kind === 'trailer' ? 55 : 42;
  // Official is the trust signal — TMDB's "official" flag marks a
  // studio/distributor/network upload. A non-official (fan) trailer is heavily
  // penalised and can only clear the floor as an unofficial, manual-only last
  // resort — never autoplayed.
  score += v.official ? 30 : -25;
  // Language: prefer the viewer's app language, then fall back.
  const lang = (v.iso_639_1 ?? '').toLowerCase();
  if (lang === preferredLanguage.toLowerCase()) score += 15;
  else if (lang === '' ) score += 4; // unknown language — mild, not disqualifying
  else score += 0; // a different language is allowed only if nothing better exists
  return score;
}

/**
 * Pick the single best trailer for a title, or null (→ show the poster).
 *
 * Deterministic ordering: score desc, then official first, then newer
 * published_at, then a stable key tiebreak — so the same title always resolves
 * to the same trailer.
 */
export function pickBestTrailer(videos: readonly TmdbVideo[], opts: ResolveOptions): ResolvedTrailer | null {
  const scored = videos
    .map((v) => ({ v, s: scoreVideo(v, opts.preferredLanguage) }))
    .filter((x): x is { v: TmdbVideo; s: number } => x.s != null);
  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    if (b.s !== a.s) return b.s - a.s;
    if (a.v.official !== b.v.official) return a.v.official ? -1 : 1;
    const at = Date.parse(a.v.published_at ?? '') || 0;
    const bt = Date.parse(b.v.published_at ?? '') || 0;
    if (bt !== at) return bt - at;
    return a.v.key < b.v.key ? -1 : 1;
  });

  const best = scored[0]!;
  const confidence = Math.max(0, Math.min(100, best.s));
  if (confidence < CONFIDENCE_FLOOR) return null;

  const kind = ELIGIBLE_TYPES[best.v.type.trim().toLowerCase()]!;
  return {
    provider: 'youtube',
    videoId: best.v.key,
    source: 'tmdb',
    language: best.v.iso_639_1 ?? null,
    country: best.v.iso_3166_1 ?? null,
    type: kind,
    official: best.v.official,
    confidence,
    // Only official trailers/teasers ever autoplay. An unofficial video that
    // still cleared the floor is offered as a manual play only.
    autoplayEligible: best.v.official === true,
  };
}
