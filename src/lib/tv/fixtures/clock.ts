/**
 * THE SIMULATION CLOCK.
 *
 * Fixture mode has to demonstrate thirty days of three-hourly synchronisation
 * — 240 cycles — and waiting thirty days is not a test strategy. So time is a
 * value the fixture layer reads, never something it asks the operating system
 * for.
 *
 * Pure and injectable on purpose:
 *
 *   - `Date.now()` in a fixture generator makes the corpus depend on WHEN it
 *     was generated, which destroys the determinism the whole layer rests on;
 *   - a clock that can be advanced 240 times in a loop lets the sync cycle,
 *     the delta reconciliation, the retention window, and the DST transitions
 *     all be exercised against real elapsed simulated time; and
 *   - a DST transition is only interesting if you can land on it deliberately.
 *     The default epoch is chosen so a thirty-day run crosses one.
 *
 * The persisted counterpart is the `sim_clock` table (migration 0044); this is
 * the in-memory model of it, so tests need no database.
 */

export const DEFAULT_TICK_SECONDS = 3 * 60 * 60; // three hours
export const DEFAULT_SIM_DAYS = 30;

/**
 * 2026-03-01T00:00:00Z. Deliberate: a thirty-day run from here crosses the US
 * spring-forward transition on 2026-03-08, when 02:00–03:00 local does not
 * exist in America/New_York. A schedule generator that quietly assumes every
 * day has 24 hours produces wrong rows on exactly that day, and this is how
 * that gets caught rather than shipped.
 */
export const DEFAULT_EPOCH_UTC = Date.UTC(2026, 2, 1, 0, 0, 0);

export interface SimClockState {
  epochUtcMs: number;
  tickSeconds: number;
  ticksElapsed: number;
}

export class SimClock {
  private readonly epochUtcMs: number;
  private readonly tickSeconds: number;
  private ticks: number;

  constructor(opts: Partial<SimClockState> = {}) {
    this.epochUtcMs = opts.epochUtcMs ?? DEFAULT_EPOCH_UTC;
    this.tickSeconds = opts.tickSeconds ?? DEFAULT_TICK_SECONDS;
    this.ticks = opts.ticksElapsed ?? 0;
  }

  /** Current simulated instant, in epoch milliseconds. */
  nowMs(): number {
    return this.epochUtcMs + this.ticks * this.tickSeconds * 1000;
  }

  nowIso(): string {
    return new Date(this.nowMs()).toISOString();
  }

  get ticksElapsed(): number {
    return this.ticks;
  }

  /** Advance one synchronisation cycle. Returns the new instant. */
  tick(): number {
    this.ticks += 1;
    return this.nowMs();
  }

  advanceTicks(n: number): number {
    if (n < 0) throw new Error('SimClock.advanceTicks: n must be >= 0');
    this.ticks += n;
    return this.nowMs();
  }

  state(): SimClockState {
    return { epochUtcMs: this.epochUtcMs, tickSeconds: this.tickSeconds, ticksElapsed: this.ticks };
  }

  /** How many ticks cover `days` of simulated time at this tick size. */
  ticksForDays(days: number): number {
    return Math.ceil((days * 86_400) / this.tickSeconds);
  }
}

/**
 * DST CLASSIFICATION FOR A WALL-CLOCK TIME IN A ZONE.
 *
 * A source hands us "2026-03-08 02:30" and a timezone. In America/New_York
 * that instant does not exist — the clock jumps 02:00 → 03:00 — and in
 * November the equivalent hour exists twice. Both are real rows in a real
 * schedule feed, and both are silently mangled by naive parsing.
 *
 * The rule used here: convert the wall-clock reading to UTC by probing both
 * plausible offsets and seeing which ones round-trip.
 *
 *   - both round-trip  → AMBIGUOUS (the repeated autumn hour). We keep the
 *     FIRST (the pre-transition, larger-offset reading), which is what a
 *     broadcaster means by "1:30am" on that night, and flag it.
 *   - neither          → NONEXISTENT (the skipped spring hour). We keep the
 *     post-transition instant and flag it, because the programme did air —
 *     the label is what is impossible, not the broadcast.
 *   - exactly one      → unambiguous, the normal case.
 *
 * Storing UTC plus the source's own zone and wall-clock string (see
 * `linear_airings`) means a wrong guess is recoverable. Storing only UTC is
 * not.
 */
export type DstClassification = {
  utcMs: number;
  ambiguous: boolean;
  nonexistent: boolean;
};

/**
 * `Intl.DateTimeFormat` construction dominates any bulk conversion — a
 * million airings is three million formatter builds — so formatters are
 * cached per zone, and the RESULT is cached per (zone, 15-minute bucket).
 *
 * A 15-minute bucket is safe because every real UTC offset is a multiple of
 * 15 minutes and transitions land on such a boundary, so two instants in the
 * same bucket cannot straddle one. The cache is a pure memo: same inputs,
 * same answer, no behaviour change.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, number>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Offset (minutes) of `zone` from UTC at a given instant. */
export function zoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const bucket = Math.floor(utcMs / 900_000);
  const key = `${timeZone}|${bucket}`;
  const hit = offsetCache.get(key);
  if (hit !== undefined) return hit;

  const parts = formatterFor(timeZone).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  // `hour` can format as 24 for midnight under hour12:false in some engines.
  const hour = get('hour') % 24;
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  const offset = Math.round((asUtc - utcMs) / 60_000);
  offsetCache.set(key, offset);
  return offset;
}

/** Test seam — the memo is module state and must not mask a logic change. */
export function __resetZoneCaches(): void {
  formatterCache.clear();
  offsetCache.clear();
}

/**
 * Convert a wall-clock reading in `timeZone` to UTC, classifying the DST edge.
 * `parts` is the local reading, exactly as the source stated it.
 */
export function localWallClockToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): DstClassification {
  const naiveUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);

  // FIND THE CANDIDATE OFFSETS NEAR THE REAL INSTANT, NOT NEAR THE NAIVE ONE.
  //
  // Probing around `naiveUtc` directly is wrong and quietly so: for a 01:30
  // local reading in New York, `naiveUtc` interpreted as UTC lands at 21:30
  // the previous evening — five hours from the 06:00Z transition, where both
  // probes return the same offset and the repeated hour looks unambiguous.
  //
  // So: convert once with a rough offset to get near the true instant, then
  // sample the offset six hours either side of THAT. Six hours comfortably
  // brackets any transition while staying inside the same rule period.
  const roughOffset = zoneOffsetMinutes(naiveUtc, timeZone);
  const roughUtc = naiveUtc - roughOffset * 60_000;
  const offsets = Array.from(new Set([
    zoneOffsetMinutes(roughUtc - 6 * 3_600_000, timeZone),
    zoneOffsetMinutes(roughUtc, timeZone),
    zoneOffsetMinutes(roughUtc + 6 * 3_600_000, timeZone),
  ]));

  // A candidate is valid only if the zone really is at that offset then —
  // which is what makes "two valid" mean repeated and "none valid" mean
  // skipped, rather than being a heuristic about dates.
  const valid = offsets
    .map((offset) => naiveUtc - offset * 60_000)
    .filter((utc) => zoneOffsetMinutes(utc, timeZone) === Math.round((naiveUtc - utc) / 60_000));

  if (valid.length > 1) {
    // Repeated hour: take the earlier instant, the pre-fall-back reading,
    // which is what a broadcaster means by "1:30am" on that night.
    return { utcMs: Math.min(...valid), ambiguous: true, nonexistent: false };
  }
  if (valid.length === 0) {
    // Skipped hour: the wall-clock LABEL is impossible; the broadcast is not.
    // Resolve forward, to the instant the clock jumped to.
    const post = Math.max(...offsets);
    return { utcMs: naiveUtc - post * 60_000, ambiguous: false, nonexistent: true };
  }
  return { utcMs: valid[0]!, ambiguous: false, nonexistent: false };
}
