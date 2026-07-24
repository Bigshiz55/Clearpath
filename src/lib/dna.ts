import 'server-only';
import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType, TitleMetadata } from '@/lib/types';
import { embed } from '@/lib/embeddings';
import { getScoringData } from '@/lib/titleData';
import { computeGeneralScore } from '@/lib/scoring/general';
import { buildTasteDna, dnaScore, type TasteDna, type DnaResult } from '@/lib/scoring/dna';
import { aiAdjustScore, type AiAdjustment } from '@/lib/aiAdjust';
import { isPro } from '@/lib/pro';
import { getUserDimensionProfile, getCachedDimensions, getTitleDimensions } from '@/lib/titleDimensions';
import { dimensionMatch, matchHighlights } from '@/lib/scoring/dimensions';
import { rerankNudge } from '@/lib/scoring/reranker';
import { RERANK_MODEL } from '@/lib/scoring/rerankerWeights';
import { loadPreference } from '@/lib/preference/store';
import { preferenceNudge, hasPreferenceSignal } from '@/lib/preference/rank';

/** TMDB genre names → the slug vocabulary the preference model stores. */
function genreSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// Content-fingerprint ranking nudge bounds — how far a perfect/terrible content
// match can move a title's rank score (±8), and the slope from match delta.
const DIM_NUDGE_MAX = 8;
const DIM_NUDGE_SLOPE = 0.16;

/** The text we embed for a title's "vibe vector" — its meaning, not its tags. */
function vibeText(meta: TitleMetadata): string {
  return [
    `${meta.title}${meta.year ? ` (${meta.year})` : ''}`,
    meta.genres?.length ? meta.genres.join(', ') : '',
    meta.overview ?? '',
    meta.keywords?.length ? `Themes: ${meta.keywords.slice(0, 14).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('. ');
}

async function computeTitleVector(mediaType: MediaType, id: number): Promise<number[] | null> {
  try {
    const { meta } = await getScoringData(mediaType, id, 'US');
    return await embed(vibeText(meta));
  } catch {
    return null;
  }
}

/** A title's vibe vector, cached 30 days (a title's meaning doesn't change). */
export function getTitleVector(mediaType: MediaType, id: number): Promise<number[] | null> {
  return unstable_cache(() => computeTitleVector(mediaType, id), ['dna-vec', mediaType, String(id)], {
    revalidate: 60 * 60 * 24 * 30,
    tags: [`dna:${mediaType}:${id}`],
  })();
}

async function computeTasteDna(rated: Array<{ media_type: MediaType; tmdb_id: number; rating: number }>): Promise<TasteDna> {
  const withVecs = await Promise.all(
    rated.map(async (r) => {
      const vector = await getTitleVector(r.media_type, r.tmdb_id);
      return vector ? { vector, rating: r.rating } : null;
    }),
  );
  return buildTasteDna(withVecs.filter((x): x is { vector: number[]; rating: number } => x != null));
}

const EMPTY_DNA: TasteDna = { liked: null, disliked: null, sampleSize: 0 };

/**
 * A user's Taste-DNA — built from the titles they've rated (strongest opinions
 * first, capped for cost). Cached per user + a signature that busts when they
 * rate more, so it refreshes as they use the app.
 */
export async function getUserTasteDna(supabase: SupabaseClient, userId: string): Promise<TasteDna> {
  if (!userId) return EMPTY_DNA;
  const { data } = await supabase
    .from('watchlist_items')
    .select('tmdb_id, media_type, rating')
    .eq('user_id', userId)
    .not('rating', 'is', null)
    .order('rating', { ascending: false })
    .limit(80);
  const rated = (data ?? [])
    .filter((r) => r.rating != null)
    .map((r) => ({ media_type: (r.media_type === 'tv' ? 'tv' : 'movie') as MediaType, tmdb_id: r.tmdb_id as number, rating: r.rating as number }));
  if (rated.length === 0) return EMPTY_DNA;
  const sig = String(rated.length);
  return unstable_cache(() => computeTasteDna(rated), ['dna-taste', userId, sig], {
    revalidate: 60 * 60 * 6,
  })();
}

export interface UserDnaResult extends DnaResult {
  available: boolean; // whether we had a title vibe vector (needs OPENAI key)
  sampleSize: number; // rated titles feeding the model
  baseScore?: number; // the deterministic blend before any AI adjustment
  adjustment?: number | null; // the bounded AI nudge applied (null when no AI ran)
  reasoning?: string | null; // one-sentence AI rationale for the nudge
}

/**
 * A short, human-readable summary of the user's taste — the titles they've rated
 * highest and lowest — so the AI adjustment layer can reason about franchise
 * fatigue, format fit, etc. ("loves tight limited series", "avoids long
 * procedurals"). Real data only; empty string when there's nothing to say.
 */
async function getTasteProfileText(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from('watchlist_items')
    .select('title, year, rating')
    .eq('user_id', userId)
    .not('rating', 'is', null)
    .order('rating', { ascending: false })
    .limit(60);
  const rows = (data ?? []) as Array<{ title: string; year: number | null; rating: number }>;
  if (rows.length === 0) return '';
  const fmt = (r: { title: string; year: number | null }) => (r.year ? `${r.title} (${r.year})` : r.title);
  const loves = rows.filter((r) => r.rating >= 8).slice(0, 8).map(fmt);
  const likes = rows.filter((r) => r.rating >= 6 && r.rating < 8).slice(0, 4).map(fmt);
  const pans = rows.filter((r) => r.rating <= 4).slice(-6).map(fmt);
  const parts: string[] = [];
  if (loves.length) parts.push(`Rates highest (loves): ${loves.join(', ')}.`);
  if (likes.length) parts.push(`Also likes: ${likes.join(', ')}.`);
  if (pans.length) parts.push(`Rates lowest (avoids): ${pans.join(', ')}.`);
  return parts.join(' ');
}

/**
 * The bounded AI adjustment for one (user, title), cached 12h. Keyed by sample
 * size so it refreshes as the user rates more. Null when the AI layer is off,
 * fails, or has no key — the caller then keeps the deterministic score.
 */
async function getCachedAiAdjustment(
  userId: string,
  mediaType: MediaType,
  id: number,
  sampleSize: number,
  input: Parameters<typeof aiAdjustScore>[0],
): Promise<AiAdjustment | null> {
  return unstable_cache(() => aiAdjustScore(input), ['dna-ai', userId, mediaType, String(id), String(sampleSize)], {
    revalidate: 60 * 60 * 12,
    tags: [`dna-ai:${userId}:${mediaType}:${id}`],
  })();
}

/**
 * Rank a candidate pool by how well each fits the user's Taste-DNA (best first).
 * `personalized` is false when there's no taste data yet (or no key), in which
 * case the original order is preserved. Bounded — embeds at most `cap` titles.
 */
export async function rankByDna<T extends { mediaType: MediaType; id: number }>(
  supabase: SupabaseClient,
  userId: string,
  items: T[],
  cap = 24,
): Promise<{ items: Array<T & { dnaFit: number | null }>; personalized: boolean }> {
  const pool = items.slice(0, cap);
  const now = Date.now();
  // Load the embedding Taste-DNA AND the three-channel preference DNA (THE DNA
  // CASE) in parallel. The preference read is one indexed query, cost-safe, and
  // degrades to empty when the table/keys are absent.
  const [dna, pref] = await Promise.all([
    userId ? getUserTasteDna(supabase, userId) : Promise.resolve(EMPTY_DNA),
    userId ? loadPreference(supabase, userId, now) : Promise.resolve(null),
  ]);
  const hasPref = pref != null && hasPreferenceSignal(pref.dna);
  // Nothing to personalize with → preserve the incoming order (unchanged behavior).
  if (!dna.liked && !hasPref) {
    return { items: pool.map((i) => ({ ...i, dnaFit: null })), personalized: false };
  }

  // Content-fingerprint personalization (bounded, deterministic, cache-only):
  // nudge the ranking toward titles whose AI content DNA matches the axes this
  // user keeps rating highly. No-op unless BOTH the user's dimension profile and
  // a title's cached fingerprint exist, so the deterministic Watchability score
  // stays authoritative and the nudge only re-orders within ±DIM_NUDGE_MAX.
  const [dimProfile, dimsMap] = await Promise.all([
    getUserDimensionProfile(supabase, userId, dna.sampleSize),
    getCachedDimensions(pool.map((i) => ({ tmdb_id: i.id, media_type: i.mediaType }))),
  ]);
  const useDims = dimProfile.samples > 0;

  // Rank by the full Watchability score — the user's DNA blended with the
  // objective ratings (the same 0–100 shown at the top of every card), so the
  // order on screen matches the number the user sees. The preference nudge (THE
  // DNA CASE) is a further bounded ±PREF_NUDGE_MAX term on top.
  const scored = await Promise.all(
    pool.map(async (i) => {
      // ZERO AI when there's no embedding Taste-DNA: the preference path needs
      // only cached dims + metadata, never an embedding.
      const [data, vector] = await Promise.all([
        getScoringData(i.mediaType, i.id, 'US').catch(() => null),
        dna.liked ? getTitleVector(i.mediaType, i.id) : Promise.resolve(null),
      ]);
      if (!data) return { ...i, dnaFit: null };
      const general = computeGeneralScore(data.meta, data.providers);
      const objective = general.standardScore ?? general.score;
      const base = dna.liked && vector ? dnaScore(vector, dna, objective).score : objective;

      const dims = dimsMap.get(`${i.mediaType}-${i.id}`);
      const match = useDims && dims ? dimensionMatch(dims, dimProfile) : null;
      // Heuristic dimension nudge + the learned re-ranker nudge (a no-op until a
      // model is promoted into rerankerWeights.ts). Both bounded.
      const dimN = match != null ? Math.max(-DIM_NUDGE_MAX, Math.min(DIM_NUDGE_MAX, (match - 50) * DIM_NUDGE_SLOPE)) : 0;
      const rerankN = match != null ? rerankNudge(objective, match, RERANK_MODEL) : 0;
      // The three-channel preference nudge (bounded, no-op without evidence).
      const prefN = hasPref && dims
        ? preferenceNudge({ dims, genres: (data.meta.genres ?? []).map(genreSlug) }, pref!.dna, { corrections: pref!.corrections }).nudge
        : 0;
      return { ...i, dnaFit: clampScore(base + dimN + rerankN + prefN) };
    }),
  );
  const personalized = scored.some((s) => s.dnaFit != null);
  scored.sort((a, b) => (b.dnaFit ?? -Infinity) - (a.dnaFit ?? -Infinity));
  return { items: scored, personalized };
}

/**
 * A compact "content-fingerprint fit" line for the AI adjustment prompt: the
 * match score plus the axes this title agrees/clashes with. Best-effort —
 * returns undefined when the title isn't fingerprinted or the profile is empty.
 */
async function buildDimensionSummary(
  supabase: SupabaseClient,
  userId: string,
  mediaType: MediaType,
  id: number,
  sampleSize: number,
): Promise<string | undefined> {
  const data = await getScoringData(mediaType, id, 'US').catch(() => null);
  if (!data) return undefined;
  const dims = await getTitleDimensions(data.meta);
  if (!dims) return undefined;
  const profile = await getUserDimensionProfile(supabase, userId, sampleSize);
  if (profile.samples === 0) return undefined;
  const match = dimensionMatch(dims, profile);
  const { agree, clash } = matchHighlights(dims, profile);
  const parts = [`content match ${match}/100`];
  if (agree.length) parts.push(`matches: ${agree.map((a) => `${a.label} ${a.note}`).join(', ')}`);
  if (clash.length) parts.push(`clashes: ${clash.map((c) => `${c.label} (${c.note})`).join(', ')}`);
  return parts.join('; ');
}

/** Optional context for the (deep-view only) AI adjustment layer. */
export interface DnaTitleOptions {
  /** Run the bounded AI adjustment on top of the deterministic blend. Off by
   *  default — it's a per-title LLM call, reserved for the title page. */
  ai?: boolean;
  title?: string;
  year?: number | null;
  genres?: string[];
}

/** The DNA Score for one title, for one user. With `ai`, refines the
 *  deterministic blend by the bounded AI adjustment (falls back on any failure). */
export async function getUserDnaForTitle(
  supabase: SupabaseClient,
  userId: string,
  mediaType: MediaType,
  id: number,
  objectiveScore: number,
  opts: DnaTitleOptions = {},
): Promise<UserDnaResult> {
  const dna = await getUserTasteDna(supabase, userId);
  // No taste model yet → skip the (paid) title embed; fall back to objective.
  if (!dna.liked) {
    const score = clampScore(objectiveScore);
    return { score, confidence: 0, tasteScore: null, available: false, sampleSize: dna.sampleSize };
  }
  const titleVector = await getTitleVector(mediaType, id);
  const result = dnaScore(titleVector, dna, objectiveScore);
  const base: UserDnaResult = { ...result, available: titleVector != null, sampleSize: dna.sampleSize };

  // AI adjustment — deep view only, once we have taste data, and Pro-only (it's
  // a per-title LLM call and the headline Pro feature).
  if (!opts.ai || !titleVector) return base;
  if (!(await isPro(supabase, userId))) return base;
  const tasteProfile = await getTasteProfileText(supabase, userId);
  if (!tasteProfile) return base;

  // Content-fingerprint fit → a compact summary the AI can reason about (which
  // taste axes this title matches or clashes with). Best-effort; omitted on miss.
  const dimensionSummary = await buildDimensionSummary(supabase, userId, mediaType, id, dna.sampleSize).catch(() => undefined);

  const adj = await getCachedAiAdjustment(userId, mediaType, id, dna.sampleSize, {
    title: opts.title ?? '',
    year: opts.year ?? null,
    mediaType,
    genres: opts.genres ?? [],
    dnaScore: result.tasteScore ?? result.score,
    qualityScore: clampScore(objectiveScore),
    baseScore: result.score,
    tasteProfile,
    dimensionSummary,
  });
  if (!adj) return base;
  return {
    ...base,
    score: clampScore(result.score + adj.adjustment),
    baseScore: result.score,
    adjustment: adj.adjustment,
    reasoning: adj.reasoning,
  };
}
