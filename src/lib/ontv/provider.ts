/**
 * ScheduleProvider — the abstraction the On TV feature retrieves schedule data
 * through. A production adapter wraps the real TVmaze/Gracenote pipeline; a mock
 * adapter (mockProvider.ts) gives deterministic tests + a dev dashboard without a
 * live feed. All results carry freshness metadata (see DataFreshness).
 */
import type { Airing, Channel, Program } from './types';

export interface DataFreshness {
  fetchedAt: string;       // ISO — when WE fetched
  sourceUpdatedAt: string; // ISO — when the SOURCE last changed
  cacheExpiresAt: string;  // ISO — when this result should be refetched
  stale: boolean;
}

export interface AiringBundle {
  airings: Airing[];
  /** Programs referenced by the airings, keyed by contentId (no duplication). */
  programs: Record<string, Program>;
  channels: Record<string, Channel>;
  freshness: DataFreshness;
}

export interface UpcomingOpts {
  /** now epoch ms (injected so the core stays clock-free / testable). */
  now: number;
  /** how far ahead to look, ms. */
  horizonMs: number;
  networks?: string[];
  movieOnly?: boolean;
  region?: string | null;
}

export interface ScheduleProvider {
  readonly name: string;
  getChannels(region?: string | null): Promise<Channel[]>;
  getAirings(opts: UpcomingOpts): Promise<AiringBundle>;
  getCurrentAirings(now: number, region?: string | null): Promise<AiringBundle>;
  getUpcomingAirings(opts: UpcomingOpts): Promise<AiringBundle>;
  searchAirings(text: string, opts: UpcomingOpts): Promise<AiringBundle>;
  getAiringsForProgram(contentId: string, opts: UpcomingOpts): Promise<AiringBundle>;
}

/** Typed provider errors so the UI can render precise error states. */
export class ScheduleError extends Error {
  constructor(public kind: 'source_unavailable' | 'partial' | 'invalid_timezone' | 'no_provider', message: string) {
    super(message);
    this.name = 'ScheduleError';
  }
}

/** Compute freshness. Near-future windows expire faster than distant ones. */
export function freshness(fetchedAtMs: number, sourceUpdatedAtMs: number, horizonMs: number): DataFreshness {
  // Current / near-future (<3h) refresh every 5 min; distant every 30 min.
  const ttlMs = horizonMs <= 3 * 3_600_000 ? 5 * 60_000 : 30 * 60_000;
  const expires = fetchedAtMs + ttlMs;
  return {
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    sourceUpdatedAt: new Date(sourceUpdatedAtMs).toISOString(),
    cacheExpiresAt: new Date(expires).toISOString(),
    stale: false,
  };
}

export function isStale(f: DataFreshness, now: number): boolean {
  return now > Date.parse(f.cacheExpiresAt);
}
