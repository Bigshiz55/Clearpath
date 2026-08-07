import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from '@/lib/env';

/**
 * A privileged read of a mutation ledger must never be served from a stale
 * snapshot. supabase-js issues its SELECTs as ordinary `fetch()` GETs, and in
 * the App Router those are eligible for Next.js's fetch Data Cache — which is
 * keyed on the request URL. A query whose URL is CONSTANT across time (e.g.
 * `tv_ingestion_runs?provider_id=eq.tvmaze&order=started_at.desc&limit=20`)
 * therefore gets pinned to whatever response it first cached, while a sibling
 * query on the same table whose URL carries a live timestamp
 * (`&started_at=gte.2026-08-07T00:00:00Z`) misses the cache and reads live.
 * That is not hypothetical: it made /api/health/tv report a TVmaze run row two
 * days stale while the ingest gate — querying the same table with a dated
 * lower bound — correctly saw a run from minutes earlier, so health cried
 * "degraded" about a pipeline that had just succeeded. Route-level
 * `dynamic = 'force-dynamic'` did not reach these nested fetches.
 *
 * Forcing `cache: 'no-store'` on every fetch this client issues removes the
 * whole failure class: no service-role SELECT is ever cacheable, so a
 * privileged reader always sees committed writes. The cost — losing fetch-cache
 * reuse on service-role reads — is exactly the behaviour you want for a client
 * that reads (and writes) authoritative, RLS-bypassing data.
 */
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' });

/**
 * Privileged Supabase client using the service-role key. SERVER-ONLY.
 * Never import this from client code. Used only for trusted operations such as
 * account deletion. Bypasses RLS, so callers must authorize the request first.
 */
export function createAdminClient() {
  return createSupabaseClient(publicEnv.supabaseUrl(), serverEnv.serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: noStoreFetch },
  });
}
