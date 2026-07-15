'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { searchTitles, type SearchResultItem } from '@/lib/tmdb/client';
import type { SupabaseClient } from '@supabase/supabase-js';

// Per-call cap. The client chunks large histories (e.g. a 557-title Netflix
// export) into batches so each server call stays well under the function
// timeout; this bounds a single batch defensively.
const MAX_BATCH = 40;

export interface ImportRowResult {
  raw: string;
  status: 'imported' | 'skipped' | 'unmatched' | 'error';
  title?: string;
  year?: number | null;
  mediaType?: 'movie' | 'tv';
  rating?: number | null;
  message?: string;
}

export interface ImportSummary {
  ok: boolean;
  error?: string;
  imported: number;
  unmatched: number;
  rows: ImportRowResult[];
}

const itemSchema = z.object({
  title: z.string().min(1).max(300),
  rating: z.number().int().min(1).max(10).nullable(),
});

/** Choose the best TMDB candidate: exact title first, then year, then popularity. */
function pickMatch(
  results: SearchResultItem[],
  title: string,
): SearchResultItem | null {
  if (results.length === 0) return null;
  const lc = title.toLowerCase();
  const exact = results.filter((r) => r.title.toLowerCase() === lc);
  const pool = exact.length > 0 ? exact : results;
  // `results` is already sorted by popularity desc.
  return pool[0]!;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

async function getOrCreateDefaultWatchlist(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from('watchlists')
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created, error } = await supabase
    .from('watchlists')
    .insert({ user_id: userId, name: 'My Watchlist', is_default: true })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return created!.id as string;
}

function fail(error: string, rows: ImportRowResult[] = []): ImportSummary {
  return { ok: false, error, imported: 0, unmatched: 0, rows };
}

/**
 * Resolve one batch of parsed titles against TMDB and mark each watched (with an
 * optional rating). Returns a per-title result so the UI can show matched vs.
 * unmatched. The client parses/dedupes/normalizes and calls this per batch.
 */
export async function importParsedTitles(
  items: { title: string; rating: number | null }[],
): Promise<ImportSummary> {
  const parsed = z.array(itemSchema).max(MAX_BATCH).safeParse(items);
  if (!parsed.success) return fail('Invalid import batch.');
  const list = parsed.data;
  if (list.length === 0) return fail('Nothing to import in this batch.');

  let supabase: SupabaseClient;
  let userId: string;
  try {
    supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail('You need to be signed in.');
    userId = user.id;
  } catch {
    return fail('Could not verify your session. Please sign in again.');
  }

  const matched = await mapPool(list, 6, async (p) => {
    try {
      const results = await searchTitles(p.title);
      return { p, m: pickMatch(results, p.title), err: false };
    } catch {
      return { p, m: null, err: true };
    }
  });

  let watchlistId: string;
  try {
    watchlistId = await getOrCreateDefaultWatchlist(supabase, userId);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not open your watchlist.');
  }

  const rows: ImportRowResult[] = [];
  const seen = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];
  const watchedAt = new Date().toISOString();

  for (const { p, m, err } of matched) {
    if (err) {
      rows.push({ raw: p.title, status: 'error', title: p.title, message: 'Lookup failed' });
      continue;
    }
    if (!m) {
      rows.push({ raw: p.title, status: 'unmatched', title: p.title });
      continue;
    }
    const key = `${m.mediaType}-${m.id}`;
    if (seen.has(key)) {
      rows.push({ raw: p.title, status: 'skipped', title: m.title, year: m.year, message: 'Duplicate' });
      continue;
    }
    seen.add(key);
    toInsert.push({
      watchlist_id: watchlistId,
      user_id: userId,
      tmdb_id: m.id,
      media_type: m.mediaType,
      title: m.title,
      year: m.year,
      poster_path: m.posterPath,
      status: 'watched',
      rating: p.rating,
      watched_at: watchedAt,
    });
    rows.push({
      raw: p.title,
      status: 'imported',
      title: m.title,
      year: m.year,
      mediaType: m.mediaType,
      rating: p.rating,
    });
  }

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('watchlist_items')
      .upsert(toInsert, { onConflict: 'watchlist_id,tmdb_id,media_type' });
    if (error) return fail(error.message, rows);
  }

  revalidatePath('/app/watchlist');
  revalidatePath('/app');

  return {
    ok: true,
    imported: rows.filter((r) => r.status === 'imported').length,
    unmatched: rows.filter((r) => r.status === 'unmatched').length,
    rows,
  };
}
