'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { searchTitles, type SearchResultItem } from '@/lib/tmdb/client';
import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_LINES = 60;

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

interface ParsedLine {
  raw: string;
  title: string;
  year: number | null;
  rating: number | null;
}

/**
 * Parse a single free-form line into { title, year, rating }. Tolerant of the
 * many shapes people paste: bullets, "Title (2013) - 9", "Title 8", "Title: 9",
 * "Title 9/10". Ratings are on a 1–10 scale; a 4-digit year is never mistaken
 * for a rating because the rating capture is limited to 1–2 digits.
 */
function parseLine(raw: string): ParsedLine | null {
  let s = raw.trim();
  if (!s) return null;
  // Strip leading bullets / numbering ("1. ", "- ", "* ", "• ").
  s = s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '');

  let year: number | null = null;
  const ym = s.match(/\((\d{4})\)/);
  if (ym) {
    year = Number.parseInt(ym[1]!, 10);
    s = s.replace(ym[0], ' ');
  }

  let rating: number | null = null;
  // Trailing rating: requires a separator/space before the number so we don't
  // eat digits that are part of a title (e.g. "Se7en", "1917").
  const rm = s.match(/[\s\-–—:|,=]\s*(\d{1,2}(?:\.\d)?)(?:\s*\/\s*10)?\s*$/);
  if (rm) {
    const n = Math.round(Number.parseFloat(rm[1]!));
    if (n >= 1 && n <= 10) {
      rating = n;
      s = s.slice(0, rm.index).trim();
    }
  }

  const title = s.replace(/[\s\-–—:|,]+$/, '').trim();
  if (!title) return null;
  return { raw, title, year, rating };
}

/** Choose the best TMDB candidate: exact title first, then year, then popularity. */
function pickMatch(
  results: SearchResultItem[],
  title: string,
  year: number | null,
): SearchResultItem | null {
  if (results.length === 0) return null;
  const lc = title.toLowerCase();
  const exact = results.filter((r) => r.title.toLowerCase() === lc);
  const pool = exact.length > 0 ? exact : results;
  if (year != null) {
    const byYear = pool.filter((r) => r.year != null && Math.abs(r.year - year) <= 1);
    if (byYear.length > 0) return byYear[0]!;
  }
  // `results` (and thus `pool`) is already sorted by popularity desc.
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
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
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
 * Bulk-import a pasted watch history. Each line becomes a `watchlist_items` row
 * with status 'watched' and the parsed rating. Titles are resolved against TMDB
 * and the result is reported per-line so the user can see (and fix) mismatches.
 */
export async function importWatchedHistory(text: string): Promise<ImportSummary> {
  if (typeof text !== 'string' || !text.trim()) {
    return fail('Paste your list first — one title per line.');
  }

  const parsed = text
    .split(/\r?\n/)
    .map(parseLine)
    .filter((p): p is ParsedLine => p !== null);

  if (parsed.length === 0) return fail('No titles found in that list.');
  if (parsed.length > MAX_LINES) {
    return fail(
      `That's ${parsed.length} titles. Please import up to ${MAX_LINES} at a time (paste the rest in a second batch).`,
    );
  }

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

  const matched = await mapPool(parsed, 6, async (p) => {
    try {
      const results = await searchTitles(p.title);
      return { p, m: pickMatch(results, p.title, p.year), err: false };
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
      rows.push({ raw: p.raw, status: 'error', title: p.title, message: 'Lookup failed' });
      continue;
    }
    if (!m) {
      rows.push({ raw: p.raw, status: 'unmatched', title: p.title, year: p.year });
      continue;
    }
    const key = `${m.mediaType}-${m.id}`;
    if (seen.has(key)) {
      rows.push({ raw: p.raw, status: 'skipped', title: m.title, year: m.year, message: 'Duplicate' });
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
      raw: p.raw,
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
