import 'server-only';
import type {
  ScheduleAdapter, ScheduleRequest, ScheduleResponse, ScheduleListing, ContentType,
} from '../schedule';
import { statusFromHttp } from '../status';
import { requestEgress } from '@/lib/tv/egressGuard';

/**
 * TVMAZE — a SUPPLEMENTARY premiere feed. Explicitly NOT a listings grid.
 *
 * Measured against the live API: `/schedule?country=US` returns ~42 rows for an
 * ENTIRE US day across ~20 networks. It carries first-run episodes only — no
 * reruns, no syndication, no movies, no daytime, no local affiliates. The
 * product previously treated this as the national schedule, which is why a
 * six-hour window rendered a single card.
 *
 * It stays in the chain because first-run episodes with community ratings are
 * genuinely useful, but its `priority` puts it BEHIND any real grid provider,
 * and `COVERAGE` documents the limit so no future caller mistakes it again.
 */

export const COVERAGE = {
  isFullGrid: false,
  typicalRowsPerUsDay: 42,
  carries: ['first-run episodes on major networks'],
  omits: ['reruns', 'syndication', 'movies', 'daytime', 'local affiliates', 'most cable'],
} as const;

interface MazeShow {
  id: number; name?: string; type?: string; genres?: string[];
  rating?: { average?: number | null };
  image?: { medium?: string; original?: string } | null;
  summary?: string | null;
  network?: { name?: string } | null;
  webChannel?: { name?: string } | null;
}
interface MazeAiring {
  id: number; airstamp?: string; runtime?: number | null;
  name?: string | null; season?: number | null; number?: number | null;
  show?: MazeShow | null;
}

function classify(t: string | undefined, genres: string[]): ContentType {
  const ty = (t ?? '').toLowerCase();
  const g = genres.map((x) => x.toLowerCase());
  if (ty === 'movie') return 'movie';
  if (ty === 'sports' || g.includes('sports')) return 'sports';
  if (ty === 'news') return 'news';
  if (g.includes('children') || g.includes('family')) return 'kids';
  if (ty === 'scripted' || ty === 'animation' || ty === 'reality') return 'series';
  return 'other';
}

const strip = (h: string | null | undefined): string | null => {
  if (!h) return null;
  const t = h.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
};

/** The id the egress guard and the data-mode gate know this adapter by. */
export const TVMAZE_ADAPTER_ID = 'tvmaze';

export class TvmazeAdapter implements ScheduleAdapter {
  readonly providerId = 'tvmaze_premieres';
  /** Behind any real grid. It supplements; it never substitutes. */
  readonly priority = 50;

  /** No key required, so it is always "configured" — availability is the question. */
  isConfigured(): boolean { return true; }

  async fetch(req: ScheduleRequest): Promise<ScheduleResponse> {
    const fetchedAt = new Date().toISOString();

    // Free, but it still asks. TVmaze costs nothing, so the interesting case
    // is not money — it is that `fixture` mode and preview deployments must
    // reach NOTHING, and an adapter that decides for itself whether that
    // applies to it is an adapter that will get it wrong. One door, no
    // exemptions.
    const gate = requestEgress({
      adapterId: TVMAZE_ADAPTER_ID, cost: 'free',
      trigger: 'schedule_fetch', target: 'tvmaze:schedule',
    });
    if (!gate.allowed) {
      return {
        providerId: this.providerId, status: 'misconfigured', listings: [],
        totalRaw: 0, totalNormalized: 0, fetchedAt,
        errorCode: `EGRESS_DENIED_${gate.code.toUpperCase()}`, errorMessage: gate.reason,
      };
    }

    const days = new Set<string>();
    for (let t = req.windowStartUtc; t <= req.windowEndUtc + 86_400_000; t += 86_400_000) {
      days.add(new Date(t).toISOString().slice(0, 10));
    }

    let totalRaw = 0;
    const listings: ScheduleListing[] = [];
    const failures: string[] = [];

    for (const date of days) {
      const url = `https://api.tvmaze.com/schedule?country=${encodeURIComponent(req.region)}&date=${date}`;
      const res = await fetch(url, { next: { revalidate: 1800 } }).catch(() => null);
      if (!res) { failures.push(`${date}: unreachable`); continue; }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        failures.push(`${date}: HTTP ${res.status}`);
        // A rate limit or block on ANY day is reported, never swallowed.
        const s = statusFromHttp(res.status, body);
        if (s === 'rate_limited' || s === 'provider_blocked') {
          return {
            providerId: this.providerId, status: s, listings: [],
            totalRaw: 0, totalNormalized: 0, fetchedAt,
            errorCode: `HTTP_${res.status}`, errorMessage: failures.join('; ').slice(0, 200),
          };
        }
        continue;
      }
      let rows: MazeAiring[];
      try {
        const j = await res.json();
        if (!Array.isArray(j)) { failures.push(`${date}: not an array`); continue; }
        rows = j as MazeAiring[];
      } catch { failures.push(`${date}: unparsable`); continue; }

      totalRaw += rows.length;
      for (const a of rows) {
        const show = a.show;
        const channel = show?.network?.name ?? show?.webChannel?.name ?? null;
        if (!show || !channel || !a.airstamp) continue;
        const start = Date.parse(a.airstamp);
        if (!Number.isFinite(start)) continue;
        const genres = show.genres ?? [];
        listings.push({
          listingId: `tvmaze|${a.id}`,
          channelId: `tvmaze:${channel.toLowerCase()}`,
          channelName: channel,
          startUtc: new Date(start).toISOString(),
          endUtc: a.runtime ? new Date(start + a.runtime * 60_000).toISOString() : null,
          title: show.name ?? 'Untitled',
          episodeTitle: a.name ?? null,
          seasonNumber: a.season ?? null,
          episodeNumber: a.number ?? null,
          programId: `tvmaze-ep-${a.id}`,
          contentType: classify(show.type, genres),
          genres,
          // TVmaze's country schedule is a PREMIERE feed, so every row on it is
          // by definition a first airing. This is source-confirmed, not guessed.
          isNew: true,
          rating: typeof show.rating?.average === 'number' ? show.rating.average : null,
          ratingSource: 'TVmaze community',
          posterUrl: show.image?.medium ?? show.image?.original ?? null,
          summary: strip(show.summary),
        });
      }
    }

    const status = failures.length > 0 && listings.length > 0
      ? 'partial'
      : listings.length > 0 ? 'healthy' : failures.length > 0 ? 'unavailable' : 'unavailable';

    return {
      providerId: this.providerId, status, listings,
      totalRaw, totalNormalized: listings.length, fetchedAt,
      ...(failures.length > 0
        ? { errorCode: 'PARTIAL_DAYS', errorMessage: failures.join('; ').slice(0, 200) }
        : {}),
    };
  }
}
