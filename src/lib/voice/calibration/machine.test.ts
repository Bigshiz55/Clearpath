import { describe, it, expect } from 'vitest';
import { CALIBRATION_ITEMS } from './items';
import {
  MAX_REASKS,
  answerCurrent,
  createRun,
  currentItem,
  goBack,
  isComplete,
  orderedAnswers,
  progress,
  ratedCount,
  ratingsById,
  reaskCurrent,
  skipCurrent,
} from './machine';

/**
 * The UI drives this at speed, from two input devices, with a recogniser that
 * fires the same result twice and sometimes late. Everything below is a
 * property that has to survive that.
 */

const run15 = () => {
  let run = createRun(0);
  CALIBRATION_ITEMS.forEach((_, i) => {
    run = answerCurrent(run, i % 11, 1000 * i, 'tap');
  });
  return run;
};

describe('walking the run', () => {
  it('starts on the first item and finishes after the last', () => {
    const run = createRun(0);
    expect(currentItem(run)?.id).toBe(CALIBRATION_ITEMS[0]?.id);
    expect(isComplete(run)).toBe(false);
    expect(isComplete(run15())).toBe(true);
    expect(currentItem(run15())).toBeNull();
  });

  it('reports position as "n of 15" and never overruns it', () => {
    expect(progress(createRun(0))).toEqual({ position: 1, total: 15 });
    expect(progress(run15())).toEqual({ position: 15, total: 15 });
  });

  it('records every rating in item order', () => {
    const answers = orderedAnswers(run15());
    expect(answers).toHaveLength(15);
    expect(answers.map((a) => a.itemId)).toEqual(CALIBRATION_ITEMS.map((i) => i.id));
  });

  it('keeps the provenance the DNA layer needs to weigh an answer', () => {
    const run = answerCurrent(createRun(0), 8, 1234, 'voice', 0.91);
    const a = orderedAnswers(run)[0]!;
    expect(a).toMatchObject({ value: 8, at: 1234, method: 'voice', confidence: 0.91, skipped: false });
    expect(a.version).toBe(run.version);
  });

  it('omits confidence for a tap, which has no uncertainty', () => {
    const a = orderedAnswers(answerCurrent(createRun(0), 8, 1, 'tap'))[0]!;
    expect(a.confidence).toBeUndefined();
  });
});

describe('the invariants that make speed safe', () => {
  it('a duplicate recognition event cannot double-advance', () => {
    // Both events carry the same value for the same moment; the run must land
    // on item two, not item three.
    const first = answerCurrent(createRun(0), 7, 100, 'voice', 0.9);
    const again = answerCurrent(first, 7, 100, 'voice', 0.9);
    expect(again.index).toBe(2);
    // …and the second answer belongs to the SECOND item, never overwriting the first.
    expect(again.answers[CALIBRATION_ITEMS[0]!.id]?.value).toBe(7);
  });

  it('answers are keyed by item, so a re-answer replaces rather than appends', () => {
    let run = answerCurrent(createRun(0), 3, 1, 'voice', 0.9);
    run = goBack(run);
    run = answerCurrent(run, 9, 2, 'tap');
    expect(Object.keys(run.answers)).toHaveLength(1);
    expect(run.answers[CALIBRATION_ITEMS[0]!.id]?.value).toBe(9);
  });

  it('a stray event after the last item is a no-op, not a crash', () => {
    const done = run15();
    expect(answerCurrent(done, 5, 1, 'voice', 1)).toBe(done);
    expect(skipCurrent(done, 1, 'voice')).toBe(done);
  });
});

describe('changing your mind', () => {
  it('back drops the previous answer so the item is genuinely re-asked', () => {
    let run = answerCurrent(createRun(0), 2, 1, 'tap');
    run = goBack(run);
    expect(run.index).toBe(0);
    expect(run.answers[CALIBRATION_ITEMS[0]!.id]).toBeUndefined();
  });

  it('back on the very first item does nothing', () => {
    const run = createRun(0);
    expect(goBack(run)).toBe(run);
  });
});

describe('skipping and re-asking', () => {
  it('a skip advances but records no number', () => {
    const run = skipCurrent(createRun(0), 5, 'voice');
    expect(run.index).toBe(1);
    expect(ratedCount(run)).toBe(0);
    expect(orderedAnswers(run)[0]?.skipped).toBe(true);
    expect(ratingsById(run)).toEqual({});
  });

  it('a re-ask holds position — an unreadable answer costs a prompt, not the item', () => {
    const run = createRun(0);
    const { run: after, exhausted } = reaskCurrent(run);
    expect(after.index).toBe(0);
    expect(exhausted).toBe(false);
  });

  it('gives up asking after the cap instead of saying "Sorry — number?" forever', () => {
    let run = createRun(0);
    let exhausted = false;
    for (let i = 0; i < MAX_REASKS; i++) ({ run, exhausted } = reaskCurrent(run));
    expect(exhausted).toBe(true);
    expect(run.index).toBe(0); // still answerable by tapping
  });

  it('answering clears the re-ask count for the next item', () => {
    let run = createRun(0);
    ({ run } = reaskCurrent(run));
    run = answerCurrent(run, 6, 1, 'tap');
    expect(run.reasks).toBe(0);
  });
});

describe('what comes out at the end', () => {
  it('ratingsById holds only the items that carry a number', () => {
    let run = createRun(0);
    run = answerCurrent(run, 10, 1, 'voice', 1);
    run = skipCurrent(run, 2, 'tap');
    run = answerCurrent(run, 0, 3, 'tap');
    expect(ratingsById(run)).toEqual({
      [CALIBRATION_ITEMS[0]!.id]: 10,
      [CALIBRATION_ITEMS[2]!.id]: 0,
    });
  });

  it('a zero is a real rating, not a missing one', () => {
    const run = answerCurrent(createRun(0), 0, 1, 'voice', 1);
    expect(ratedCount(run)).toBe(1);
    expect(ratingsById(run)[CALIBRATION_ITEMS[0]!.id]).toBe(0);
  });
});
