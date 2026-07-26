import 'server-only';
import { createHash } from 'node:crypto';
import type {
  ScheduleAdapter, ScheduleRequest, ScheduleResponse, ScheduleListing, ContentType,
} from '../schedule';
import { statusFromHttp } from '../status';

/**
 * SCHEDULES DIRECT — the recommended primary provider.
 *
 * A non-profit that licenses North American listings for exactly this purpose:
 * $25/year, a documented JSON API, full US lineups by postal code including
 * local affiliates, cable, premium and FAST channels, with movies and reruns
 * typed and a ~2-week forward guide. Lawful, cheap, complete and stable — the
 * opposite of the WAF-blocked public grid it replaces.
 *
 * Credentials are SERVER-ONLY (`import 'server-only'` above) and are never
 * logged, never returned in an error message, and never reach the client. The
 * password is sent as a SHA-1 hex digest, which is what the API specifies.
 *
 * Configuration lives in `docs/SCHEDULE_PROVIDERS.md`.
 */

const BASE = 'https://json.schedulesdirect.org/20141201';
const TOKEN_TTL_MS = 20 * 60 * 60 * 1000; // SD tokens last 24h; refresh early.

export const SD_USERNAME_ENV = 'SCHEDULES_DIRECT_USERNAME';
export const SD_PASSWORD_ENV = 'SCHEDULES_DIRECT_PASSWORD';
export const SD_LINEUP_ENV = 'SCHEDULES_DIRECT_LINEUP';

interface SdStation { stationID: string; name?: string; callsign?: string; }
interface SdProgramEntry {
  programID: string;
  airDateTime: string; // ISO with Z
  duration: number;    // seconds
  new?: boolean;
  liveTapeDelay?: string;
  ratings?: { body?: string; code?: string }[];
}
interface SdScheduleBlock { stationID: string; programs?: SdProgramEntry[]; }
interface SdProgramDetail {
  programID: string;
  titles?: { title120?: string }[];
  episodeTitle150?: string;
  descriptions?: { description1000?: { description?: string }[] };
  genres?: string[];
  showType?: string;
  movie?: { year?: string };
  metadata?: { Gracenote?: { season?: number; episode?: number } }[];
}

let cachedToken: { token: string; at: number } | null = null;

/** Scrub anything that could carry a credential out of an error string. */
function safeMessage(raw: string): string {
  return raw.replace(/[A-Fa-f0-9]{32,}/g, '[redacted]').slice(0, 200);
}

function classify(showType: string | undefined, genres: string[] | undefined): ContentType {
  const g = (genres ?? []).map((x) => x.toLowerCase());
  const t = (showType ?? '').toLowerCase();
  if (t.includes('movie') || g.includes('movie')) return 'movie';
  if (g.some((x) => x.includes('sport'))) return 'sports';
  if (g.some((x) => x.includes('news'))) return 'news';
  if (g.some((x) => x.includes('children') || x.includes('kids'))) return 'kids';
  if (t.includes('special')) return 'special';
  if (t.includes('series') || t.includes('episode')) return 'series';
  return 'other';
}

export class SchedulesDirectAdapter implements ScheduleAdapter {
  readonly providerId = 'schedules_direct';
  readonly priority = 0;

  isConfigured(): boolean {
    return !!(process.env[SD_USERNAME_ENV] && process.env[SD_PASSWORD_ENV]);
  }

  private async token(): Promise<{ token: string } | { error: ScheduleResponse }> {
    const now = Date.now();
    if (cachedToken && now - cachedToken.at < TOKEN_TTL_MS) return { token: cachedToken.token };

    const username = process.env[SD_USERNAME_ENV]!;
    const password = process.env[SD_PASSWORD_ENV]!;
    const res = await fetch(`${BASE}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username,
        password: createHash('sha1').update(password).digest('hex'),
      }),
      cache: 'no-store',
    }).catch(() => null);

    const fetchedAt = new Date().toISOString();
    if (!res) {
      return { error: this.fail('timeout', 'TOKEN_UNREACHABLE', 'Could not reach Schedules Direct', fetchedAt) };
    }
    const body = await res.text().catch(() => '');
    if (!res.ok) {
      return { error: this.fail(statusFromHttp(res.status, body), `TOKEN_HTTP_${res.status}`, safeMessage(body), fetchedAt) };
    }
    let parsed: { code?: number; token?: string; message?: string };
    try { parsed = JSON.parse(body); } catch {
      return { error: this.fail('malformed_response', 'TOKEN_NOT_JSON', 'Token response was not JSON', fetchedAt) };
    }
    if (parsed.code !== 0 || !parsed.token) {
      // code 4003 = invalid credentials.
      const status = parsed.code === 4003 ? 'unauthorized' : 'unavailable';
      return { error: this.fail(status, `TOKEN_CODE_${parsed.code}`, safeMessage(parsed.message ?? 'Token refused'), fetchedAt) };
    }
    cachedToken = { token: parsed.token, at: now };
    return { token: parsed.token };
  }

  private fail(
    status: ScheduleResponse['status'], code: string, message: string, fetchedAt: string,
  ): ScheduleResponse {
    return {
      providerId: this.providerId, status, listings: [],
      totalRaw: 0, totalNormalized: 0, fetchedAt,
      errorCode: code, errorMessage: message,
    };
  }

  async fetch(req: ScheduleRequest): Promise<ScheduleResponse> {
    const fetchedAt = new Date().toISOString();
    if (!this.isConfigured()) {
      return this.fail('misconfigured', 'NO_CREDENTIALS',
        `Set ${SD_USERNAME_ENV} and ${SD_PASSWORD_ENV} to enable Schedules Direct`, fetchedAt);
    }
    const lineup = req.lineupId ?? process.env[SD_LINEUP_ENV] ?? null;
    if (!lineup) {
      return this.fail('misconfigured', 'NO_LINEUP',
        `Set ${SD_LINEUP_ENV} to the lineup id for this deployment's default market`, fetchedAt);
    }

    const t = await this.token();
    if ('error' in t) return t.error;
    const headers = { token: t.token, 'content-type': 'application/json' };

    // 1. stations on this lineup
    const mapRes = await fetch(`${BASE}/lineups/${encodeURIComponent(lineup)}`, { headers, cache: 'no-store' }).catch(() => null);
    if (!mapRes) return this.fail('timeout', 'LINEUP_UNREACHABLE', 'Lineup request failed', fetchedAt);
    const mapBody = await mapRes.text().catch(() => '');
    if (!mapRes.ok) {
      return this.fail(statusFromHttp(mapRes.status, mapBody), `LINEUP_HTTP_${mapRes.status}`, safeMessage(mapBody), fetchedAt);
    }
    let stations: SdStation[] = [];
    try {
      const parsed = JSON.parse(mapBody) as { stations?: SdStation[] };
      stations = parsed.stations ?? [];
    } catch {
      return this.fail('malformed_response', 'LINEUP_NOT_JSON', 'Lineup response was not JSON', fetchedAt);
    }
    if (stations.length === 0) {
      return this.fail('unavailable', 'LINEUP_EMPTY', `Lineup ${lineup} lists no stations`, fetchedAt);
    }

    const byId = new Map(stations.map((s) => [s.stationID, s]));
    const wanted = req.channels && req.channels.length > 0
      ? stations.filter((s) => req.channels!.some((c) =>
          (s.callsign ?? '').toLowerCase().includes(c.toLowerCase()) ||
          (s.name ?? '').toLowerCase().includes(c.toLowerCase())))
      : stations;

    // 2. schedules for the UTC days the window touches
    const days = new Set<string>();
    for (let t0 = req.windowStartUtc; t0 <= req.windowEndUtc + 86_400_000; t0 += 86_400_000) {
      days.add(new Date(t0).toISOString().slice(0, 10));
    }
    const schedRes = await fetch(`${BASE}/schedules`, {
      method: 'POST', headers, cache: 'no-store',
      body: JSON.stringify(wanted.map((s) => ({ stationID: s.stationID, date: [...days] }))),
    }).catch(() => null);
    if (!schedRes) return this.fail('timeout', 'SCHEDULES_UNREACHABLE', 'Schedules request failed', fetchedAt);
    const schedBody = await schedRes.text().catch(() => '');
    if (!schedRes.ok) {
      return this.fail(statusFromHttp(schedRes.status, schedBody), `SCHEDULES_HTTP_${schedRes.status}`, safeMessage(schedBody), fetchedAt);
    }
    let blocks: SdScheduleBlock[] = [];
    try { blocks = JSON.parse(schedBody) as SdScheduleBlock[]; } catch {
      return this.fail('malformed_response', 'SCHEDULES_NOT_JSON', 'Schedules response was not JSON', fetchedAt);
    }

    const entries = blocks.flatMap((b) => (b.programs ?? []).map((p) => ({ block: b, p })));
    const totalRaw = entries.length;

    // 3. program details, batched (SD accepts up to 5000 ids per call)
    const ids = [...new Set(entries.map((e) => e.p.programID))].slice(0, 5000);
    const details = new Map<string, SdProgramDetail>();
    if (ids.length > 0) {
      const dRes = await fetch(`${BASE}/programs`, {
        method: 'POST', headers, cache: 'no-store', body: JSON.stringify(ids),
      }).catch(() => null);
      // Detail failure is NOT fatal: it is enrichment. We still return the
      // schedule, because availability must never depend on enrichment.
      if (dRes?.ok) {
        const dBody = await dRes.text().catch(() => '');
        try {
          for (const d of JSON.parse(dBody) as SdProgramDetail[]) details.set(d.programID, d);
        } catch { /* keep the schedule; titles fall back to the program id */ }
      }
    }

    const listings: ScheduleListing[] = [];
    for (const { block, p } of entries) {
      const start = Date.parse(p.airDateTime);
      if (!Number.isFinite(start)) continue;
      const station = byId.get(block.stationID);
      const d = details.get(p.programID);
      const title = d?.titles?.[0]?.title120 ?? null;
      // No title from either source → we cannot honestly render a card.
      if (!title) continue;
      const meta = d?.metadata?.[0]?.Gracenote;
      listings.push({
        listingId: `${block.stationID}|${p.airDateTime}|${p.programID}`,
        channelId: block.stationID,
        channelName: station?.callsign ?? station?.name ?? block.stationID,
        startUtc: new Date(start).toISOString(),
        endUtc: p.duration ? new Date(start + p.duration * 1000).toISOString() : null,
        title,
        episodeTitle: d?.episodeTitle150 ?? null,
        seasonNumber: meta?.season ?? null,
        episodeNumber: meta?.episode ?? null,
        programId: p.programID,
        contentType: classify(d?.showType, d?.genres),
        genres: d?.genres ?? [],
        // Only when the PROVIDER says so — never inferred.
        isNew: p.new === true,
        isLive: p.liveTapeDelay === 'Live',
        summary: d?.descriptions?.description1000?.[0]?.description ?? null,
        year: d?.movie?.year ? Number(d.movie.year) || null : null,
        rating: null,
        ratingSource: null,
        posterUrl: null,
      });
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
