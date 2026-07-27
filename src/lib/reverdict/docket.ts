/**
 * THE R DOCKET — the shortlist of things you have already seen.
 *
 * Structurally the W docket's twin, and it reuses that module's mechanics
 * deliberately rather than copying them: same entry shape, same pruning, same
 * three-to-eight limits, same expiry. Two dockets that drift apart would mean
 * two different answers to "how many is too many", and there is only one right
 * answer to that.
 *
 * One rule is inverted, and it is the whole point. The W refuses anything you
 * have ALREADY watched. The R refuses anything you HAVE NOT — you cannot
 * rewatch a film you have never seen, and letting one onto the docket would
 * produce a ruling the engine then has to throw out at eligibility, after the
 * user has already committed to it.
 *
 * Pure. No I/O, no clock.
 */
import {
  MAX_DOCKET,
  MIN_FOR_VERDICT,
  DOCKET_TTL_MS,
  docketKey,
  pruneDocket,
  removeFromDocket,
  type DocketEntry,
} from '@/lib/verdict/docket';

export { MAX_DOCKET, MIN_FOR_VERDICT, DOCKET_TTL_MS, docketKey, pruneDocket, removeFromDocket };
export type { DocketEntry };

/** Named for this side of the app, but the same numbers — see above. */
export const MIN_FOR_REVERDICT = MIN_FOR_VERDICT;
export const MAX_RDOCKET = MAX_DOCKET;

export type RAddResult =
  | { ok: true; docket: DocketEntry[] }
  | { ok: false; reason: 'full' | 'already' | 'unseen'; message: string; docket: DocketEntry[] };

export interface RAddOptions {
  /**
   * Keys the user has actually watched. When supplied, anything NOT in here is
   * refused. When omitted we do not know, and refusing on an unknown would make
   * the R unusable for anyone whose history we have not loaded — so it allows,
   * and `deliverReVerdict` still rules it out honestly at the end.
   */
  seenKeys?: ReadonlySet<string> | undefined;
}

export function addToRDocket(
  docket: readonly DocketEntry[],
  entry: Omit<DocketEntry, 'addedAt'>,
  now: number,
  opts: RAddOptions = {},
): RAddResult {
  const live = pruneDocket(docket, now);

  if (opts.seenKeys && !opts.seenKeys.has(entry.key)) {
    return {
      ok: false,
      reason: 'unseen',
      message: 'You have not watched that one — the R is for things you are thinking of watching again.',
      docket: live,
    };
  }
  if (live.some((e) => e.key === entry.key)) {
    return { ok: false, reason: 'already', message: 'Already on the docket.', docket: live };
  }
  if (live.length >= MAX_RDOCKET) {
    return {
      ok: false,
      reason: 'full',
      message: `${MAX_RDOCKET} is the limit — a winner picked out of twenty does not mean much. Take one off first.`,
      docket: live,
    };
  }
  return { ok: true, docket: [...live, { ...entry, addedAt: now }] };
}

export interface RDocketStatus {
  count: number;
  ready: boolean;
  full: boolean;
  message: string;
}

export function rDocketStatus(docket: readonly DocketEntry[]): RDocketStatus {
  const count = docket.length;
  if (count === 0) return { count, ready: false, full: false, message: 'Nothing up for a rewatch yet.' };
  if (count < MIN_FOR_REVERDICT) {
    const need = MIN_FOR_REVERDICT - count;
    return { count, ready: false, full: false, message: `${count} up for a rewatch — ${need} more and I can call it.` };
  }
  return {
    count,
    ready: true,
    full: count >= MAX_RDOCKET,
    message: `${count} up for a rewatch — ready for a re-Verd1ct.`,
  };
}
