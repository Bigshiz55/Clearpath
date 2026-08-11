/**
 * CARRYING A FINISHED SHOWDOWN INTO TONIGHT.
 *
 * The results CTA used to `router.push('/app')`, which threw the session away:
 * the player answered twelve questions and landed on a page that had never
 * heard of them. What has to survive the transition is different for each
 * ledger, and conflating them here would undo the whole rebuild.
 *
 *   PERMANENT (dna mode) already survives by itself. It is in
 *   `localStorage` via `tastedna/persist` for a guest, and in
 *   `preference_events` via `recordShowdownSession` for a signed-in user.
 *   Neither needs a handoff — the next page reads the store, not the URL.
 *
 *   SESSION (tonight mode) has nowhere to live by design: it must not be
 *   written to either of those. So it goes in `sessionStorage`, which is
 *   exactly the right lifetime — it survives a route change and a refresh, and
 *   dies with the tab. Expiry needs no cleanup code because there is no state
 *   to unwind.
 *
 * NOT A QUERY PARAMETER. A URL-encoded lean would be shareable, bookmarkable
 * and forgeable — someone else's mood pinned to your recommendations by a
 * pasted link, and a back-button that silently reapplies a night you finished
 * hours ago. It would also be a second personalization channel for the ranker
 * to read, which is precisely the parallel system this rebuild exists to avoid.
 *
 * A STAMP, NOT JUST A VALUE. The record carries when it was written and how
 * many decisions produced it, so a consumer can tell a live night from a stale
 * tab left open since Tuesday, and can say "shaped by your picks" honestly or
 * not at all.
 *
 * Read/write are the only I/O; the shaping is pure and tested.
 */

import type { SessionLean } from './evidence';

const KEY = 'watchverdict:tonight:v1';

/** A night goes stale after this long, even in a tab that stayed open. */
export const TONIGHT_TTL_MS = 6 * 60 * 60 * 1000;

export interface TonightHandoff {
  lean: SessionLean;
  /** Epoch ms the night was completed. */
  at: number;
  /** How many picks produced it — 0 means nothing to carry. */
  decisions: number;
}

/** Defensive: anything unrecognised reads as "no night", never as a crash. */
export function parseHandoff(raw: string | null, now: number): TonightHandoff | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<TonightHandoff>;
    if (!v || typeof v !== 'object' || typeof v.lean !== 'object' || v.lean === null) return null;
    const at = typeof v.at === 'number' ? v.at : 0;
    const decisions = typeof v.decisions === 'number' ? v.decisions : 0;
    if (decisions <= 0) return null;
    if (now - at > TONIGHT_TTL_MS) return null; // stale — treat as never played
    return { lean: v.lean as SessionLean, at, decisions };
  } catch {
    return null;
  }
}

export function saveTonight(handoff: TonightHandoff): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(handoff));
  } catch {
    /* private mode — tonight simply does not carry, and ranking is unbiased */
  }
}

export function loadTonight(now = Date.now()): TonightHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseHandoff(window.sessionStorage.getItem(KEY), now);
  } catch {
    return null;
  }
}

export function clearTonight(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do — a night that cannot be cleared expires on its own */
  }
}
