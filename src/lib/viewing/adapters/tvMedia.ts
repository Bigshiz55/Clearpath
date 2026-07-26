import 'server-only';
import type {
  ScheduleAdapter, ScheduleRequest, ScheduleResponse, ScheduleListing, ContentType,
} from '../schedule';
import { statusFromHttp } from '../status';

/**
 * TV MEDIA — WatchVerd1ct's licensed production listings provider.
 *
 * TV Media (tvmedia.ca) licenses North American TV listings: full lineups by
 * postal/ZIP code and provider, including local affiliates, cable, satellite,
 * IPTV, premium channels, sports, movies, reruns, news, kids and FAST channels.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ONE HONEST CAVEAT, DELIBERATELY ISOLATED
 *
 * This adapter was written before we held API credentials, so the exact JSON
 * field names below are an INFORMED MAPPING, not a verified one. Every
 * provider-specific assumption lives in `FIELD_MAP` and `mapListing()` — two
 * adjacent, self-contained pieces. When the API docs arrive, correcting the
 * integration is an edit to those and nothing else: no route, component, test,
 * ranking rule or contract changes.
 *
 * `validateContract()` exists for exactly that moment: point it at a real
 * sample payload and it reports which mapped fields resolved and which did
 * not, so the mapping can be corrected in one pass instead of by trial and
 * error against a live page.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Credentials are server-only, never logged, never returned in an error body,
 * never sent to the client.
 */

export const TVM_API_KEY_ENV = 'TVMEDIA_API_KEY';
export const TVM_BASE_URL_ENV = 'TVMEDIA_BASE_URL';
export const TVM_LINEUP_ENV = 'TVMEDIA_LINEUP_ID';
export const TVM_ZIP_ENV = 'TVMEDIA_DEFAULT_ZIP';

/** Sensible default; overridable so a sandbox/staging host needs no code change. */
const DEFAULT_BASE = 'https://api.tvmedia.ca/v1';

/**
 * Field aliases. Each entry lists the names we will accept, most likely first.
 * Providers differ on casing and naming; accepting several removes a whole
 * class of "integration returns zero rows" failures.
 */
const FIELD_MAP = {
  listingsArray: ['listings', 'programs', 'schedule', 'events', 'data', 'results'],
  channelsArray: ['channels', 'stations', 'lineup'],
  channelId: ['channelId', 'stationId', 'id', 'callSign', 'callsign'],
  channelName: ['channelName', 'stationName', 'name', 'callSign', 'callsign'],
  channelNumber: ['channelNumber', 'number', 'displayNumber', 'chNum'],
  startTime: ['startTime', 'start', 'startDateTime', 'airDateTime', 'air_time', 'begin'],
  endTime: ['endTime', 'end', 'endDateTime', 'stopTime'],
  duration: ['duration', 'runTime', 'runtime', 'length'],
  title: ['title', 'programTitle', 'name', 'showName'],
  episodeTitle: ['episodeTitle', 'subtitle', 'episodeName', 'subTitle'],
  season: ['seasonNumber', 'season', 'seasonNum'],
  episode: ['episodeNumber', 'episode', 'episodeNum'],
  programId: ['programId', 'progId', 'seriesId', 'id', 'uid'],
  description: ['description', 'synopsis', 'shortDescription', 'desc', 'plot'],
  genres: ['genres', 'categories', 'genre', 'category'],
  showType: ['showType', 'type', 'programType', 'contentType'],
  isNew: ['isNew', 'new', 'firstRun'],
  isLive: ['isLive', 'live'],
  year: ['releaseYear', 'year', 'productionYear'],
  image: ['image', 'thumbnail', 'poster', 'imageUrl', 'artwork'],
  rating: ['rating', 'starRating', 'userRating'],
} as const;

type Json = Record<string, unknown>;

/** First present, non-empty alias. */
function field(obj: Json, aliases: readonly string[]): unknown {
  for (const k of aliases) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}
const str = (v: unknown): string | null =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null;
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown): boolean =>
  v === true || v === 'true' || v === 1 || v === '1' || v === 'Y';

/** Find the listings array wherever the payload happens to nest it. */
function findArray(payload: unknown, aliases: readonly string[]): Json[] {
  if (Array.isArray(payload)) return payload as Json[];
  if (!payload || typeof payload !== 'object') return [];
  const o = payload as Json;
  for (const k of aliases) {
    const v = o[k];
    if (Array.isArray(v)) return v as Json[];
  }
  // One level deeper — payloads often wrap in { data: { listings: [...] } }.
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') {
      const inner = findArray(v, aliases);
      if (inner.length > 0) return inner;
    }
  }
  return [];
}

function classify(showType: string | null, genres: string[]): ContentType {
  const t = (showType ?? '').toLowerCase();
  const g = genres.map((x) => x.toLowerCase()).join(' ');
  if (t.includes('movie') || t === 'mv' || g.includes('movie')) return 'movie';
  if (t.includes('sport') || g.includes('sport')) return 'sports';
  if (t.includes('news') || g.includes('news')) return 'news';
  if (g.includes('children') || g.includes('kids') || g.includes('family')) return 'kids';
  if (t.includes('special')) return 'special';
  if (t.includes('series') || t.includes('episode') || t === 'ep') return 'series';
  return 'other';
}

/**
 * Normalise a provider timestamp to a UTC instant.
 *
 * A value with no zone is REJECTED rather than assumed — silently reading a
 * naive timestamp as server-local is how a schedule ends up hours off for
 * everyone outside the server's region.
 */
function instant(raw: unknown): number | null {
  const s = str(raw);
  if (!s) return null;
  if (/^\d{10}$/.test(s)) return Number(s) * 1000;  // unix seconds
  if (/^\d{13}$/.test(s)) return Number(s);         // unix millis
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/**
 * THE provider-specific mapping. Correct this against the real API docs and the
 * rest of the product needs no change.
 */
export function mapListing(row: Json, channelHint?: Json): ScheduleListing | null {
  const start = instant(field(row, FIELD_MAP.startTime));
  const title = str(field(row, FIELD_MAP.title));
  const chSource = channelHint ?? row;
  const channelId = str(field(chSource, FIELD_MAP.channelId));
  if (start == null || !title || !channelId) return null; // structurally unusable

  let end = instant(field(row, FIELD_MAP.endTime));
  if (end == null) {
    const d = num(field(row, FIELD_MAP.duration));
    // Duration may be minutes or seconds; >600 is implausible as minutes.
    if (d != null && d > 0) end = start + (d > 600 ? d * 1000 : d * 60_000);
  }

  const rawGenres = field(row, FIELD_MAP.genres);
  const genres = Array.isArray(rawGenres)
    ? rawGenres.map((g) => str(g) ?? '').filter(Boolean)
    : str(rawGenres) ? [str(rawGenres)!] : [];
  const showType = str(field(row, FIELD_MAP.showType));

  return {
    listingId: `tvmedia|${channelId}|${new Date(start).toISOString()}|${str(field(row, FIELD_MAP.programId)) ?? title}`,
    channelId,
    channelName: str(field(chSource, FIELD_MAP.channelName)) ?? channelId,
    channelNumber: str(field(chSource, FIELD_MAP.channelNumber)),
    startUtc: new Date(start).toISOString(),
    endUtc: end != null ? new Date(end).toISOString() : null,
    title,
    episodeTitle: str(field(row, FIELD_MAP.episodeTitle)),
    seasonNumber: num(field(row, FIELD_MAP.season)),
    episodeNumber: num(field(row, FIELD_MAP.episode)),
    programId: str(field(row, FIELD_MAP.programId)),
    contentType: classify(showType, genres),
    genres,
    // Only when the PROVIDER flags it. Never inferred, per the data-honesty rule.
    isNew: bool(field(row, FIELD_MAP.isNew)),
    isLive: bool(field(row, FIELD_MAP.isLive)),
    rating: num(field(row, FIELD_MAP.rating)),
    ratingSource: field(row, FIELD_MAP.rating) !== undefined ? 'TV Media' : null,
    posterUrl: str(field(row, FIELD_MAP.image)),
    summary: str(field(row, FIELD_MAP.description)),
    year: num(field(row, FIELD_MAP.year)),
  };
}

export interface ContractReport {
  sampleRows: number;
  mapped: number;
  unmapped: number;
  /** Fields that resolved on at least one row. */
  resolved: string[];
  /** Fields that resolved on NO row — the mapping likely needs correcting. */
  missing: string[];
}

/**
 * Point this at a real TV Media sample payload to see exactly which fields the
 * mapping found. Turns "the integration returns nothing" into a specific list
 * of field names to fix.
 */
export function validateContract(payload: unknown): ContractReport {
  const rows = findArray(payload, FIELD_MAP.listingsArray);
  const resolved = new Set<string>();
  let mapped = 0;
  for (const row of rows) {
    for (const [key, aliases] of Object.entries(FIELD_MAP)) {
      if (key === 'listingsArray' || key === 'channelsArray') continue;
      if (field(row, aliases as readonly string[]) !== undefined) resolved.add(key);
    }
    if (mapListing(row)) mapped++;
  }
  const all = Object.keys(FIELD_MAP).filter((k) => k !== 'listingsArray' && k !== 'channelsArray');
  return {
    sampleRows: rows.length,
    mapped,
    unmapped: rows.length - mapped,
    resolved: [...resolved].sort(),
    missing: all.filter((k) => !resolved.has(k)).sort(),
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

  async fetch(req: ScheduleRequest): Promise<ScheduleResponse> {
    const fetchedAt = new Date().toISOString();
    const key = process.env[TVM_API_KEY_ENV];
    if (!key) {
      return this.fail('misconfigured', 'NO_CREDENTIALS',
        `No TV Media credentials configured. Set ${TVM_API_KEY_ENV}.`, fetchedAt);
    }
    const lineup = req.lineupId ?? process.env[TVM_LINEUP_ENV] ?? null;
    const zip = req.postalCode ?? process.env[TVM_ZIP_ENV] ?? null;
    if (!lineup && !zip) {
      return this.fail('misconfigured', 'NO_LINEUP',
        `Set ${TVM_LINEUP_ENV} (preferred) or ${TVM_ZIP_ENV} so we know which market to request.`, fetchedAt);
    }

    const base = (process.env[TVM_BASE_URL_ENV] ?? DEFAULT_BASE).replace(/\/+$/, '');
    const params = new URLSearchParams({
      start: new Date(req.windowStartUtc).toISOString(),
      end: new Date(req.windowEndUtc).toISOString(),
      country: req.region === 'CA' ? 'CA' : 'US',
    });
    if (lineup) params.set('lineupId', lineup);
    else if (zip) params.set('zip', zip);
    if (req.channels?.length) params.set('channels', req.channels.join(','));

    let res: Response | null = null;
    try {
      res = await fetch(`${base}/listings?${params}`, {
        headers: {
          // Sent as a header, never a query parameter — a key in a URL lands in
          // access logs, proxy logs and Referer headers.
          'x-api-key': key,
          authorization: `Bearer ${key}`,
          accept: 'application/json',
        },
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

    // Payloads come either flat (each row carries its channel) or grouped
    // (channels[] each with listings[]). Both are handled.
    const listings: ScheduleListing[] = [];
    let totalRaw = 0;
    const channels = findArray(payload, FIELD_MAP.channelsArray);
    if (channels.length > 0) {
      for (const ch of channels) {
        const rows = findArray(ch, FIELD_MAP.listingsArray);
        totalRaw += rows.length;
        for (const r of rows) {
          const m = mapListing(r, ch);
          if (m) listings.push(m);
        }
      }
    }
    if (listings.length === 0) {
      const rows = findArray(payload, FIELD_MAP.listingsArray);
      totalRaw = Math.max(totalRaw, rows.length);
      for (const r of rows) {
        const m = mapListing(r);
        if (m) listings.push(m);
      }
    }

    // Rows arrived but none mapped → the field mapping is wrong, not the data.
    // Saying so is what makes this correctable in one pass.
    if (totalRaw > 0 && listings.length === 0) {
      return this.fail('malformed_response', 'CONTRACT_MISMATCH',
        `Received ${totalRaw} rows but mapped 0. Run validateContract() against a sample payload and correct FIELD_MAP.`,
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
