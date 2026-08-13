import { describe, it, expect } from 'vitest';
import { TITLES } from '@/lib/voice/quickdna/definition';
import {
  EXPOSURE_RESERVE_RATIO,
  HISTORY_CAP,
  recordExposure,
  suppressedTitles,
  trimHistory,
} from './exposure';
import {
  TARGET_DECISIONS,
  answer,
  createSession,
  exposedThisSession,
  startSession,
  type ShowdownState,
} from './session';

/**
 * "WHY DO I KEEP SEEING THE SAME FILMS?"
 *
 * Because the memory did not exist. `StoredDna.usedTitleIds` was declared,
 * initialised to `[]`, and never written or read; `ShowdownState.seenTitleIds`
 * starts empty on every run. So a second session was dealt from the whole
 * catalogue again — and a deterministic planner, opening from a similar
 * profile, deals a similar opening. The repeats were not bad luck.
 *
 * These play consecutive sessions the way the component does — seed the
 * no-repeat set from the durable history, fold the session's exposures back in
 * — and assert both halves of the problem: nothing repeats, AND the pool never
 * starves. Total suppression fixes the first and breaks the second, which is
 * why the release policy is tested here rather than assumed.
 */

/** Play one session end to end, from a suppression list. */
function play(suppressed: readonly string[], seed = 0): ShowdownState {
  let s = startSession(createSession({ seenTitleIds: suppressed }, 0, 'dna'), 0);
  for (let i = 0; i < TARGET_DECISIONS + 6 && s.current; i++) {
    s = answer(s, (i + seed) % 3 === 0 ? 'right' : 'left', 1000 + i, 800);
  }
  return s;
}

/** Consecutive sessions, carrying exposure the way `Showdown.tsx` does. */
function playSessions(count: number) {
  let history: string[] = [];
  const runs: string[][] = [];
  for (let n = 0; n < count; n++) {
    const s = play(suppressedTitles(history, TITLES.length), n);
    // ONLY what was actually shown. `seenTitleIds` also holds the suppression
    // list the run was seeded with, and feeding that back would re-stamp every
    // avoided title as freshly seen.
    runs.push(exposedThisSession(s));
    history = trimHistory(recordExposure(history, exposedThisSession(s)));
  }
  return { runs, history };
}

describe('exposure outlives the session', () => {
  it('a second session repeats nothing from the first', () => {
    const { runs } = playSessions(2);
    const first = new Set(runs[0]!);
    const repeats = runs[1]!.filter((id) => first.has(id));
    expect(repeats, `session 2 re-dealt ${repeats.length} titles from session 1`).toEqual([]);
  });

  it('and the pool never starves — every session still runs to completion', () => {
    const { runs } = playSessions(6);
    for (const [i, run] of runs.entries()) {
      expect(
        run.length,
        `session ${i + 1} ran short: ${run.length / 2} decisions instead of ${TARGET_DECISIONS}`,
      ).toBe(TARGET_DECISIONS * 2);
    }
  });

  it('releases the OLDEST exposures first, once it must release any', () => {
    const history = Array.from({ length: TITLES.length }, (_, i) => `t${i}`);
    const suppressed = new Set(suppressedTitles(history, TITLES.length));

    // The reserve is what forces a release at all; without it this asserts
    // nothing, so check the fixture actually exceeds it.
    expect(suppressed.size).toBeLessThan(history.length);
    expect(suppressed.has(history[history.length - 1]!), 'the newest exposure was released').toBe(true);
    expect(suppressed.has(history[0]!), 'the oldest exposure was kept over a newer one').toBe(false);
  });

  it('keeps at least half the catalogue dealable whatever the history', () => {
    const history = Array.from({ length: 10_000 }, (_, i) => `t${i % TITLES.length}`);
    const suppressed = suppressedTitles(history, TITLES.length);
    const available = TITLES.length - suppressed.length;
    expect(available).toBeGreaterThanOrEqual(Math.floor(TITLES.length * EXPOSURE_RESERVE_RATIO));
  });

  it('a title seen twice counts as fresh as its most recent showing', () => {
    const history = recordExposure(['a', 'b', 'c'], ['a']);
    expect(history, 'a repeat did not move to the end of the queue').toEqual(['b', 'c', 'a']);
  });

  it('never grows without bound', () => {
    let history: string[] = [];
    for (let i = 0; i < 40; i++) {
      history = trimHistory(recordExposure(history, Array.from({ length: 40 }, (_, j) => `s${i}-${j}`)));
    }
    expect(history.length).toBeLessThanOrEqual(HISTORY_CAP);
  });
});
