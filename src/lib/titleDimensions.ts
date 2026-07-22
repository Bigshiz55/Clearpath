import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTitle } from '@/lib/tmdb/client';
import {
  DIMENSIONS,
  DIMENSION_KEYS,
  isValidDimensions,
  buildProfile,
  applyOverrides,
  emptyAccumulator,
  accumulate,
  finalizeProfile,
  type TitleDimensions,
  type DimensionProfile,
  type DimensionOverrides,
} from '@/lib/scoring/dimensions';
import type { MediaType, TitleMetadata } from '@/lib/types';

/**
 * The AI content-fingerprint layer. Classifies each title ONCE across the 18
 * interpretable taste axes (gpt-4o-mini), stores it in `title_dimensions`, and
 * builds a per-user preference profile from the fingerprints of titles they've
 * rated. Everything degrades to null/neutral on any failure — this only ever
 * *enriches* the deterministic result, never blocks it.
 */

const MODEL = 'gpt-4o-mini';

/** Max titles to classify on-demand per profile build (bounds cost; the rest fill in on later builds). */
const BACKFILL_CAP = 12;

const SYSTEM_PROMPT =
  `You are a film & TV taste analyst. Score the title on each axis from 0 to 100 using its genres, keywords, and synopsis. ` +
  `Return ONLY a JSON object with these integer keys (0-100):\n` +
  DIMENSIONS.map((d) => `- ${d.key}: 0 = ${d.low}, 100 = ${d.high}`).join('\n') +
  `\nBe decisive and use the full range. No prose, JSON only.`;

function coerceDims(raw: unknown): TitleDimensions | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const out: TitleDimensions = {};
  for (const k of DIMENSION_KEYS) {
    const n = typeof src[k] === 'number' ? (src[k] as number) : Number(src[k]);
    if (!Number.isFinite(n)) return null;
    out[k] = Math.max(0, Math.min(100, Math.round(n)));
  }
  return out;
}

async function classify(meta: TitleMetadata): Promise<TitleDimensions | null> {
  const key = serverEnv.openaiKey();
  if (!key) return null;
  const payload = {
    title: meta.title,
    year: meta.year,
    type: meta.mediaType === 'tv' ? 'TV series' : 'movie',
    genres: meta.genres.slice(0, 8),
    keywords: meta.keywords.slice(0, 20),
    overview: (meta.overview || '').slice(0, 900),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        max_tokens: 320,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? 'null') as unknown;
    return coerceDims(parsed);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * A title's fingerprint — from the cache table, else classified once and stored.
 * Returns null when there's no OpenAI key, the table is missing, or classify
 * fails, so callers must treat it as optional.
 */
export async function getTitleDimensions(meta: TitleMetadata): Promise<TitleDimensions | null> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }
  try {
    const { data } = await admin
      .from('title_dimensions')
      .select('dims')
      .eq('tmdb_id', meta.id)
      .eq('media_type', meta.mediaType)
      .maybeSingle();
    if (data && isValidDimensions(data.dims)) return data.dims as TitleDimensions;
  } catch {
    return null; // table missing (migration not applied) → feature dormant
  }

  const dims = await classify(meta);
  if (!dims) return null;
  try {
    await admin
      .from('title_dimensions')
      .upsert({ tmdb_id: meta.id, media_type: meta.mediaType, dims, model: MODEL }, { onConflict: 'tmdb_id,media_type' });
  } catch {
    /* best effort — still return the fresh classification */
  }
  return dims;
}

/** Read a cached fingerprint only (never classifies) — for building profiles cheaply. */
async function getCachedDimsBatch(
  admin: ReturnType<typeof createAdminClient>,
  keys: { tmdb_id: number; media_type: MediaType }[],
): Promise<Map<string, TitleDimensions>> {
  const out = new Map<string, TitleDimensions>();
  if (keys.length === 0) return out;
  try {
    const ids = Array.from(new Set(keys.map((k) => k.tmdb_id)));
    const { data } = await admin.from('title_dimensions').select('tmdb_id, media_type, dims').in('tmdb_id', ids);
    for (const row of data ?? []) {
      if (isValidDimensions(row.dims)) out.set(`${row.media_type}-${row.tmdb_id}`, row.dims as TitleDimensions);
    }
  } catch {
    /* table missing → empty */
  }
  return out;
}

/** Read cached fingerprints for a set of titles (never classifies). Empty on any miss. */
export async function getCachedDimensions(
  keys: { tmdb_id: number; media_type: MediaType }[],
): Promise<Map<string, TitleDimensions>> {
  try {
    return await getCachedDimsBatch(createAdminClient(), keys);
  } catch {
    return new Map();
  }
}

/** Read the user's manual dial corrections (guarded — table missing = none). */
async function getOverrides(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<DimensionOverrides> {
  try {
    const { data } = await admin
      .from('dimension_overrides')
      .select('dimension_key, pref, is_limit')
      .eq('user_id', userId);
    const out: DimensionOverrides = {};
    for (const row of data ?? []) {
      if (typeof row.pref === 'number') out[row.dimension_key as string] = { pref: row.pref, isLimit: !!row.is_limit };
    }
    return out;
  } catch {
    return {}; // table missing (migration 0018 not applied) → no corrections
  }
}

async function computeUserProfile(userId: string): Promise<DimensionProfile> {
  const empty = buildProfile([]);
  if (!userId) return empty;
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return empty;
  }
  try {
  // Rated titles the user has actually judged (quiz, feedback, manual ratings).
  const { data: rated } = await admin
    .from('watchlist_items')
    .select('tmdb_id, media_type, rating')
    .eq('user_id', userId)
    .not('rating', 'is', null)
    .limit(400);
  const rows = (rated ?? []).filter((r) => typeof r.rating === 'number') as {
    tmdb_id: number;
    media_type: MediaType;
    rating: number;
  }[];

  const overrides = await getOverrides(admin, userId);
  const hasOverrides = Object.keys(overrides).length > 0;

  // Targeted axis nudges from pass reasons (dormant until migration 0021).
  let signals: DimensionSignalRow[] = [];
  try {
    const { data } = await admin.from('dimension_signals').select('dimension_key, w_sum, wv_sum').eq('user_id', userId);
    signals = (data ?? []) as DimensionSignalRow[];
  } catch {
    signals = [];
  }

  // Total feedback interactions — cosmetic only, so every pass/reason/quick-action
  // shows a visible bump in the motivational DNA-strength number (never touches
  // matching). Dormant/0 until migration 0020's events table exists.
  const engagement = await countEngagement(admin, userId);

  const finish = (base: DimensionProfile): DimensionProfile =>
    hasOverrides ? { ...applyOverrides(base, overrides), engagement } : { ...base, engagement };

  if (rows.length === 0) {
    if (signals.length === 0) return finish(empty);
    const acc = emptyAccumulator();
    foldSignals(acc, signals);
    return finish(finalizeProfile(acc));
  }

  const dimsByKey = await getCachedDimsBatch(admin, rows);

  // Backfill: titles with no valid (current-vocabulary) fingerprint yet — classify
  // a bounded few per build so a user's DNA repopulates quickly after an axis-set
  // change, instead of thinning until each title is re-viewed elsewhere. Cached
  // globally once classified, so this cost is paid at most once per title.
  const missing = rows.filter((r) => !dimsByKey.has(`${r.media_type}-${r.tmdb_id}`)).slice(0, BACKFILL_CAP);
  if (missing.length > 0) {
    const filled = await Promise.all(
      missing.map(async (r) => {
        try {
          const meta = await getTitle(r.media_type, r.tmdb_id);
          const dims = await getTitleDimensions(meta);
          return dims ? ([`${r.media_type}-${r.tmdb_id}`, dims] as const) : null;
        } catch {
          return null;
        }
      }),
    );
    for (const f of filled) if (f) dimsByKey.set(f[0], f[1]);
  }

  const pairs = rows
    .map((r) => {
      const dims = dimsByKey.get(`${r.media_type}-${r.tmdb_id}`);
      return dims ? { dims, rating: r.rating } : null;
    })
    .filter((x): x is { dims: TitleDimensions; rating: number } => x !== null);

  // Learned profile from rated titles + the targeted reason nudges, folded into
  // one accumulator so both count as weighted evidence on their axes.
  const acc = emptyAccumulator();
  for (const p of pairs) accumulate(acc, p.dims, p.rating);
  foldSignals(acc, signals);
  return finish(finalizeProfile(acc));
  } catch {
    // A profile-build failure must never take down a page render (esp. during a
    // server action's revalidation re-render) — degrade to the neutral profile.
    return empty;
  }
}

interface DimensionSignalRow {
  dimension_key: string;
  w_sum: number;
  wv_sum: number;
}

/** Count a user's logged feedback interactions (cosmetic DNA-strength input only).
 *  Guarded: if the events table is missing (migration 0020 not applied) → 0. */
async function countEngagement(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<number> {
  try {
    const { count } = await admin
      .from('recommendation_feedback_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    return typeof count === 'number' && count > 0 ? count : 0;
  } catch {
    return 0;
  }
}

/** Fold reason-derived axis signals into a profile accumulator as extra evidence. */
function foldSignals(
  acc: { wSum: Record<string, number>; wvSum: Record<string, number> },
  signals: DimensionSignalRow[],
): void {
  for (const s of signals) {
    if (!DIMENSION_KEYS.includes(s.dimension_key)) continue;
    if (typeof s.w_sum === 'number' && Number.isFinite(s.w_sum)) {
      acc.wSum[s.dimension_key] = (acc.wSum[s.dimension_key] ?? 0) + s.w_sum;
    }
    if (typeof s.wv_sum === 'number' && Number.isFinite(s.wv_sum)) {
      acc.wvSum[s.dimension_key] = (acc.wvSum[s.dimension_key] ?? 0) + s.wv_sum;
    }
  }
}

/**
 * The user's content-dimension preference profile, cached 6h and keyed by how
 * many titles they've rated (so it refreshes as they rate more).
 */
export function getUserDimensionProfile(
  _supabase: SupabaseClient,
  userId: string,
  sampleSize: number,
): Promise<DimensionProfile> {
  if (!userId) return Promise.resolve(buildProfile([]));
  return unstable_cache(() => computeUserProfile(userId), ['dim-profile', userId, String(sampleSize)], {
    revalidate: 60 * 60 * 6,
    tags: [`dim-profile:${userId}`],
  })();
}
