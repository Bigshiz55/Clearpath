/**
 * SCHEDULE STATE — computed from stored timestamps and the current clock.
 *
 * These states are NEVER stored. "On Now" is true only relative to a moment, so
 * persisting it guarantees it goes stale: a programme written as On Now at
 * 2:03 AM ingestion is wrong by 2:04. Storing only absolute instants and
 * deriving state on read is what lets one daily ingestion stay correct all day
 * without another provider call.
 *
 * Pure and clock-injected, so every boundary in the test matrix — starts one
 * minute in the future, starts exactly now, started one minute ago, ends one
 * minute ago, exactly two hours out, two hours and one minute out — is an
 * ordinary assertion rather than a timing-dependent flake.
 */

export type ProgramState = 'on_now' | 'next_two_hours' | 'later' | 'ended' | 'unknown';

/** The window "Coming in the next two hours" covers. */
export const SOON_WINDOW_MS = 2 * 60 * 60 * 1000;

export interface Airing {
  startAtUtc: string;
  /** Null when the provider gave neither an end time nor a duration. */
  endAtUtc: string | null;
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/**
 * Classify one airing against a clock.
 *
 * Boundary rules, stated explicitly because every one of them is a test case:
 *   * `start <= now < end`            → on_now  (inclusive start, exclusive end)
 *   * `end <= now`                    → ended
 *   * `now < start <= now + 2h`       → next_two_hours (inclusive at exactly 2h)
 *   * `start > now + 2h`              → later
 *
 * An airing with no end time cannot be proven to be still running, so once its
 * start has passed it is reported `unknown` rather than guessed into On Now.
 * Inventing a runtime would put a finished programme in a live section.
 */
export function programState(a: Airing, nowMs: number): ProgramState {
  const start = ms(a.startAtUtc);
  if (start == null) return 'unknown';
  const end = ms(a.endAtUtc);

  if (start > nowMs) {
    return start <= nowMs + SOON_WINDOW_MS ? 'next_two_hours' : 'later';
  }
  // Start is in the past (or exactly now).
  if (end == null) return 'unknown';
  return end > nowMs ? 'on_now' : 'ended';
}

/** True for anything a viewer could still start or join. */
export function isViewable(s: ProgramState): boolean {
  return s === 'on_now' || s === 'next_two_hours' || s === 'later';
}

export interface StateBuckets<T> {
  onNow: T[];
  nextTwoHours: T[];
  later: T[];
  ended: T[];
  /** Started, but with no end time — we cannot say whether it is still on. */
  unknown: T[];
}

/**
 * Split a stored schedule into the sections the interface renders.
 *
 * The invariant the product cares about: an airing whose start is in the past
 * NEVER appears in an upcoming section. It is on now, ended, or unknown.
 */
export function bucketByState<T extends Airing>(
  airings: T[],
  nowMs: number,
): StateBuckets<T> {
  const out: StateBuckets<T> = { onNow: [], nextTwoHours: [], later: [], ended: [], unknown: [] };
  for (const a of airings) {
    switch (programState(a, nowMs)) {
      case 'on_now': out.onNow.push(a); break;
      case 'next_two_hours': out.nextTwoHours.push(a); break;
      case 'later': out.later.push(a); break;
      case 'ended': out.ended.push(a); break;
      default: out.unknown.push(a);
    }
  }
  const byStart = (x: Airing, y: Airing) => (ms(x.startAtUtc) ?? 0) - (ms(y.startAtUtc) ?? 0);
  out.onNow.sort(byStart);
  out.nextTwoHours.sort(byStart);
  out.later.sort(byStart);
  return out;
}

/**
 * When the next state change happens, so the client can schedule a recompute
 * instead of polling blindly. Returns null when nothing will change.
 */
export function nextTransitionMs(airings: Airing[], nowMs: number): number | null {
  let soonest: number | null = null;
  const consider = (t: number | null) => {
    if (t == null || t <= nowMs) return;
    if (soonest == null || t < soonest) soonest = t;
  };
  for (const a of airings) {
    consider(ms(a.startAtUtc));
    consider(ms(a.endAtUtc));
    const s = ms(a.startAtUtc);
    if (s != null) consider(s - SOON_WINDOW_MS); // entry into "next two hours"
  }
  return soonest;
}

// ---------------------------------------------------------------------------
// FRESHNESS
// ---------------------------------------------------------------------------

export type Freshness = 'current' | 'refresh_due' | 'stale' | 'expired' | 'unknown';

export interface FreshnessInput {
  /** When the stored schedule was last successfully ingested. */
  lastIngestedAtUtc: string | null;
  /** How far forward the stored schedule actually covers. */
  coverageEndUtc: string | null;
  nowMs: number;
  /** Ingestion cadence; a run is "due" after this long. */
  cadenceMs?: number;
}

export interface FreshnessReport {
  state: Freshness;
  /** Plain sentence for the status line. Never implies data is current when it isn't. */
  message: string;
  ageMs: number | null;
  /** True when the schedule can still answer questions about right now. */
  usable: boolean;
}

const DAY_MS = 86_400_000;

/**
 * How much the stored schedule can be trusted.
 *
 * `expired` is the important one: coverage that has run out cannot describe the
 * present at all, so it is not merely old — it is unusable, and saying so is
 * different from saying nothing is on.
 */
export function freshness(i: FreshnessInput): FreshnessReport {
  const cadence = i.cadenceMs ?? DAY_MS;
  const last = ms(i.lastIngestedAtUtc);
  const coverageEnd = ms(i.coverageEndUtc);

  if (last == null) {
    return {
      state: 'unknown', ageMs: null, usable: false,
      message: 'No schedule has been ingested for this lineup yet.',
    };
  }
  const age = i.nowMs - last;

  if (coverageEnd != null && coverageEnd <= i.nowMs) {
    return {
      state: 'expired', ageMs: age, usable: false,
      message: 'The stored schedule has run out. Listings are unavailable until the next refresh succeeds.',
    };
  }
  // Two missed cadences is a real outage, not a late run.
  if (age > cadence * 2) {
    return {
      state: 'stale', ageMs: age, usable: true,
      message: 'Showing the last schedule we were able to retrieve — refreshes have been failing.',
    };
  }
  if (age > cadence) {
    return {
      state: 'refresh_due', ageMs: age, usable: true,
      message: 'Schedule refresh is delayed. Showing the last successful update.',
    };
  }
  return { state: 'current', ageMs: age, usable: true, message: '' };
}

/** "Updated today at 2:03 AM" — in the VIEWER's zone, not the server's. */
export function formatRefreshedAt(iso: string | null, timeZone: string, nowMs: number): string {
  const t = ms(iso);
  if (t == null) return 'Never updated';
  const sameDay =
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(t)) ===
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(nowMs));
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
    .format(new Date(t));
  if (sameDay) return `Updated today at ${time}`;
  const day = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' })
    .format(new Date(t));
  return `Updated ${day} at ${time}`;
}

/** "Schedule current through tomorrow at 2:00 AM". */
export function formatCoverageThrough(iso: string | null, timeZone: string, nowMs: number): string {
  const t = ms(iso);
  if (t == null) return 'Coverage window unknown';
  const dayKey = (x: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(x));
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
    .format(new Date(t));
  const today = dayKey(nowMs);
  const tomorrow = dayKey(nowMs + DAY_MS);
  const target = dayKey(t);
  if (target === today) return `Schedule current through today at ${time}`;
  if (target === tomorrow) return `Schedule current through tomorrow at ${time}`;
  const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(new Date(t));
  return `Schedule current through ${day} at ${time}`;
}
