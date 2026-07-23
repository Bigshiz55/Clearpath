import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchGridForStore, etTime, hashId, type GridRow } from '@/lib/gracenote';
import type { Airing } from '@/lib/onTv';

/**
 * The Supabase-backed TV grid. A cron job (/api/cron/tv-grid) pulls Gracenote's
 * full national lineup once an hour into `tv_grid`; every request then reads from
 * our own DB — fast, and never touching Gracenote on the request path, so it's
 * bulletproof at any user count and immune to Gracenote's rate limits. Falls back
 * to the live fetch (in onTv.ts) whenever the table is empty or dormant.
 */

const STORE_HORIZON_MS = 48 * 60 * 60 * 1000; // we keep ~2 days of listings warm
const STALE_MS = 100 * 60 * 1000; // if the newest refresh is older than this, self-heal

// Per-instance debounce so a burst of requests doesn't fire many refreshes.
let refreshing = false;

interface TvGridDbRow {
  call_sign: string;
  network: string;
  network_key: string | null;
  show_name: string;
  airstamp: string;
  runtime: number | null;
  is_movie: boolean;
  image: string | null;
  summary: string | null;
  refreshed_at: string;
}

function toAiring(r: TvGridDbRow): Airing {
  const { time, minutes } = etTime(r.airstamp);
  return {
    id: hashId(`${r.call_sign}|${r.airstamp}`),
    time,
    minutes,
    airstamp: r.airstamp,
    runtime: r.runtime,
    network: r.network,
    showName: r.show_name,
    showId: hashId(r.call_sign),
    episodeName: null,
    season: null,
    number: null,
    showType: r.is_movie ? 'Movie' : 'Series',
    genres: [],
    rating: null,
    image: r.image ?? null,
    summary: r.summary ?? null,
    imdb: null,
  };
}

/**
 * Pull Gracenote's full grid and upsert it into `tv_grid`. Prunes airings that
 * have already ended. Returns a small status for the cron response.
 */
export async function refreshTvGrid(): Promise<{ ok: boolean; rows: number; error?: string }> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, rows: 0, error: 'admin client unavailable (missing service role key)' };
  }
  const nowMs = Date.now();
  let rows: GridRow[] = [];
  try {
    rows = await fetchGridForStore(nowMs, STORE_HORIZON_MS);
  } catch (e) {
    return { ok: false, rows: 0, error: e instanceof Error ? e.message : 'grid fetch failed' };
  }
  if (rows.length === 0) return { ok: false, rows: 0, error: 'grid fetch returned nothing (rate-limited?)' };

  const refreshedAt = new Date().toISOString();
  const payload = rows.map((r) => ({
    call_sign: r.callSign,
    network: r.network,
    network_key: r.networkKey,
    show_name: r.showName,
    airstamp: r.airstamp,
    runtime: r.runtime,
    is_movie: r.isMovie,
    image: r.image,
    summary: r.summary,
    refreshed_at: refreshedAt,
  }));

  try {
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await admin.from('tv_grid').upsert(payload.slice(i, i + 500), { onConflict: 'call_sign,airstamp' });
      if (error) return { ok: false, rows: 0, error: error.message };
    }
    // Drop anything that finished more than 3h ago so the table stays lean.
    await admin.from('tv_grid').delete().lt('airstamp', new Date(nowMs - 3 * 60 * 60 * 1000).toISOString());
    return { ok: true, rows: payload.length };
  } catch (e) {
    return { ok: false, rows: 0, error: e instanceof Error ? e.message : 'upsert failed' };
  }
}

/**
 * Read stored airings for the window, filtered to a network and/or movies-only.
 * Returns [] when the table is empty/missing (caller falls back to a live fetch).
 * If the stored data is stale and no refresh is in flight, kicks a best-effort
 * background refresh so it self-heals even without a configured cron.
 */
export async function getStoredGridAirings(
  nowMs: number,
  horizonMs: number,
  opts: { network?: string | null; movieOnly?: boolean } = {},
): Promise<Airing[]> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return [];
  }
  // Include in-progress airings (started up to 3h ago) by widening the low bound,
  // then keep only those still running or upcoming.
  const from = new Date(nowMs - 3 * 60 * 60 * 1000).toISOString();
  const to = new Date(nowMs + horizonMs).toISOString();
  try {
    let q = admin
      .from('tv_grid')
      .select('call_sign, network, network_key, show_name, airstamp, runtime, is_movie, image, summary, refreshed_at')
      .gte('airstamp', from)
      .lte('airstamp', to)
      .order('airstamp', { ascending: true })
      .limit(600);
    const wantNet = opts.network ? opts.network.toLowerCase() : null;
    if (wantNet) q = q.in('network_key', wantNet === 'lifetime' ? ['lifetime', 'lmn'] : [wantNet]);
    if (opts.movieOnly) q = q.eq('is_movie', true);
    const { data, error } = await q;
    if (error || !data || data.length === 0) return [];

    const rows = data as TvGridDbRow[];
    maybeSelfHeal(rows[0]?.refreshed_at ?? null, nowMs);

    return rows
      .filter((r) => {
        const start = Date.parse(r.airstamp);
        const end = start + (r.runtime ?? 0) * 60000;
        return end > nowMs && start <= nowMs + horizonMs; // still on, or upcoming in window
      })
      .map(toAiring)
      .slice(0, 60);
  } catch {
    return [];
  }
}

/** Fire a background refresh if the newest stored row is stale. Best-effort. */
function maybeSelfHeal(newestRefreshedAt: string | null, nowMs: number): void {
  if (refreshing) return;
  const age = newestRefreshedAt ? nowMs - Date.parse(newestRefreshedAt) : Infinity;
  if (!(age > STALE_MS)) return;
  refreshing = true;
  void refreshTvGrid()
    .catch(() => {})
    .finally(() => {
      refreshing = false;
    });
}
