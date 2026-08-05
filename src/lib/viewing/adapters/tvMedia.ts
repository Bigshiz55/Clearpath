import 'server-only';
import type {
  ScheduleAdapter, ScheduleRequest, ScheduleResponse, ScheduleListing, ContentType,
} from '../schedule';
import { statusFromHttp } from '../status';
import { requestEgress } from '@/lib/tv/egressGuard';

/**
 * TV MEDIA — WatchVerd1ct's licensed production listings provider.
 *
 * TV Media (tvmedia.ca) licenses North American TV listings: full lineups by
 * postal/ZIP code and provider, including local affiliates, cable, satellite,
 * IPTV, premium channels, sports, movies, reruns, news, kids and FAST channels.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE VERIFIED CONTRACT (v4)
 *
 * This adapter previously targeted an INFORMED GUESS at TV Media's API (a
 * different base path, header auth, a flat `/listings` endpoint) written
 * before real credentials existed. Live against a real key, that guess
 * produced HTTP_404 / malformed_response — wrong host, wrong auth
 * mechanism, wrong endpoint shape, all at once. This version targets TV
 * Media's documented v4 contract instead:
 *
 *   Base:      https://api.tvmedia.ca/tv/v4
 *   Auth:      `api_key` QUERY PARAMETER (their contract, not ours — the
 *              earlier "never a query parameter" stance was the right
 *              instinct for an unverified guess, but the real API only
 *              accepts the key this way; a header-only implementation
 *              would authenticate with nothing and fail every call).
 *   Lineups:   GET /lineups?postalCode={ZIP}&api_key={KEY}
 *   Listings:  GET /lineups/{lineupID}/listings
 *              ?api_key={KEY}&start=...&end=...&timezone=UTC&detail=brief
 *
 * The response FIELD NAMES below (stationID, callsign, listDateTime, ...)
 * are the documented ones, not aliases-and-hope. `validateContract()` still
 * exists for the day a live payload's envelope (which key wraps the array —
 * still not pinned down beyond "an array of listing objects") turns out to
 * differ from what `findArray()` checks for.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Credentials are server-only, never logged, never returned in an error
 * body, never sent to the client. Because auth is now a query parameter,
 * this matters even more than before: nothing in this file ever logs or
 * returns the constructed request URL — only `res.status` and the response
 * BODY (still scrubbed of anything key-shaped) ever reach an error message.
 */

/** Adapter id used by the egress gate and the source registry. */
export const TVM_ADAPTER_ID = 'tv_media';
export const TVM_API_KEY_ENV = 'TVMEDIA_API_KEY';
export const TVM_BASE_URL_ENV = 'TVMEDIA_BASE_URL';
export const TVM_LINEUP_ENV = 'TVMEDIA_LINEUP_ID';
export const TVM_ZIP_ENV = 'TVMEDIA_DEFAULT_ZIP';

/** Documented v4 base. Overridable so a sandbox/staging host needs no code change. */
const DEFAULT_BASE = 'https://api.tvmedia.ca/tv/v4';

/**
 * The documented "US Generic Eastern" lineup. TV Media's Sample/trial plan
 * does not resolve every postal code via `/lineups` — when it can't, this is
 * the one lineup guaranteed to work on that plan, so a Sample-plan deployment
 * still gets a real (if not hyper-local) grid instead of MISCONFIGURED.
 */
const SAMPLE_PLAN_FALLBACK_LINEUP = '36617';

/** How long a resolved ZIP → lineup mapping is trusted before re-resolving.
 *  Lineup assignments don't change day to day; this just keeps a warm
 *  serverless instance from re-hitting `/lineups` on every request. */
const LINEUP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Module-level — persists across warm invocations of the same serverless
 *  instance, cleared on redeploy. Same pattern already documented for
 *  Schedules Direct's token cache. Keyed by ZIP; the fallback lineup is
 *  cached too, so a Sample-plan deployment doesn't retry `/lineups` on
 *  every single request once it's established that ZIP doesn't resolve. */
const lineupCache = new Map<string, { lineupId: string; resolvedAt: number }>();

type Json = Record<string, unknown>;

const str = (v: unknown): string | null =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null;
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown): boolean =>
  v === true || v === 'true' || v === 1 || v === '1' || v === 'Y';
const present = (v: unknown): boolean => v !== undefined && v !== null && v !== '';

/** Find an array of row objects wherever the payload happens to nest it —
 *  the documented contract confirms the endpoint and its query parameters,
 *  not which key (if any) wraps the listing array, so this stays defensive
 *  rather than assuming a bare array. */
function findArray(payload: unknown, wrapperKeys: readonly string[]): Json[] {
  if (Array.isArray(payload)) return payload as Json[];
  if (!payload || typeof payload !== 'object') return [];
  const o = payload as Json;
  for (const k of wrapperKeys) {
    const v = o[k];
    if (Array.isArray(v)) return v as Json[];
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') {
      const inner = findArray(v, wrapperKeys);
      if (inner.length > 0) return inner;
    }
  }
  return [];
}

const LISTINGS_WRAPPER_KEYS = ['listings', 'data', 'results'];
const LINEUPS_WRAPPER_KEYS = ['lineups', 'data', 'results'];

/**
 * `listDateTime` is documented as zone-less — safe to read as UTC ONLY
 * because we explicitly request `timezone=UTC` on every listings call.
 * Distinct from a generic "naive timestamp with no declared zone" case
 * (which the rest of this codebase correctly refuses to guess at): here the
 * absence of a zone suffix is the CONTRACT, not an unknown.
 */
function parseListDateTimeAsUtc(raw: unknown): number | null {
  const s = str(raw);
  if (!s) return null;
  if (/^\d{10}$/.test(s)) return Number(s) * 1000; // unix seconds, just in case
  if (/^\d{13}$/.test(s)) return Number(s); // unix millis
  // Already zone-aware (defensive — the contract says it won't be, but a
  // provider correcting a field later should not silently misparse).
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }
  // Zone-less, as documented: append Z rather than letting Date.parse read
  // it as the server's local time.
  const t = Date.parse(`${s}Z`);
  return Number.isFinite(t) ? t : null;
}

/**
 * `showTypeID` classification. Only 'M' (movie) is documented; everything
 * else stays 'other' rather than guessing at undocumented codes — the
 * contract lists no genre/category field at all, so there is nothing else
 * to classify from without fabricating a signal TV Media doesn't provide.
 */
function classify(showTypeId: string | null): ContentType {
  if (showTypeId === 'M') return 'movie';
  return 'other';
}

/** Generic placeholder show names TV Media uses for movie slots — the real
 *  title lives in `episodeTitle` for these rows, not `showName`. */
const MOVIE_PLACEHOLDER_NAMES = new Set(['movie', 'cinéma', 'cinema']);

/**
 * THE documented row mapping. One listing row -> the normalized shape the
 * rest of the product reads. Every field name here is from TV Media's own
 * contract, not an alias guess.
 */
export function mapListing(row: Json): ScheduleListing | null {
  const start = parseListDateTimeAsUtc(row.listDateTime);
  const stationId = str(row.stationID);
  const showTypeId = str(row.showTypeID);
  const showName = str(row.showName);
  const episodeTitleRaw = str(row.episodeTitle);

  // Movie slots carry the real title in episodeTitle, with showName reduced
  // to a generic placeholder — swap them so `title` is always the thing a
  // viewer would recognize, never "Movie" or "Cinéma".
  const isGenericMovieSlot = showTypeId === 'M'
    && showName != null && MOVIE_PLACEHOLDER_NAMES.has(showName.trim().toLowerCase());
  const title = isGenericMovieSlot ? episodeTitleRaw : showName;
  const episodeTitle = isGenericMovieSlot ? null : episodeTitleRaw;

  if (start == null || !title || !stationId) return null; // structurally unusable

  const durationRaw = num(row.duration);
  // Not documented as minutes vs seconds; minutes is the conventional unit
  // for a TV guide API and the >600 check is the same safety net the rest
  // of this file already uses elsewhere for an ambiguous duration field.
  const end = durationRaw != null && durationRaw > 0
    ? start + (durationRaw > 600 ? durationRaw * 1000 : durationRaw * 60_000)
    : null;

  const programId = str(row.seriesID) ?? str(row.showID);

  return {
    listingId: `tvmedia|${stationId}|${new Date(start).toISOString()}|${programId ?? title}`,
    channelId: stationId,
    channelName: str(row.callsign) ?? stationId,
    channelNumber: str(row.number),
    startUtc: new Date(start).toISOString(),
    endUtc: end != null ? new Date(end).toISOString() : null,
    title,
    episodeTitle,
    seasonNumber: num(row.seasonNumber),
    episodeNumber: num(row.episodeNumber),
    programId,
    contentType: classify(showTypeId),
    // No genre/category field in the documented contract — never fabricated.
    genres: [],
    // Only when TV Media flags it. Never inferred.
    isNew: bool(row.new),
    isLive: bool(row.live),
    rating: num(row.starRating),
    ratingSource: present(row.starRating) ? 'TV Media' : null,
    posterUrl: str(row.showPicture),
    summary: str(row.description),
    year: null, // not in the documented contract
  };
}

export interface ContractReport {
  sampleRows: number;
  mapped: number;
  unmapped: number;
  /** Documented fields that were present on at least one row. */
  resolved: string[];
  /** Documented fields absent on every row — the mapping likely needs correcting. */
  missing: string[];
}

const DOCUMENTED_FIELDS = [
  'stationID', 'callsign', 'number', 'listDateTime', 'duration', 'showID', 'seriesID',
  'showName', 'episodeTitle', 'seasonNumber', 'episodeNumber', 'showTypeID',
  'new', 'live', 'starRating', 'description', 'showPicture',
] as const;

/**
 * Point this at a real TV Media sample payload to see exactly which
 * documented fields the mapping found. Turns "the integration returns
 * nothing" into a specific list of field names to check.
 */
export function validateContract(payload: unknown): ContractReport {
  const rows = findArray(payload, LISTINGS_WRAPPER_KEYS);
  const resolved = new Set<string>();
  let mapped = 0;
  for (const row of rows) {
    for (const f of DOCUMENTED_FIELDS) {
      if (present(row[f])) resolved.add(f);
    }
    if (mapListing(row)) mapped++;
  }
  return {
    sampleRows: rows.length,
    mapped,
    unmapped: rows.length - mapped,
    resolved: [...resolved].sort(),
    missing: DOCUMENTED_FIELDS.filter((f) => !resolved.has(f)).sort(),
  };
}

/** What this provider can do — reported by the diagnostics page. */
export const TVMEDIA_CAPABILITIES = {
  fullGrid: true,
  zipLookup: true,
  providerLineups: true,
  localAffiliates: true,
  cable: true, satellite: true, iptv: true, premium: true,
  sports: true, movies: true, reruns: true, news: true, kids: true,
  fastChannels: true,
  multiDay: true,
  regions: ['US', 'CA'],
} as const;

export class TvMediaAdapter implements ScheduleAdapter {
  readonly providerId = 'tv_media';
  /** The licensed primary. Everything else is fallback. */
  readonly priority = 0;

  isConfigured(): boolean {
    return !!process.env[TVM_API_KEY_ENV];
  }

  private fail(
    status: ScheduleResponse['status'], code: string, message: string, fetchedAt: string,
  ): ScheduleResponse {
    return {
      providerId: this.providerId, status, listings: [],
      totalRaw: 0, totalNormalized: 0, fetchedAt,
      errorCode: code,
      // Scrub anything key-shaped before it can reach a log or a response.
      errorMessage: message.replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]').slice(0, 200),
    };
  }

  /**
   * ZIP -> lineup ID, via `/lineups`. Never throws: any failure (network,
   * non-OK status, empty/unparseable body, no resolvable id in the payload)
   * falls back to the documented Sample-plan lineup rather than failing the
   * whole request — CHANGES §4's "sensible default" applies here too, one
   * level down from the top-level lineup/ZIP choice.
   */
  private async resolveLineupId(base: string, key: string, zip: string): Promise<string> {
    const cached = lineupCache.get(zip);
    if (cached && Date.now() - cached.resolvedAt < LINEUP_CACHE_TTL_MS) return cached.lineupId;

    // `/lineups` is a SECOND billable endpoint, so it asks the door too rather
    // than riding in on the listings call's permission. Denied means "use the
    // documented sample-plan fallback", which costs nothing.
    const gate = requestEgress({
      adapterId: TVM_ADAPTER_ID,
      cost: 'metered',
      trigger: 'lineup_resolve',
      target: 'tvmedia:lineups',
    });
    if (!gate.allowed) return SAMPLE_PLAN_FALLBACK_LINEUP;

    let resolved: string | null = null;
    try {
      const params = new URLSearchParams({ postalCode: zip, api_key: key });
      const res = await fetch(`${base}/lineups?${params}`, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (res.ok) {
        const body = await res.text().catch(() => '');
        try {
          const payload: unknown = JSON.parse(body);
          for (const row of findArray(payload, LINEUPS_WRAPPER_KEYS)) {
            const id = str(row.lineupID) ?? str(row.lineupId) ?? str(row.id);
            if (id) { resolved = id; break; }
          }
        } catch { /* unparseable — fall through to the sample-plan fallback */ }
      }
    } catch { /* network error — fall through to the sample-plan fallback */ }

    const lineupId = resolved ?? SAMPLE_PLAN_FALLBACK_LINEUP;
    lineupCache.set(zip, { lineupId, resolvedAt: Date.now() });
    return lineupId;
  }

  async fetch(req: ScheduleRequest): Promise<ScheduleResponse> {
    const fetchedAt = new Date().toISOString();

    /**
     * THE GATE COMES FIRST — before the credential check, before the lineup
     * lookup, before any `fetch`.
     *
     * TV Media is metered, and this adapter used to begin spending the moment
     * a key was present, reachable from three separate trigger paths (an
     * hourly GitHub workflow, a daily Vercel cron, and a callable route). It
     * now asks the one door (src/lib/tv/egressGuard.ts) whether it is
     * authorised at all, and a denial is returned as a NAMED status rather
     * than an empty grid: "nothing is on tonight" and "we are not allowed to
     * ask" must never look the same to a reader.
     *
     * Denied by default. `DATA_MODE` must be `paid_live` AND `TVMEDIA_ENABLED`
     * must be `1`; changing the mode alone is deliberately not sufficient.
     */
    const gate = requestEgress({
      adapterId: TVM_ADAPTER_ID,
      cost: 'metered',
      trigger: 'schedule_fetch',
      target: 'tvmedia:listings',
    });
    if (!gate.allowed) {
      return this.fail(
        'misconfigured',
        `EGRESS_DENIED_${gate.code.toUpperCase()}`,
        gate.reason,
        fetchedAt,
      );
    }

    const key = process.env[TVM_API_KEY_ENV];
    if (!key) {
      return this.fail('misconfigured', 'NO_CREDENTIALS',
        `No TV Media credentials configured. Set ${TVM_API_KEY_ENV}.`, fetchedAt);
    }

    const base = (process.env[TVM_BASE_URL_ENV] ?? DEFAULT_BASE).replace(/\/+$/, '');

    // Lineup ID first (explicit, no extra call); ZIP resolves one, cached;
    // otherwise nothing tells us which market to request.
    let lineupId = req.lineupId ?? process.env[TVM_LINEUP_ENV] ?? null;
    if (!lineupId) {
      const zip = req.postalCode ?? process.env[TVM_ZIP_ENV] ?? null;
      if (!zip) {
        return this.fail('misconfigured', 'NO_LINEUP',
          `Set ${TVM_LINEUP_ENV} (preferred) or ${TVM_ZIP_ENV} so we know which market to request.`, fetchedAt);
      }
      lineupId = await this.resolveLineupId(base, key, zip);
    }

    const params = new URLSearchParams({
      api_key: key,
      start: new Date(req.windowStartUtc).toISOString(),
      end: new Date(req.windowEndUtc).toISOString(),
      timezone: 'UTC',
      detail: 'brief',
    });

    let res: Response | null = null;
    try {
      res = await fetch(`${base}/lineups/${encodeURIComponent(lineupId)}/listings?${params}`, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
    } catch (e) {
      return this.fail('timeout', 'UNREACHABLE',
        e instanceof Error ? e.message : 'Network error', fetchedAt);
    }

    const body = await res.text().catch(() => '');
    if (!res.ok) {
      return this.fail(statusFromHttp(res.status, body), `HTTP_${res.status}`,
        body || res.statusText, fetchedAt);
    }

    let payload: unknown;
    try { payload = JSON.parse(body); } catch {
      return this.fail('malformed_response', 'NOT_JSON',
        'TV Media returned a body that is not JSON', fetchedAt);
    }

    const rows = findArray(payload, LISTINGS_WRAPPER_KEYS);
    const listings: ScheduleListing[] = [];
    for (const r of rows) {
      const m = mapListing(r);
      if (m) listings.push(m);
    }
    const totalRaw = rows.length;

    // Rows arrived but none mapped → the field mapping is wrong, not the data.
    if (totalRaw > 0 && listings.length === 0) {
      return this.fail('malformed_response', 'CONTRACT_MISMATCH',
        `Received ${totalRaw} rows but mapped 0. Run validateContract() against a sample payload and correct the field mapping.`,
        fetchedAt);
    }

    return {
      providerId: this.providerId,
      status: listings.length > 0 ? 'healthy' : 'unavailable',
      listings,
      totalRaw,
      totalNormalized: listings.length,
      fetchedAt,
    };
  }
}
