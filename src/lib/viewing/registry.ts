/**
 * ADAPTER REGISTRY — the fallback chain, with honest status at every step.
 *
 * Order, exactly as specified:
 *   1. primary adapter, one bounded retry
 *   2. cached data for this window, if still valid (labelled stale)
 *   3. secondary adapter
 *   4. broaden channel coverage (the caller's job — we return everything we got)
 *   5. render valid rows even when enrichment is incomplete
 *   6. an honest unavailable state — never one row implying a full schedule
 *
 * The critical rule: a step that FAILS is recorded as a failure. It never turns
 * into an empty array. `combineStatus` then decides what the response says.
 */
import type { ScheduleAdapter, ScheduleRequest, ScheduleResponse, ScheduleListing } from './schedule';
import { dedupeListings } from './schedule';
import type { SourceReport } from './contract';
import type { SourceStatus } from './status';
import { isFailure } from './status';

/** Union several providers' rows, keeping distinct airings. */
function dedupeAcross(responses: ScheduleResponse[]): ScheduleListing[] {
  return dedupeListings(responses.flatMap((r) => r.listings));
}

export interface ResolveOptions {
  adapters: ScheduleAdapter[];
  request: ScheduleRequest;
  /** Cache read. Returns null on a miss; the response carries `cachedAt`. */
  readCache?: (req: ScheduleRequest) => Promise<ScheduleResponse | null>;
  writeCache?: (req: ScheduleRequest, res: ScheduleResponse) => Promise<void>;
  /** Per-attempt budget. */
  timeoutMs?: number;
  /** Retries for the PRIMARY adapter only. Bounded — never infinite. */
  retries?: number;
}

export interface ResolvedSchedule {
  listings: ScheduleListing[];
  sources: SourceReport[];
  fallbackUsed: boolean;
}

const DEFAULT_TIMEOUT_MS = 8_000;

function report(res: ScheduleResponse): SourceReport {
  return {
    sourceId: res.providerId,
    status: res.status,
    rawCount: res.totalRaw,
    errorCode: res.errorCode,
    errorMessage: res.errorMessage,
    fetchedAt: res.fetchedAt,
    cachedAt: res.cachedAt,
  };
}

async function withTimeout(
  adapter: ScheduleAdapter, req: ScheduleRequest, ms: number,
): Promise<ScheduleResponse> {
  const started = new Date().toISOString();
  try {
    return await Promise.race([
      adapter.fetch(req),
      new Promise<ScheduleResponse>((resolve) =>
        setTimeout(() => resolve({
          providerId: adapter.providerId, status: 'timeout', listings: [],
          totalRaw: 0, totalNormalized: 0, fetchedAt: started,
          errorCode: 'TIMEOUT', errorMessage: `No response within ${ms}ms`,
        }), ms)),
    ]);
  } catch (e) {
    // An adapter that throws is a FAILURE, not an empty schedule. This is the
    // line the old `.catch(() => [])` was missing.
    return {
      providerId: adapter.providerId, status: 'unavailable', listings: [],
      totalRaw: 0, totalNormalized: 0, fetchedAt: started,
      errorCode: 'ADAPTER_THREW',
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function resolveSchedule(o: ResolveOptions): Promise<ResolvedSchedule> {
  const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = Math.max(0, Math.min(o.retries ?? 1, 3));
  const sources: SourceReport[] = [];
  // Every response we saw, so a source that returned rows under a degraded
  // status can still contribute inventory at the salvage step.
  const responses: ScheduleResponse[] = [];
  const ordered = [...o.adapters].sort((a, b) => a.priority - b.priority);

  // Adapters with no credentials are reported, not attempted — "not configured"
  // and "configured but down" are different answers.
  for (const a of ordered.filter((x) => !x.isConfigured())) {
    sources.push({
      sourceId: a.providerId, status: 'misconfigured', rawCount: 0,
      errorCode: 'NO_CREDENTIALS',
      errorMessage: `${a.providerId} has no credentials configured on this deployment`,
    });
  }
  const usable = ordered.filter((a) => a.isConfigured());

  // ---- 1. primary, with bounded retry -------------------------------------
  const primary = usable[0];
  if (primary) {
    let res = await withTimeout(primary, o.request, timeoutMs);
    for (let i = 0; i < retries && isFailure(res.status) && res.status !== 'unauthorized'; i++) {
      // Don't retry an auth failure — the answer will not change.
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
      res = await withTimeout(primary, o.request, timeoutMs);
    }
    sources.push(report(res));
    responses.push(res);
    if (res.status === 'healthy' && res.listings.length > 0) {
      await o.writeCache?.(o.request, res).catch(() => {});
      return { listings: res.listings, sources, fallbackUsed: false };
    }
  }

  // ---- 2. cache ------------------------------------------------------------
  if (o.readCache) {
    const cached = await o.readCache(o.request).catch(() => null);
    if (cached && cached.listings.length > 0) {
      sources.push({ ...report(cached), status: 'stale_cache' });
      return { listings: cached.listings, sources, fallbackUsed: true };
    }
  }

  // ---- 3. secondary adapters ----------------------------------------------
  for (const a of usable.slice(1)) {
    const res = await withTimeout(a, o.request, timeoutMs);
    sources.push(report(res));
    responses.push(res);
    if (res.status === 'healthy' && res.listings.length > 0) {
      return { listings: res.listings, sources, fallbackUsed: true };
    }
  }

  // ---- 4/5. salvage: real rows under a degraded status ---------------------
  // A source can answer `partial` (some channels failed) and still carry genuine
  // inventory. Showing it beats showing nothing — the degraded status travels
  // with it, so the UI still tells the truth about completeness.
  const salvaged = dedupeAcross(responses.filter((r) => r.listings.length > 0));
  if (salvaged.length > 0) {
    return { listings: salvaged, sources, fallbackUsed: true };
  }

  // ---- 6. honest unavailable ----------------------------------------------
  if (sources.length === 0) {
    sources.push({
      sourceId: 'none', status: 'misconfigured', rawCount: 0,
      errorCode: 'NO_ADAPTERS',
      errorMessage: 'No schedule adapters are registered for this deployment',
    });
  }
  return { listings: salvaged, sources, fallbackUsed: sources.some((s) => s.status === 'stale_cache') };
}

/** The worst status across sources, for a quick UI check. */
export function overallStatus(sources: SourceReport[]): SourceStatus {
  if (sources.some((s) => s.status === 'healthy')) return 'healthy';
  return sources[0]?.status ?? 'misconfigured';
}
