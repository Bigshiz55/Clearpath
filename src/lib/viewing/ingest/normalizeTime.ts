/**
 * PROVIDER TIMESTAMP → ABSOLUTE UTC INSTANT.
 *
 * Every listings provider gets this wrong differently: some send UTC with a Z,
 * some send an offset, some send a naive local time and tell you the zone out
 * of band, some send unix seconds. Comparing "1:15 PM" as text, or reading a
 * naive timestamp as server-local, is how a schedule ends up hours out for
 * everyone in a different region than the server.
 *
 * One rule: nothing is stored until it is an unambiguous instant. Anything that
 * cannot be resolved is marked incomplete and handled safely, never guessed.
 */

export type TimeConfidence =
  | 'explicit_utc'      // trailing Z
  | 'explicit_offset'   // ±HH:MM
  | 'epoch'             // unix seconds/millis
  | 'zone_applied'      // naive, resolved with the provider's declared zone
  | 'ambiguous_dst'     // naive, inside a fall-back repeated hour
  | 'invalid';

export interface NormalizedTime {
  utcMs: number | null;
  confidence: TimeConfidence;
  /** True when the value is safe to store and compare. */
  usable: boolean;
  note?: string;
}

const INVALID: NormalizedTime = { utcMs: null, confidence: 'invalid', usable: false };

/**
 * The UTC offset (in minutes) that `timeZone` was at a given instant.
 * Uses Intl rather than a hand-rolled table, so DST rules and the zones that
 * do not observe it (Arizona, Hawaii) are correct without special cases.
 */
function offsetMinutesAt(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  // `hour` can be "24" at midnight under hour12:false in some engines.
  const hour = Number(p.hour) % 24;
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    hour, Number(p.minute), Number(p.second),
  );
  return (asUtc - utcMs) / 60_000;
}

/**
 * Resolve a naive wall-clock time in a zone to an instant.
 *
 * Two passes: guess with the offset at the naive value read as UTC, then
 * re-check with the offset actually in force at that candidate instant. That
 * second pass is what gets DST transitions right.
 *
 * Returns every instant that maps to the requested wall clock — normally one,
 * two inside a fall-back repeated hour, zero inside a spring-forward gap.
 */
export function resolveWallClock(naiveUtcMs: number, timeZone: string): number[] {
  // Probe a full day either side. Sampling only ±1h kept every probe on the
  // same side of a transition, so the SECOND occurrence of a repeated
  // fall-back hour was never discovered and ambiguity went unreported.
  const DAY = 86_400_000;
  const offsets = new Set<number>();
  for (const seed of [
    naiveUtcMs - DAY, naiveUtcMs - DAY / 2, naiveUtcMs - 3_600_000,
    naiveUtcMs, naiveUtcMs + 3_600_000, naiveUtcMs + DAY / 2, naiveUtcMs + DAY,
  ]) {
    offsets.add(offsetMinutesAt(seed, timeZone));
  }

  const candidates = new Set<number>();
  for (const off of offsets) {
    const candidate = naiveUtcMs - off * 60_000;
    // Keep it only if it really does read back as the requested wall clock.
    if (offsetMinutesAt(candidate, timeZone) * 60_000 === naiveUtcMs - candidate) {
      candidates.add(candidate);
    }
  }
  return [...candidates].sort((a, b) => a - b);
}

export interface NormalizeOptions {
  /** IANA zone the provider's naive timestamps are expressed in. */
  providerTimeZone?: string | null;
  /** Duration in minutes, used only to derive a missing end time. */
  durationMinutes?: number | null;
}

/**
 * Normalise one provider timestamp.
 *
 * Recognised, in order: unix epoch, explicit Z, explicit offset, then naive —
 * and naive is resolved ONLY when the caller supplies the provider's zone.
 * A naive timestamp with no declared zone is `invalid`, not "probably local".
 */
export function normalizeInstant(raw: unknown, o: NormalizeOptions = {}): NormalizedTime {
  if (raw == null) return INVALID;
  const s = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!s) return INVALID;

  if (/^\d{10}$/.test(s)) return { utcMs: Number(s) * 1000, confidence: 'epoch', usable: true };
  if (/^\d{13}$/.test(s)) return { utcMs: Number(s), confidence: 'epoch', usable: true };

  if (/Z$/i.test(s)) {
    const t = Date.parse(s);
    return Number.isFinite(t)
      ? { utcMs: t, confidence: 'explicit_utc', usable: true }
      : INVALID;
  }
  if (/[+-]\d{2}:?\d{2}$/.test(s)) {
    const t = Date.parse(s);
    return Number.isFinite(t)
      ? { utcMs: t, confidence: 'explicit_offset', usable: true }
      : INVALID;
  }

  // Naive. Only resolvable with a declared provider zone.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return INVALID;
  if (!o.providerTimeZone) {
    return {
      utcMs: null, confidence: 'invalid', usable: false,
      note: 'Timestamp carries no zone and the provider declared none — refusing to assume server-local time.',
    };
  }
  const naive = Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6] ?? 0),
  );
  const hits = resolveWallClock(naive, o.providerTimeZone);

  if (hits.length === 1) {
    return { utcMs: hits[0]!, confidence: 'zone_applied', usable: true };
  }
  if (hits.length > 1) {
    // Fall-back: this wall clock happened twice. Broadcasters schedule against
    // the first pass, so take the earlier instant and record the ambiguity
    // rather than silently picking one.
    return {
      utcMs: hits[0]!, confidence: 'ambiguous_dst', usable: true,
      note: 'Wall-clock time occurs twice during the DST fall-back hour; took the first occurrence.',
    };
  }
  // Spring-forward gap: this wall clock never existed.
  return {
    utcMs: null, confidence: 'invalid', usable: false,
    note: 'Wall-clock time falls in the DST spring-forward gap and does not exist.',
  };
}

export interface NormalizedAiring {
  startUtcMs: number | null;
  endUtcMs: number | null;
  startConfidence: TimeConfidence;
  /** How the end time was obtained. */
  endSource: 'provider_end' | 'duration' | 'missing';
  /** False when this row must not be treated as a complete airing. */
  complete: boolean;
  notes: string[];
}

/**
 * Normalise a start/end pair, deriving the end from a duration when the
 * provider gives no end time.
 *
 * When neither exists the row is stored as incomplete rather than given an
 * invented runtime — a made-up end time would place a finished programme in
 * On Now, which is worse than admitting we do not know.
 */
export function normalizeAiring(
  rawStart: unknown,
  rawEnd: unknown,
  o: NormalizeOptions = {},
): NormalizedAiring {
  const notes: string[] = [];
  const start = normalizeInstant(rawStart, o);
  if (start.note) notes.push(`start: ${start.note}`);

  if (!start.usable || start.utcMs == null) {
    return {
      startUtcMs: null, endUtcMs: null, startConfidence: start.confidence,
      endSource: 'missing', complete: false, notes,
    };
  }

  const end = normalizeInstant(rawEnd, o);
  if (end.note) notes.push(`end: ${end.note}`);
  if (end.usable && end.utcMs != null) {
    if (end.utcMs <= start.utcMs) {
      notes.push('end is not after start — treating the airing as incomplete');
      return {
        startUtcMs: start.utcMs, endUtcMs: null, startConfidence: start.confidence,
        endSource: 'missing', complete: false, notes,
      };
    }
    return {
      startUtcMs: start.utcMs, endUtcMs: end.utcMs, startConfidence: start.confidence,
      endSource: 'provider_end', complete: true, notes,
    };
  }

  const d = o.durationMinutes;
  if (d != null && Number.isFinite(d) && d > 0) {
    return {
      startUtcMs: start.utcMs, endUtcMs: start.utcMs + d * 60_000,
      startConfidence: start.confidence, endSource: 'duration', complete: true, notes,
    };
  }

  notes.push('no end time and no duration — stored without an end');
  return {
    startUtcMs: start.utcMs, endUtcMs: null, startConfidence: start.confidence,
    endSource: 'missing', complete: false, notes,
  };
}
