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
  /** What the tray's own line says. Short — see the note in `docketStatus`. */
  message: string;
  /**
   * The same state as a full sentence: "2 selected — choose 1 more",
   * "3 selected — gavel ready".
   *
   * Two strings rather than one because the tray is a fixed bar sharing a line
   * with Clear and Deliver, and the long form wraps at 320px — which doubles
   * the height of the thing covering the page. So the bar shows `message` and
   * announces `longMessage`: screen readers and wide screens get the sentence,
   * a narrow bar gets the words that fit. Neither is ever the only source of
   * the count, which is rendered in the badge beside them.
   */
  longMessage: string;
}

/**
 * The route the tray must never appear on.
 *
 * The tray's entire job is to carry you TO the ruling. On the ruling itself it
 * is offering to take you where you already are — and it sat on top of that
 * page's own two buttons, so the one screen with a decision on it was the one
 * screen where you could not act on it. Everything the tray offers there, the
 * page already does: Clear is "Start a new docket", Deliver is what you just
 * did.
 */
export const VERDICT_ROUTE = '/app/verdict';

/**
 * Should the tray render at all? Pure so it can be tested without a DOM — the
 * component is a thin wrapper over this, and the two conditions that hide it
 * are exactly the two worth pinning.
 */
export function trayHidden(pathname: string | null | undefined, docketCount: number): boolean {
  if (docketCount <= 0) return true;
  if (!pathname) return false;
  // Match the route and anything nested under it, but never a route that merely
  // starts with the same characters (`/app/verdicts`).
  return pathname === VERDICT_ROUTE || pathname.startsWith(`${VERDICT_ROUTE}/`);
}

export function docketStatus(docket: readonly DocketEntry[]): DocketStatus {
  const count = docket.length;
  if (count === 0) {
    return {
      count,
      ready: false,
      full: false,
      message: 'Nothing on the docket yet.',
      longMessage: 'Nothing selected yet — tap the W on a poster to start.',
    };
  }
  // SHORT, because the tray is a fixed bar sharing one line with Clear and
  // Deliver. The original sentence wrapped, which put the controls on a second
  // line and doubled the height of the thing covering the page; the obvious fix
  // — truncate it — just produced "3 on the…", which says less than nothing.
  //
  // So the message stops repeating the count. It is already rendered, larger,
  // in the badge immediately to its left. All the words have to carry is what
  // the badge cannot: how much further there is to go.
  if (count < MIN_FOR_VERDICT) {
    const need = MIN_FOR_VERDICT - count;
    return {
      count,
      ready: false,
      full: false,
      message: `${need} more to rule`,
      longMessage: `${count} selected — choose ${need} more`,
    };
  }
  // One word once the Deliver button appears beside it: at 320px the button
  // takes the width, and "Ready to rule" next to "Deliver →" says the same
  // thing twice anyway.
  return {
    count,
    ready: true,
    full: count >= MAX_DOCKET,
    message: 'Ready',
    longMessage: `${count} selected — gavel ready`,
  };
}
