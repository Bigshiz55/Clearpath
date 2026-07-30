import type {
  ScheduleAdapter, ScheduleRequest, ScheduleResponse, ScheduleListing, ContentType,
} from '../schedule';
import type { SourceStatus } from '../status';

/**
 * MOCK SCHEDULE ADAPTER — a full-size national grid, deterministically generated.
 *
 * This exists so every part of the product downstream of a provider can be
 * built, tested and demonstrated BEFORE credentials exist: the six-hour view,
 * sorting, filtering, pagination, load-more, dedup of repeated airings, and
 * every failure mode. Without it, "is Live TV fixed?" would be unanswerable
 * until a contract is signed.
 *
 * It is honest about itself: `providerId` is `mock_grid`, and it is only ever
 * registered when `MOCK_SCHEDULE=1`. It can never be mistaken for real
 * listings in production, and it never claims `healthy` on a real deployment.
 *
 * Deterministic (seeded, no Math.random) so a rendered page is reproducible and
 * screenshot diffs are stable.
 */

export const MOCK_ENV = 'MOCK_SCHEDULE';

/** A realistic national lineup: broadcast, cable, premium, sports, kids, news, FAST. */
const CHANNELS: { id: string; name: string; number: string; kinds: ContentType[] }[] = [
  { id: 'WCBS', name: 'CBS (WCBS)', number: '2', kinds: ['series', 'news', 'sports'] },
  { id: 'WNBC', name: 'NBC (WNBC)', number: '4', kinds: ['series', 'news'] },
  { id: 'WABC', name: 'ABC (WABC)', number: '7', kinds: ['series', 'news'] },
  { id: 'WNYW', name: 'FOX (WNYW)', number: '5', kinds: ['series', 'sports'] },
  { id: 'WPIX', name: 'The CW (WPIX)', number: '11', kinds: ['series', 'movie'] },
  { id: 'WNET', name: 'PBS (WNET)', number: '13', kinds: ['series', 'kids'] },
  { id: 'AMC', name: 'AMC', number: '254', kinds: ['movie', 'series'] },
  { id: 'AMC2', name: 'AMC2', number: '255', kinds: ['movie'] },
  { id: 'TNT', name: 'TNT', number: '245', kinds: ['movie', 'sports'] },
  { id: 'TBS', name: 'TBS', number: '247', kinds: ['series', 'movie'] },
  { id: 'FX', name: 'FX', number: '248', kinds: ['movie', 'series'] },
  { id: 'USA', name: 'USA Network', number: '242', kinds: ['series', 'sports'] },
  { id: 'SYFY', name: 'Syfy', number: '244', kinds: ['movie', 'series'] },
  { id: 'LIFE', name: 'Lifetime', number: '252', kinds: ['movie'] },
  { id: 'LMN', name: 'Lifetime Movie Network', number: '253', kinds: ['movie'] },
  { id: 'HALL', name: 'Hallmark Channel', number: '312', kinds: ['movie'] },
  { id: 'TCM', name: 'Turner Classic Movies', number: '256', kinds: ['movie'] },
  { id: 'HIST', name: 'History', number: '269', kinds: ['series'] },
  { id: 'DISC', name: 'Discovery', number: '278', kinds: ['series'] },
  { id: 'TLC', name: 'TLC', number: '280', kinds: ['series'] },
  { id: 'FOOD', name: 'Food Network', number: '231', kinds: ['series'] },
  { id: 'ESPN', name: 'ESPN', number: '206', kinds: ['sports'] },
  { id: 'ESPN2', name: 'ESPN2', number: '209', kinds: ['sports'] },
  { id: 'FS1', name: 'FS1', number: '219', kinds: ['sports'] },
  { id: 'NFLN', name: 'NFL Network', number: '212', kinds: ['sports'] },
  { id: 'CNN', name: 'CNN', number: '202', kinds: ['news'] },
  { id: 'MSNBC', name: 'MSNBC', number: '356', kinds: ['news'] },
  { id: 'FNC', name: 'FOX News', number: '360', kinds: ['news'] },
  { id: 'NICK', name: 'Nickelodeon', number: '299', kinds: ['kids'] },
  { id: 'CN', name: 'Cartoon Network', number: '296', kinds: ['kids'] },
  { id: 'DISN', name: 'Disney Channel', number: '290', kinds: ['kids'] },
  { id: 'HBO', name: 'HBO', number: '501', kinds: ['movie', 'series'] },
  { id: 'HBO2', name: 'HBO2', number: '502', kinds: ['movie'] },
  { id: 'MAX', name: 'Cinemax', number: '515', kinds: ['movie'] },
  { id: 'SHO', name: 'Showtime', number: '545', kinds: ['movie', 'series'] },
  { id: 'STZ', name: 'Starz', number: '525', kinds: ['movie'] },
  { id: 'PLUTO', name: 'Pluto TV Movies', number: '1201', kinds: ['movie'] },
  { id: 'TUBI', name: 'Tubi Classics', number: '1202', kinds: ['movie', 'series'] },
];

const MOVIES = [
  'The Long Afternoon', 'Harbor Lights', 'Nine Lives of Autumn', 'Cold Harvest',
  'The Cartographer', 'Salt and Iron', 'A Quiet Signal', 'Northbound',
  'The Glass Orchard', 'Weather for Flying', 'The Understudy', 'Paper Cities',
];
const SERIES = [
  'Precinct Nine', 'The Restoration', 'Copperline', 'Field Notes',
  'The Inheritance', 'Radio Silence', 'Two Rivers', 'The Long Game',
];
const SPORTS = ['College Football', 'NBA Regular Season', 'Premier League', 'MLB Tonight', 'Boxing Tonight'];
const KIDS = ['Cartoon Hour', 'Adventure Club', 'Story Time', 'Science Kids'];
const NEWS = ['Evening Report', 'The Briefing', 'World Tonight', 'Newsroom Live'];

/** Deterministic hash → index. No Math.random anywhere. */
function pick<T>(arr: T[], seed: number): T {
  let h = 2166136261 ^ seed;
  h = Math.imul(h ^ (h >>> 13), 16777619);
  return arr[Math.abs(h) % arr.length]!;
}

function titleFor(kind: ContentType, seed: number): string {
  switch (kind) {
    case 'movie': return pick(MOVIES, seed);
    case 'sports': return pick(SPORTS, seed);
    case 'kids': return pick(KIDS, seed);
    case 'news': return pick(NEWS, seed);
    default: return pick(SERIES, seed);
  }
}

export interface MockOptions {
  /** Force a failure state, for testing the fallback chain. */
  forceStatus?: SourceStatus;
  /** Cap the channel count, to simulate a thin lineup. */
  channelLimit?: number;
  /** Half-hour slot size in minutes. */
  slotMinutes?: number;
}

export class MockScheduleAdapter implements ScheduleAdapter {
  readonly providerId = 'mock_grid';
  /** Below every real provider — it only runs when nothing real is configured. */
  readonly priority = 90;

  constructor(private readonly opts: MockOptions = {}) {}

  isConfigured(): boolean {
    return process.env[MOCK_ENV] === '1';
  }

  async fetch(req: ScheduleRequest): Promise<ScheduleResponse> {
    const fetchedAt = new Date().toISOString();
    if (this.opts.forceStatus && this.opts.forceStatus !== 'healthy') {
      return {
        providerId: this.providerId, status: this.opts.forceStatus, listings: [],
        totalRaw: 0, totalNormalized: 0, fetchedAt,
        errorCode: 'FORCED', errorMessage: `Mock forced ${this.opts.forceStatus}`,
      };
    }

    const slot = (this.opts.slotMinutes ?? 30) * 60_000;
    const channels = CHANNELS.slice(0, this.opts.channelLimit ?? CHANNELS.length);
    // Start one slot BEFORE the window so there is always something in progress.
    const first = Math.floor(req.windowStartUtc / slot) * slot - slot;
    const listings: ScheduleListing[] = [];

    for (const ch of channels) {
      let t = first;
      let n = 0;
      while (t <= req.windowEndUtc) {
        const seed = (ch.id.charCodeAt(0) * 7919) + t / 60_000 + n;
        const kind = pick(ch.kinds, seed);
        // Movies run two slots; everything else one.
        const slots = kind === 'movie' ? 2 : 1;
        const title = titleFor(kind, seed);
        const isSeries = kind === 'series' || kind === 'kids';
        const season = isSeries ? 1 + (Math.abs(seed) % 6) : null;
        const episode = isSeries ? 1 + (Math.abs(seed >> 3) % 22) : null;
        const programId = isSeries
          ? `MOCK-EP-${title.replace(/\W/g, '')}-S${season}E${episode}`
          : `MOCK-PR-${title.replace(/\W/g, '')}`;
        listings.push({
          listingId: `${ch.id}|${new Date(t).toISOString()}|${programId}`,
          channelId: ch.id,
          channelName: ch.name,
          channelNumber: ch.number,
          startUtc: new Date(t).toISOString(),
          endUtc: new Date(t + slots * slot).toISOString(),
          title,
          episodeTitle: isSeries ? `Episode ${episode}` : null,
          seasonNumber: season,
          episodeNumber: episode,
          programId,
          contentType: kind,
          genres: [kind === 'movie' ? 'Drama' : kind === 'sports' ? 'Sports' : 'Series'],
          // Only ~1 in 4 is flagged new — the rest are reruns, as on real TV.
          isNew: Math.abs(seed) % 4 === 0,
          isLive: kind === 'sports',
          rating: kind === 'news' ? null : 5 + (Math.abs(seed) % 50) / 10,
          ratingSource: kind === 'news' ? null : 'Mock community score',
          // Deliberately sparse: a third have no poster and no synopsis, so the
          // "enrichment must not remove inventory" rule is exercised for real.
          posterUrl: Math.abs(seed) % 3 === 0 ? null : `https://example.invalid/${programId}.jpg`,
          summary: Math.abs(seed) % 3 === 0 ? null : `${title} — mock synopsis for layout verification.`,
          year: kind === 'movie' ? 1975 + (Math.abs(seed) % 50) : null,
        });
        t += slots * slot;
        n++;
      }
    }

    return {
      providerId: this.providerId,
      status: 'healthy',
      listings,
      totalRaw: listings.length,
      totalNormalized: listings.length,
      fetchedAt,
    };
  }
}
