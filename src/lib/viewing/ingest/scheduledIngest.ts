import 'server-only';
import type { createAdminClient } from '@/lib/supabase/admin';
import { purgeUncarriedNationalStations, runTvmazeIngest, runTvmazeNationalIngest } from './tvmazeWriter';
import { runTvMediaIngest } from './tvMediaWriter';
import { mayCallUpstream, resolveDataMode } from '@/lib/tv/dataMode';

/**
 * SHARED GATING — TV Media (primary) and TVmaze (fallback/supplement).
 *
 * Used by both `/api/cron/tv-ingest` (the authoritative hourly Vercel Cron
 * tick, registered in vercel.json) and `/api/cron/daily-scan` (a guaranteed
 * once-a-day tick that also rides this gate as a harmless fallback, so the
 * tables stay warm even if an hourly tick is missed). Same gating either way
 * so running from a daily tick never double-runs what an hourly tick would
 * have already done:
 *
 *  - TVmaze: once per UTC calendar day, checked against `tv_ingestion_runs`
 *    rather than a fixed hour — its single national feed has no per-market
 *    local time to align to.
 *  - TV Media: at most once every two hours (its data only refreshes that
 *    often upstream). A cheap no-op with zero DB writes when
 *    `TVMEDIA_API_KEY` is unset, so this can be called unconditionally on
 *    every tick and let each ingest decide for itself whether there's
 *    anything to do.
 *
 * Full guide reads (`src/lib/tv/ingestedGuide.ts`) merge whatever both
 * writers have stored with no code change: TVmaze keeps carrying its own
 * Hallmark/Lifetime/crime channels either way, TV Media adds the rest once a
 * key exists and this has run at least once, and if TV Media has never run
 * the guide simply falls back to whatever TVmaze already ingested.
 */

// Trimmed down from an original 7/14 after a real first-ever run — full
// window, every discovered channel, one row at a time — produced a genuine
// FUNCTION_INVOCATION_TIMEOUT in production. The write side is now batched
// and TVmaze's premiere-detection fetches now run with bounded concurrency
// (see tvmazeWriter.ts), but a smaller window is still the honest choice for
// a cron that has to fit inside one function invocation, once a day, on top
// of the release-notes scan it's riding along with. The guide only ever
// displays a 6-hour window; a few days of coverage is already generous
// headroom. Widen these once a live run has actually proven the timing.
const TVMAZE_INGEST_DAYS = 3;
// Widened from 3. Two reasons, both real:
//   1. A three-day "premiere calendar" is a thin product; a Pack that can
//      only see to Friday cannot tell you what is on next week.
//   2. Crime Case Files needs a corpus with REPEAT coverage to work at all.
//      The same case airs under different series titles (Dateline vs
//      Dateline: Secrets Uncovered) and on different channels days apart; a
//      three-day window contains almost no such pairs, so the matcher had
//      nothing to match. Measured on the live lineup: 0 cross-title pairs at
//      3 days.
// Affordable now that ingest is off the request path (maxDuration 300 on
// /api/tv/refresh) and writes are batched.
const TVMEDIA_INGEST_DAYS = 10;
const TVMEDIA_MIN_INTERVAL_MS = 2 * 60 * 60 * 1000;

async function lastRunAt(
  admin: ReturnType<typeof createAdminClient>, providerId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('tv_ingestion_runs')
    .select('started_at, status')
    .eq('provider_id', providerId)
    .in('status', ['success', 'partial'])
    .order('started_at', { ascending: false })
    .limit(1);
  return data?.[0]?.started_at ?? null;
}

/**
 * PROVIDER-LEVEL MUTUAL EXCLUSION (migration 0043).
 *
 * The time-based gates below answer "is a run DUE?" — they cannot answer "is
 * a run HAPPENING?". Two triggers arriving together (the hourly workflow and
 * a stale-pack refresh, say) both read the same last-run timestamp, both
 * conclude they are due, and both start. The lease closes that window: it is
 * taken and released in a single UPDATE, so exactly one caller wins.
 *
 * Leased rather than advisory because a serverless function can vanish
 * mid-run; a lease expires on its own where a connection-scoped lock would
 * be released while the upstream fetch it guarded was still in flight.
 *
 * Fail OPEN. If the lock RPC is unavailable — an environment that has not
 * applied 0043 — ingestion must still happen. The time gates remain, so the
 * worst case is the behaviour we had before the lock existed, not a pipeline
 * that silently stops.
 */
async function withProviderLock<T, S>(
  admin: ReturnType<typeof createAdminClient>,
  providerId: string,
  leaseSeconds: number,
  run: () => Promise<T>,
  // Its own type: "skipped" is a different shape from a completed run, and
  // pretending otherwise would force a fake full result.
  skipped: () => S,
): Promise<T | S> {
  let acquired = true;
  let lockAvailable = true;
  try {
    const { data, error } = await admin.rpc('tv_try_acquire_ingest_lock', {
      p_provider_id: providerId,
      p_lease_seconds: leaseSeconds,
      p_min_interval_seconds: 0,
    });
    if (error) lockAvailable = false;
    else acquired = data === true;
  } catch {
    lockAvailable = false;
  }

  if (lockAvailable && !acquired) return skipped();

  try {
    return await run();
  } finally {
    if (lockAvailable) {
      try {
        await admin.rpc('tv_release_ingest_lock', { p_provider_id: providerId, p_ok: true });
      } catch {
        /* the lease expires on its own; a failed release must not mask the run */
      }
    }
  }
}

export async function runGatedTvIngest(admin: ReturnType<typeof createAdminClient>) {
  // PRODUCTION FAILS CLOSED. An unconfigured production deployment disables
  // EVERY ingestion adapter — free ones included. This is deliberately above
  // the per-provider gates: the question "has anybody decided what this
  // deployment is allowed to do" has to be answered before "is TVmaze due".
  //
  // Reads are untouched. Whatever verified data is already stored keeps being
  // served, with its own freshness labelling, because deleting the listings we
  // have because a variable is missing would turn a configuration mistake into
  // an outage.
  const policy = resolveDataMode();
  if (!policy.configured) {
    const blocked = { ok: true, ran: false, status: 'egress_denied' as const, reason: `${policy.code}: ${policy.reason}` };
    return {
      tvmaze: { ran: false, reason: `${policy.code}: ${policy.reason}` },
      // The national ingest fails closed with the curated one — same policy gate.
      tvmazeNational: { ran: false, reason: `${policy.code}: ${policy.reason}` },
      tvmedia: blocked,
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  // The curated day-gate. Excludes national runs (`trigger: 'national'`) so the
  // two ingests — both stamped provider_id 'tvmaze' — gate independently: the
  // national run writing its own row must never make the curated run look like
  // it "already ran today", and vice versa (the national gate below is the
  // symmetric query).
  const { data: todaysRuns } = await admin
    .from('tv_ingestion_runs')
    .select('id, status, started_at')
    .eq('provider_id', 'tvmaze')
    .neq('trigger', 'national')
    .gte('started_at', `${today}T00:00:00.000Z`)
    .order('started_at', { ascending: false })
    .limit(1);
  const alreadyRanToday = (todaysRuns ?? []).some((r) => r.status === 'success' || r.status === 'partial');
  // PER-SOURCE FAILURE ISOLATION. The two providers are independent — a dark
  // source should DEGRADE coverage, not erase the rest of the lineup. Both
  // runs used to be plain sequential awaits, so a HARD throw inside the TVmaze
  // writer (a DB outage mid-write, an adapter bug) propagated straight out of
  // this function and TV Media never ran at all — one source's failure silently
  // took the other down with it. Each run is now caught here and turned into a
  // structured `failed` result; the sibling still runs, and the reason travels
  // back to the caller and to /api/health/tv. Soft, per-day failures were
  // always isolated inside the writers (`daysFailed`); this closes the hard
  // path they never covered.
  const tvmaze = alreadyRanToday
    ? { ran: false, reason: `Already ran today (${today}, UTC).` }
    : await isolateRun('tvmaze', () =>
        withProviderLock(
          admin, 'tvmaze', 600,
          async () => ({ ran: true, ...(await runTvmazeIngest(TVMAZE_INGEST_DAYS)) }),
          () => ({ ran: false, reason: 'Another TVmaze ingest is already running.' }),
        ),
      );

  // NATIONAL TVmaze ingest — broad, allowlist-driven (see runTvmazeNationalIngest).
  // Runs ALONGSIDE the curated ingest under the same policy gate (already passed
  // above; failing closed on an unconfigured deployment), once per UTC day, and
  // isolated + leased on its OWN lock key ('tvmaze_national') so it neither
  // blocks nor is blocked by the curated 'tvmaze' lock — both run once per tick.
  // No metered egress check: like the curated TVmaze run, its only gate is
  // `policy.configured` — TVmaze is free and unmetered.
  const { data: todaysNationalRuns } = await admin
    .from('tv_ingestion_runs')
    .select('id, status')
    .eq('provider_id', 'tvmaze')
    .eq('trigger', 'national')
    .gte('started_at', `${today}T00:00:00.000Z`)
    .order('started_at', { ascending: false })
    .limit(1);
  const nationalAlreadyRanToday = (todaysNationalRuns ?? []).some((r) => r.status === 'success' || r.status === 'partial');
  const tvmazeNational = nationalAlreadyRanToday
    ? { ran: false, reason: `Already ran today (${today}, UTC).` }
    : await isolateRun('tvmaze_national', () =>
        withProviderLock(
          admin, 'tvmaze_national', 600,
          async () => ({ ran: true, ...(await runTvmazeNationalIngest(TVMAZE_INGEST_DAYS)) }),
          () => ({ ran: false, reason: 'Another national TVmaze ingest is already running.' }),
        ),
      );

  // DATA-MODE GATE, ahead of everything TV Media related.
  //
  // `runTvMediaIngest` asks the same door itself — that is the backstop for
  // any caller, and it stays. Asking here as well is not belt-and-braces for
  // its own sake: it means a denied provider costs nothing at all on a tick.
  // No lease is taken, no adapter is constructed, and no `skipped` run row is
  // written every hour for a decision that has not changed. The reason still
  // travels back to the caller and to /api/health/tv, so "why is TV Media not
  // refreshing" stays answerable without reading rows.
  const tvMediaEgress = mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' });
  if (!tvMediaEgress.allowed) {
    return {
      tvmaze,
      tvmazeNational,
      tvmedia: {
        ok: true, ran: false, status: 'egress_denied' as const,
        reason: `${tvMediaEgress.code}: ${tvMediaEgress.reason}`,
      },
    };
  }

  const lastTvMediaRun = await lastRunAt(admin, 'tv_media');
  const tvMediaDue = !lastTvMediaRun || (Date.now() - Date.parse(lastTvMediaRun)) >= TVMEDIA_MIN_INTERVAL_MS;
  const tvmedia = tvMediaDue
    ? await isolateRun('tv_media', () =>
        withProviderLock(
          admin, 'tv_media', 600,
          () => runTvMediaIngest(TVMEDIA_INGEST_DAYS),
          () => ({
            ok: true, ran: false, status: 'success' as const,
            reason: 'Another TV Media ingest is already running.',
          }),
        ),
      )
    : { ok: true, ran: false, status: 'success' as const, reason: `Ran within the last 2h (${lastTvMediaRun}).` };

  /* THE PURGE RUNS WHETHER OR NOT ANYTHING WAS FETCHED.
     Deliberately outside every day-gate above. "We no longer carry this
     station" is a policy change, and making it wait on a fetch cadence is
     exactly what left three web feeds rendering as television channels for a
     full day after the write-boundary fix shipped — the national ingest is
     gated to once per UTC day and had already run.
     It consults the registry, never a fetch, so a skipped, failed or empty run
     cannot influence it and it cannot mass-delete a carried channel. Isolated
     like every other step: a purge failure must not abort the ingest. */
  const purge = await isolateRun('tvmaze-purge', () => purgeUncarriedNationalStations(admin));

  return { tvmaze, tvmazeNational, tvmedia, purge };
}

/**
 * Contain a single provider's hard failure so it cannot abort the rest of the
 * lineup ingestion. A thrown error becomes a structured `failed` result — the
 * same shape callers already handle — and is logged for observability; the
 * sibling provider's run is unaffected because this never rethrows.
 */
export async function isolateRun<T>(providerId: string, run: () => Promise<T>): Promise<T | IsolatedFailure> {
  try {
    return await run();
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error(`[tv-ingest] ${providerId} run threw and was isolated: ${reason}`);
    return { ok: false, ran: false, status: 'failed', provider: providerId, reason: `Ingest failed: ${reason}` };
  }
}

export interface IsolatedFailure {
  ok: false;
  ran: false;
  status: 'failed';
  provider: string;
  reason: string;
}
