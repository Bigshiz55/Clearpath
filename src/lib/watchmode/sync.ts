import 'server-only';
import type { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { fetchWatchmode } from './client';
import { parseTitleIdMapCsv } from './titleIdMap';
import { selectDailyBatch, titleKey, type PriorityCandidate, type PriorityTier } from './priority';
import { evaluateBudget, type BudgetState } from '@/lib/viewing/ingest/budget';

/**
 * WATCHMODE SYNC — the ONLY code path in the app allowed to call Watchmode.
 * Runs from a cron tick (`/api/cron/watchmode-sync`, and riding along on
 * `/api/cron/daily-scan` for the same one-cron-slot reason TV ingest does —
 * see scheduledIngest.ts), never from a request handler. Everything a card
 * or a title page shows comes back out of `watchmode_availability` /
 * `watchmode_fetch_state`, which are plain Supabase reads — not Watchmode
 * calls, so nothing here is "spent" twice.
 *
 * Watchmode's free Developer tier is 2,500 requests/month and is licensed
 * for NON-COMMERCIAL use only — this whole module is a testing
 * configuration. A paid commercial tier is required before any public
 * launch; see the report this shipped with.
 *
 * Hard cap, well under the free tier's 2,500 — the 500-call gap is
 * deliberate headroom, not a rounding choice.
 */
export const MONTHLY_CALL_LIMIT = 2000;
const TITLE_MAP_URL = 'https://api.watchmode.com/datasets/title_id_map.csv';
const REGION = 'US';
const TITLE_MAP_ENDPOINT = 'title_id_map_csv';
const TITLE_DETAILS_ENDPOINT = 'title_details';
/** Rows per Supabase upsert batch — keeps a single request payload bounded
 *  even though the CSV itself can be hundreds of thousands of rows. */
const UPSERT_BATCH_SIZE = 1000;
/** Candidate rows pulled per tier before dedupe/priority — generous, since
 *  this is a cheap DB read, not a Watchmode call. */
const CANDIDATE_POOL_SIZE = 3000;

type Admin = ReturnType<typeof createAdminClient>;

async function logCall(admin: Admin, endpoint: string, status: number | null, nowIso: string): Promise<void> {
  await admin.from('watchmode_call_ledger').insert({ endpoint, response_status: status, requested_at: nowIso });
}

async function monthlyCallsUsed(admin: Admin, nowMs: number): Promise<number> {
  const monthStart = new Date(Date.UTC(new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), 1)).toISOString();
  const { count } = await admin
    .from('watchmode_call_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('counts_against_allowance', true)
    .gte('requested_at', monthStart);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Title map — one request, once a day, resolves every title locally after.
// ---------------------------------------------------------------------------

export interface TitleMapImportResult {
  attempted: boolean;
  imported: boolean;
  rows: number;
  skipped: number;
  error?: string;
}

async function titleMapImportedToday(admin: Admin, today: string): Promise<boolean> {
  const { count } = await admin
    .from('watchmode_call_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('endpoint', TITLE_MAP_ENDPOINT)
    .gte('requested_at', `${today}T00:00:00.000Z`);
  return (count ?? 0) > 0;
}

/**
 * Fetch and import the whole title_id_map.csv — EXACTLY one HTTP request,
 * regardless of file size. Upserts are chunked, but that is Postgres traffic,
 * not Watchmode traffic; it never adds a second call.
 */
async function importTitleMapIfDue(admin: Admin, apiKey: string, nowMs: number): Promise<TitleMapImportResult> {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  if (await titleMapImportedToday(admin, today)) {
    return { attempted: false, imported: false, rows: 0, skipped: 0 };
  }

  const url = new URL(TITLE_MAP_URL);
  url.searchParams.set('apiKey', apiKey);
  const nowIso = new Date(nowMs).toISOString();

  let status: number | null = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    status = res.status;
    await logCall(admin, TITLE_MAP_ENDPOINT, status, nowIso);
    if (!res.ok) return { attempted: true, imported: false, rows: 0, skipped: 0, error: `HTTP ${res.status}` };

    const csv = await res.text();
    const parsed = parseTitleIdMapCsv(csv);

    for (let i = 0; i < parsed.rows.length; i += UPSERT_BATCH_SIZE) {
      const chunk = parsed.rows.slice(i, i + UPSERT_BATCH_SIZE).map((r) => ({
        watchmode_id: r.watchmodeId, imdb_id: r.imdbId, tmdb_id: r.tmdbId,
        tmdb_media_type: r.tmdbMediaType, imported_at: nowIso,
      }));
      const { error } = await admin.from('watchmode_title_map').upsert(chunk, { onConflict: 'watchmode_id' });
      if (error) throw new Error(`title map upsert failed: ${error.message}`);
    }
    return { attempted: true, imported: true, rows: parsed.rows.length, skipped: parsed.skipped };
  } catch (e) {
    // A thrown fetch (network/timeout) never reached `logCall` above — log it
    // here so the ledger still reflects that a request was attempted.
    if (status === null) await logCall(admin, TITLE_MAP_ENDPOINT, null, nowIso);
    return { attempted: true, imported: false, rows: 0, skipped: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Candidate gathering — watchlist, then Pack-linked titles, then everything
// else this app already has metadata for. The docket
// (src/lib/docketStore.ts) is browser-localStorage-only with no server
// table, so it contributes no candidates — see priority.ts's own comment.
// ---------------------------------------------------------------------------

interface RawRef { tmdbId: number; tmdbMediaType: 'movie' | 'tv' }

async function gatherCandidateRefs(admin: Admin): Promise<{ watchlist: RawRef[]; pack: RawRef[]; catalog: RawRef[] }> {
  const [wl, pk, cat] = await Promise.all([
    admin.from('watchlist_items').select('tmdb_id, media_type, added_at')
      .order('added_at', { ascending: false }).limit(CANDIDATE_POOL_SIZE),
    admin.from('tv_programmes').select('tmdb_id, tmdb_media_type')
      .not('tmdb_id', 'is', null).limit(CANDIDATE_POOL_SIZE),
    admin.from('title_dimensions').select('tmdb_id, media_type')
      .limit(CANDIDATE_POOL_SIZE),
  ]);

  const toRefs = (rows: { tmdb_id: number | null; media_type?: string | null; tmdb_media_type?: string | null }[] | null): RawRef[] =>
    (rows ?? [])
      .filter((r) => r.tmdb_id != null && (r.media_type === 'movie' || r.media_type === 'tv' || r.tmdb_media_type === 'movie' || r.tmdb_media_type === 'tv'))
      .map((r) => ({ tmdbId: r.tmdb_id as number, tmdbMediaType: (r.media_type ?? r.tmdb_media_type) as 'movie' | 'tv' }));

  return { watchlist: toRefs(wl.data), pack: toRefs(pk.data), catalog: toRefs(cat.data) };
}

/** Resolve refs to Watchmode ids via the local title map — a DB join, never
 *  a per-title Watchmode search call. Refs with no map entry are dropped
 *  silently here (not every TMDB title Watchmode tracks, and vice versa);
 *  the caller records that as a coverage number, not an error. */
async function resolveToWatchmodeIds(
  admin: Admin, tier: PriorityTier, refs: RawRef[],
): Promise<PriorityCandidate[]> {
  if (refs.length === 0) return [];
  const tmdbIds = [...new Set(refs.map((r) => r.tmdbId))];
  const { data } = await admin
    .from('watchmode_title_map')
    .select('watchmode_id, tmdb_id, tmdb_media_type')
    .in('tmdb_id', tmdbIds);
  const byKey = new Map<string, number>();
  for (const row of data ?? []) {
    if (row.tmdb_id != null && row.tmdb_media_type) byKey.set(titleKey(row.tmdb_id, row.tmdb_media_type as 'movie' | 'tv'), row.watchmode_id);
  }
  const out: PriorityCandidate[] = [];
  for (const r of refs) {
    const watchmodeId = byKey.get(titleKey(r.tmdbId, r.tmdbMediaType));
    if (watchmodeId != null) out.push({ tmdbId: r.tmdbId, tmdbMediaType: r.tmdbMediaType, watchmodeId, tier });
  }
  return out;
}

async function fetchLastFetchedAt(admin: Admin, refs: PriorityCandidate[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (refs.length === 0) return map;
  const movieIds = [...new Set(refs.filter((r) => r.tmdbMediaType === 'movie').map((r) => r.tmdbId))];
  const tvIds = [...new Set(refs.filter((r) => r.tmdbMediaType === 'tv').map((r) => r.tmdbId))];
  const queries = [];
  if (movieIds.length) queries.push(admin.from('watchmode_fetch_state').select('tmdb_id, tmdb_media_type, last_fetched_at').eq('tmdb_media_type', 'movie').in('tmdb_id', movieIds));
  if (tvIds.length) queries.push(admin.from('watchmode_fetch_state').select('tmdb_id, tmdb_media_type, last_fetched_at').eq('tmdb_media_type', 'tv').in('tmdb_id', tvIds));
  const results = await Promise.all(queries);
  for (const res of results) {
    for (const row of res.data ?? []) {
      map.set(titleKey(row.tmdb_id, row.tmdb_media_type as 'movie' | 'tv'), Date.parse(row.last_fetched_at));
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Applying one fetch result
// ---------------------------------------------------------------------------

async function fetchAndStoreOne(admin: Admin, apiKey: string, c: PriorityCandidate, nowIso: string): Promise<'ok' | 'error'> {
  let result: Awaited<ReturnType<typeof fetchWatchmode>>;
  try {
    result = await fetchWatchmode(c.tmdbMediaType, c.tmdbId, REGION);
  } catch {
    result = null;
  }
  await logCall(admin, TITLE_DETAILS_ENDPOINT, result != null ? 200 : null, nowIso);

  if (result == null) {
    // A real request was attempted (the key was present — see the budget
    // gate before this is ever called) and it failed. Do NOT write
    // fetch_state: a transient failure must not look like "checked, nothing
    // found" for the next 14 days — it should simply be retried later.
    return 'error';
  }

  const rows = result.options.map((o) => ({
    tmdb_id: c.tmdbId, tmdb_media_type: c.tmdbMediaType,
    source_name: o.providerName,
    source_type: o.type === 'flatrate' ? 'subscription' : o.type === 'ads' ? 'subscription' : o.type,
    region: result!.region, deeplink: o.link ?? null, updated_at: nowIso,
  }));

  // Replaced wholesale, not merged: delete this title's prior snapshot, then
  // insert the fresh one (possibly empty — a service dropping a title must
  // actually disappear, not linger from a stale row).
  await admin.from('watchmode_availability').delete().eq('tmdb_id', c.tmdbId).eq('tmdb_media_type', c.tmdbMediaType);
  if (rows.length > 0) {
    const { error } = await admin.from('watchmode_availability').insert(rows);
    if (error) throw new Error(`availability insert failed: ${error.message}`);
  }

  await admin.from('watchmode_fetch_state').upsert({
    tmdb_id: c.tmdbId, tmdb_media_type: c.tmdbMediaType, watchmode_id: c.watchmodeId,
    last_fetched_at: nowIso, last_status: 'ok', source_count: rows.length,
  }, { onConflict: 'tmdb_id,tmdb_media_type' });

  return 'ok';
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface WatchmodeSyncResult {
  ran: boolean;
  reason?: string;
  titleMap: TitleMapImportResult;
  candidatesConsidered: number;
  candidatesResolved: number;
  fetched: number;
  errors: number;
  monthlyUsedBefore: number;
  monthlyUsedAfter: number;
}

function budgetState(used: number, nowMs: number): BudgetState {
  const d = new Date(nowMs);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return { monthlyLimit: MONTHLY_CALL_LIMIT, safetyPercent: 1, used, dayOfMonth: d.getUTCDate(), daysInMonth };
}

/**
 * Run the daily sync: import the title map if due, then fetch up to 50
 * titles' availability, stopping the instant the monthly budget guard says
 * to. Never throws — a Watchmode-side failure must not take down whatever
 * cron tick called this (daily-scan's release-notes scan, in particular).
 */
export async function runWatchmodeSync(admin: Admin, nowMs = Date.now()): Promise<WatchmodeSyncResult> {
  const apiKey = serverEnv.watchmodeKey();
  const nowIso = new Date(nowMs).toISOString();
  const emptyTitleMap: TitleMapImportResult = { attempted: false, imported: false, rows: 0, skipped: 0 };

  if (!apiKey) {
    return {
      ran: false, reason: 'WATCHMODE_API_KEY is not set.', titleMap: emptyTitleMap,
      candidatesConsidered: 0, candidatesResolved: 0, fetched: 0, errors: 0,
      monthlyUsedBefore: 0, monthlyUsedAfter: 0,
    };
  }

  const usedBefore = await monthlyCallsUsed(admin, nowMs);
  // safetyPercent: 1 — the 2,000 cap IS the safety line (500 calls of
  // headroom already sit between it and Watchmode's real 2,500 limit), so
  // budget.ts's own additional 90% shave would leave the job stopping at
  // 1,800 for no reason. See MONTHLY_CALL_LIMIT's own comment.
  const preCheck = evaluateBudget(budgetState(usedBefore, nowMs), 1);
  if (!preCheck.allowed) {
    // eslint-disable-next-line no-console
    console.warn(`[watchmode-sync] stopped before starting: ${preCheck.reason}`);
    return {
      ran: false, reason: preCheck.reason, titleMap: emptyTitleMap,
      candidatesConsidered: 0, candidatesResolved: 0, fetched: 0, errors: 0,
      monthlyUsedBefore: usedBefore, monthlyUsedAfter: usedBefore,
    };
  }

  const titleMap = await importTitleMapIfDue(admin, apiKey, nowMs);

  const usedAfterMap = await monthlyCallsUsed(admin, nowMs);
  const postMapCheck = evaluateBudget(budgetState(usedAfterMap, nowMs), 1);
  if (!postMapCheck.allowed) {
    // eslint-disable-next-line no-console
    console.warn(`[watchmode-sync] stopped after title-map import, before any title fetch: ${postMapCheck.reason}`);
    return {
      ran: true, reason: postMapCheck.reason, titleMap,
      candidatesConsidered: 0, candidatesResolved: 0, fetched: 0, errors: 0,
      monthlyUsedBefore: usedBefore, monthlyUsedAfter: usedAfterMap,
    };
  }

  const refs = await gatherCandidateRefs(admin);
  const candidatesConsidered = refs.watchlist.length + refs.pack.length + refs.catalog.length;

  const [watchlistC, packC, catalogC] = await Promise.all([
    resolveToWatchmodeIds(admin, 'watchlist', refs.watchlist),
    resolveToWatchmodeIds(admin, 'pack', refs.pack),
    resolveToWatchmodeIds(admin, 'catalog', refs.catalog),
  ]);
  const allCandidates = [...watchlistC, ...packC, ...catalogC];
  const lastFetchedAt = await fetchLastFetchedAt(admin, allCandidates);
  const batch = selectDailyBatch(allCandidates, lastFetchedAt, nowMs);

  let fetched = 0;
  let errors = 0;
  for (const c of batch) {
    const used = await monthlyCallsUsed(admin, nowMs);
    const verdict = evaluateBudget(budgetState(used, nowMs), 1);
    if (!verdict.allowed) {
      // eslint-disable-next-line no-console
      console.warn(`[watchmode-sync] stopping mid-batch at ${fetched}/${batch.length}: ${verdict.reason}`);
      break;
    }
    const outcome = await fetchAndStoreOne(admin, apiKey, c, nowIso).catch((e) => {
      // eslint-disable-next-line no-console
      console.warn(`[watchmode-sync] fetch failed for ${titleKey(c.tmdbId, c.tmdbMediaType)}: ${e instanceof Error ? e.message : String(e)}`);
      return 'error' as const;
    });
    if (outcome === 'ok') fetched++;
    else errors++;
  }

  const monthlyUsedAfter = await monthlyCallsUsed(admin, nowMs);
  return {
    ran: true, titleMap, candidatesConsidered, candidatesResolved: allCandidates.length,
    fetched, errors, monthlyUsedBefore: usedBefore, monthlyUsedAfter,
  };
}

// ---------------------------------------------------------------------------
// ON-DEMAND REFRESH — the one sanctioned request-time path
// ---------------------------------------------------------------------------

/**
 * ONE TITLE, ON A USER'S EXPLICIT REQUEST.
 *
 * This module's header says Watchmode is called from a cron tick and never
 * from a request handler. This is the deliberate, bounded exception, and it
 * exists because the alternative was worse: the card's "Check availability"
 * button had nothing behind it, and a button that does nothing is a lie told
 * with a cursor.
 *
 * Every guard the cron path uses still applies, and one more besides:
 *   - the SAME monthly budget ledger and the same 2,000-call hard cap,
 *   - the same wholesale-replace write, so a dropped service disappears,
 *   - and the caller must rate-limit per user (see the route), because this
 *     is the only Watchmode path a stranger can trigger at all.
 *
 * Returns a REASON on every failure rather than a bare false — the panel
 * shows the user why, and "we are out of budget this month" and "we have no
 * key" are different things they may act on differently.
 */
export type RefreshReason = 'no_key' | 'budget_exhausted' | 'fetch_failed' | 'store_failed';

export interface RefreshOneResult {
  ok: boolean;
  reason?: RefreshReason;
  /** How many verified sources the refresh landed. 0 is a real answer. */
  sourceCount?: number;
}

export async function refreshOneTitle(
  admin: Admin,
  tmdbId: number,
  tmdbMediaType: 'movie' | 'tv',
  nowMs = Date.now(),
): Promise<RefreshOneResult> {
  const apiKey = serverEnv.watchmodeKey();
  if (!apiKey) return { ok: false, reason: 'no_key' };

  const used = await monthlyCallsUsed(admin, nowMs);
  if (used >= MONTHLY_CALL_LIMIT) return { ok: false, reason: 'budget_exhausted' };

  // watchmodeId is only used for the fetch_state row's bookkeeping column —
  // `fetchWatchmode` resolves from the TMDB id directly — so a title absent
  // from the id map can still be refreshed rather than silently refused.
  const { data: mapped } = await admin
    .from('watchmode_title_map')
    .select('watchmode_id')
    .eq('tmdb_id', tmdbId)
    .eq('tmdb_media_type', tmdbMediaType)
    .maybeSingle();

  const nowIso = new Date(nowMs).toISOString();
  try {
    const outcome = await fetchAndStoreOne(
      admin,
      apiKey,
      { tmdbId, tmdbMediaType, watchmodeId: (mapped?.watchmode_id as number | undefined) ?? 0, tier: 'watchlist' },
      nowIso,
    );
    if (outcome === 'error') return { ok: false, reason: 'fetch_failed' };
  } catch {
    // fetchAndStoreOne throws only when the availability INSERT fails, which
    // in production today means the cache table is missing entirely — see
    // docs/SCHEMA_DRIFT_0042.md. Distinct from a failed fetch on purpose.
    return { ok: false, reason: 'store_failed' };
  }

  const { count } = await admin
    .from('watchmode_availability')
    .select('id', { count: 'exact', head: true })
    .eq('tmdb_id', tmdbId)
    .eq('tmdb_media_type', tmdbMediaType);

  return { ok: true, sourceCount: count ?? 0 };
}

/**
 * Can an on-demand refresh actually do anything right now? Answered WITHOUT
 * spending a call, so the card can label its button truthfully before the
 * user presses it — "Check availability" when a check is possible, and
 * "Notify me when confirmed" when it is not.
 */
export async function refreshCapability(
  admin: Admin,
  nowMs = Date.now(),
): Promise<{ available: boolean; reason?: RefreshReason }> {
  if (!serverEnv.watchmodeKey()) return { available: false, reason: 'no_key' };
  try {
    const used = await monthlyCallsUsed(admin, nowMs);
    if (used >= MONTHLY_CALL_LIMIT) return { available: false, reason: 'budget_exhausted' };
  } catch {
    // The ledger lives in the same schema as the cache. If we cannot read it,
    // we cannot write the result either.
    return { available: false, reason: 'store_failed' };
  }
  // The cache table must exist for a refresh to have anywhere to land.
  const { error } = await admin.from('watchmode_availability').select('id', { head: true, count: 'exact' }).limit(1);
  if (error) return { available: false, reason: 'store_failed' };
  return { available: true };
}
