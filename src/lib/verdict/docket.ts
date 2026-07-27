/**
 * THE DOCKET — the shortlist you can close.
 *
 * WatchVerd1ct scores things and ranks them, which is a better-informed shrug.
 * A verdict needs a closed set: three to eight titles you have NOT seen, put in
 * front of the judge, and one call back. This module is the rulebook for that
 * set — what may go on it, how many, and when it is ready to be decided.
 *
 * Two limits, both deliberate:
 *
 *   UNDER THREE there is nothing to decide. One candidate is not a verdict, it
 *   is an assertion, and the app already tells you what it thinks of a single
 *   title everywhere else.
 *   OVER EIGHT it stops being a choice and becomes a browse. A "winner" out of
 *   twenty means almost nothing, and the cap is what protects the promise.
 *
 * The docket is EPHEMERAL. It is tonight's question, not a second watchlist —
 * a stale docket ranks things you stopped caring about a fortnight ago, so it
 * expires on its own.
 *
 * Pure. No I/O, no clock — `now` is always a parameter.
 */

export interface DocketEntry {
  /** `movie:603` — the same key the preference log uses. */
  key: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterUrl: string | null;
  /** Epoch ms. */
  addedAt: number;
}

/** Below this there is no decision to make. */
export const MIN_FOR_VERDICT = 3;
/** Above this it is a browse, not a choice. */
export const MAX_DOCKET = 8;
/** Tonight's question does not survive the week. */
export const DOCKET_TTL_MS = 24 * 60 * 60 * 1000;

export type AddResult =
  | { ok: true; docket: DocketEntry[] }
  | { ok: false; reason: 'full' | 'already' | 'seen'; message: string; docket: DocketEntry[] };

export interface AddOptions {
  /** Title keys the user has already watched — these can never be candidates. */
  seenKeys?: ReadonlySet<string> | undefined;
}

export function docketKey(mediaType: 'movie' | 'tv', tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

/** Drop anything that has aged out. A docket is tonight's question. */
export function pruneDocket(docket: readonly DocketEntry[], now: number, ttlMs = DOCKET_TTL_MS): DocketEntry[] {
  return docket.filter((e) => now - e.addedAt < ttlMs);
}

/**
 * Put a title on the docket.
 *
 * Refuses, with a reason, rather than silently dropping: a control that
 * sometimes does nothing is worse than one that says why.
 */
export function addToDocket(
  docket: readonly DocketEntry[],
  entry: Omit<DocketEntry, 'addedAt'>,
  now: number,
  opts: AddOptions = {},
): AddResult {
  const live = pruneDocket(docket, now);

  if (opts.seenKeys?.has(entry.key)) {
    return {
      ok: false,
      reason: 'seen',
      message: 'You have already watched that one — the docket is for things you have not seen.',
      docket: live,
    };
  }
  if (live.some((e) => e.key === entry.key)) {
    return { ok: false, reason: 'already', message: 'Already on the docket.', docket: live };
  }
  if (live.length >= MAX_DOCKET) {
    return {
      ok: false,
      reason: 'full',
      message: `${MAX_DOCKET} is the limit — a winner picked out of twenty does not mean much. Take one off first.`,
      docket: live,
    };
  }
  return { ok: true, docket: [...live, { ...entry, addedAt: now }] };
}

export function removeFromDocket(docket: readonly DocketEntry[], key: string): DocketEntry[] {
  return docket.filter((e) => e.key !== key);
}

export interface DocketStatus {
  count: number;
  ready: boolean;
  full: boolean;
  /** What the tray should say right now. */
  message: string;
}

export function docketStatus(docket: readonly DocketEntry[]): DocketStatus {
  const count = docket.length;
  if (count === 0) {
    return { count, ready: false, full: false, message: 'Nothing on the docket yet.' };
  }
  if (count < MIN_FOR_VERDICT) {
    const need = MIN_FOR_VERDICT - count;
    return {
      count,
      ready: false,
      full: false,
      message: `${count} on the docket — ${need} more and I can call it.`,
    };
  }
  return {
    count,
    ready: true,
    full: count >= MAX_DOCKET,
    message: `${count} on the docket — ready for a verdict.`,
  };
}
