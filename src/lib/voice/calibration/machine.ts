/**
 * THE RUN — a pure reducer for the 60-second calibration.
 *
 * The UI is allowed to be fast and a little reckless (speech events arrive out
 * of order, twice, or while the previous prompt is still being spoken). This
 * module is where that is made safe: every transition is a pure function of
 * (run, action), so the same sequence always produces the same answers whether
 * it came from a microphone, a fingertip, or a test.
 *
 * Two invariants do the heavy lifting:
 *
 *  - AN ANSWER IS KEYED BY ITEM, NOT BY ARRIVAL. A duplicate recognition event
 *    for the item already answered is idempotent, and a late event for an item
 *    the user has moved past cannot overwrite a newer answer. Recognisers fire
 *    the same final result twice often enough that this is not theoretical.
 *  - THE CURSOR ONLY MOVES ON A REAL DECISION. Answering, skipping and going
 *    back move it; a re-ask does not, so an unreadable answer costs one prompt
 *    rather than losing the item.
 *
 * PURE. Time is passed in, never read.
 */

import { CALIBRATION_ITEMS, CALIBRATION_VERSION, type CalibrationItem } from './items';

export type InputMethod = 'voice' | 'tap';

/** One recorded rating, with the provenance the DNA layer needs to weigh it. */
export interface CalibrationAnswer {
  itemId: string;
  /** 0..10, or null when the item was skipped. */
  value: number | null;
  skipped: boolean;
  /** Epoch ms. */
  at: number;
  method: InputMethod;
  /** 0..1 for voice; undefined for a tap, which has no uncertainty. */
  confidence?: number;
  version: string;
}

export interface CalibrationRun {
  /** Cursor into CALIBRATION_ITEMS. Equals length when the run is finished. */
  index: number;
  /** Keyed by itemId — see the idempotence invariant above. */
  answers: Record<string, CalibrationAnswer>;
  /** How many times the CURRENT item has been re-asked. */
  reasks: number;
  startedAt: number;
  version: string;
}

/** Ask twice, then leave it: a third "Sorry — number?" is a broken product. */
export const MAX_REASKS = 2;

export function createRun(startedAt: number): CalibrationRun {
  return { index: 0, answers: {}, reasks: 0, startedAt, version: CALIBRATION_VERSION };
}

export function currentItem(run: CalibrationRun): CalibrationItem | null {
  return CALIBRATION_ITEMS[run.index] ?? null;
}

export function isComplete(run: CalibrationRun): boolean {
  return run.index >= CALIBRATION_ITEMS.length;
}

/** 1-based position for "4 of 15". Clamped so a finished run reads as the last. */
export function progress(run: CalibrationRun): { position: number; total: number } {
  const total = CALIBRATION_ITEMS.length;
  return { position: Math.min(run.index + 1, total), total };
}

/** How many items actually carry a number (skips do not count). */
export function ratedCount(run: CalibrationRun): number {
  return Object.values(run.answers).filter((a) => !a.skipped && a.value !== null).length;
}

/**
 * Record a rating for the CURRENT item and advance.
 *
 * Returns the run unchanged when the run is over, so a recognition event that
 * lands after the final item is a no-op rather than a crash.
 */
export function answerCurrent(
  run: CalibrationRun,
  value: number,
  at: number,
  method: InputMethod,
  confidence?: number,
): CalibrationRun {
  const item = currentItem(run);
  if (!item) return run;
  const answer: CalibrationAnswer = {
    itemId: item.id,
    value,
    skipped: false,
    at,
    method,
    ...(confidence === undefined ? {} : { confidence }),
    version: run.version,
  };
  return {
    ...run,
    answers: { ...run.answers, [item.id]: answer },
    index: run.index + 1,
    reasks: 0,
  };
}

/** Move past the current item without recording a number. */
export function skipCurrent(run: CalibrationRun, at: number, method: InputMethod): CalibrationRun {
  const item = currentItem(run);
  if (!item) return run;
  return {
    ...run,
    answers: {
      ...run.answers,
      [item.id]: { itemId: item.id, value: null, skipped: true, at, method, version: run.version },
    },
    index: run.index + 1,
    reasks: 0,
  };
}

/**
 * Step back one item and DROP its answer, so the item is genuinely re-asked
 * rather than showing a stale number the user is trying to change.
 */
export function goBack(run: CalibrationRun): CalibrationRun {
  if (run.index === 0) return run;
  const prev = CALIBRATION_ITEMS[run.index - 1];
  if (!prev) return run;
  const answers = { ...run.answers };
  delete answers[prev.id];
  return { ...run, index: run.index - 1, answers, reasks: 0 };
}

/**
 * We could not read the answer. The cursor stays put; the caller says
 * "Sorry — number?" while the 0–10 buttons remain on screen.
 *
 * `exhausted` is true once we have asked as many times as we are willing to —
 * the caller then leaves the item to the buttons and stops speaking at them.
 */
export function reaskCurrent(run: CalibrationRun): { run: CalibrationRun; exhausted: boolean } {
  if (isComplete(run)) return { run, exhausted: true };
  const reasks = run.reasks + 1;
  return { run: { ...run, reasks }, exhausted: reasks >= MAX_REASKS };
}

/** Answers in item order — the shape everything downstream reads. */
export function orderedAnswers(run: CalibrationRun): CalibrationAnswer[] {
  return CALIBRATION_ITEMS.map((i) => run.answers[i.id]).filter((a): a is CalibrationAnswer => Boolean(a));
}

/** Just the ratings that carry a number, as itemId → 0..10. */
export function ratingsById(run: CalibrationRun): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of orderedAnswers(run)) {
    if (!a.skipped && a.value !== null) out[a.itemId] = a.value;
  }
  return out;
}
