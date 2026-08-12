import { describe, it, expect } from 'vitest';
import { createSession, startSession, answer, timeoutRound, markUnseen } from './session';

/**
 * A TIMEOUT IS NOT A DISLIKE.
 *
 * The single most dangerous line in a timed mechanic is the one that treats
 * silence as an answer. `neither` already exists and means "I want neither of
 * these", so a five-second clock expiring makes it tempting to reach for. A
 * player who looked away has told us nothing, and recording a rejection of two
 * films because their thumb was elsewhere is how a countdown quietly poisons
 * a profile it was supposed to enrich.
 *
 * These tests are the guard. They compare a timeout against a real answer on
 * the same session, so "contributes nothing" is measured rather than asserted.
 */

const play = () => startSession(createSession({}, 1), 1);

describe('a rapid round that runs out of time teaches nothing', () => {
  it('MOVES NO BELIEF — the profile is untouched', () => {
    const s = play();
    expect(s.current).not.toBeNull();
    const before = JSON.stringify(s.profile);
    const after = timeoutRound(s, 2);
    expect(JSON.stringify(after.profile)).toBe(before);
  });

  it('records no decision, where a real answer records one', () => {
    const s = play();
    expect(answer(s, 'left', 2, 800).decisions).toHaveLength(1);
    expect(timeoutRound(s, 2).decisions).toHaveLength(0);
  });

  it('is NOT the same as a real pick — that one moves a dozen beliefs', () => {
    /* The whole point. If these two produced the same state, the countdown
       would be manufacturing evidence out of hesitation.

       Measured against `left` rather than `neither` deliberately: on a
       cold-start pair `neither` folds NO permanent evidence either — it is
       negative evidence about what two films SHARE, and a maximally
       contrasting opening pair shares nothing to be negative about. Comparing
       against it would have proved only that two empty objects match. */
    const s = play();
    const picked = answer(s, 'left', 2, 800);
    const expired = timeoutRound(s, 2);
    expect(Object.keys(picked.profile).length).toBeGreaterThan(0);
    expect(JSON.stringify(picked.profile)).not.toBe(JSON.stringify(expired.profile));
    expect(JSON.stringify(expired.profile)).toBe(JSON.stringify(s.profile));
  });

  it('does NOT claim the player failed to recognise the titles', () => {
    /* `markUnseen` retires titles as unrecognised. Running out of time says
       nothing about recognition, and borrowing that signal to save a round
       would corrupt it. */
    const s = play();
    expect(markUnseen(s, 2).unseenTitles.length).toBe(2);
    expect(timeoutRound(s, 2).unseenTitles).toEqual(s.unseenTitles);
  });

  it('still retires both titles, because they were SHOWN', () => {
    const s = play();
    const after = timeoutRound(s, 2);
    expect(after.seenTitleIds).toContain(s.current!.left.id);
    expect(after.seenTitleIds).toContain(s.current!.right.id);
  });

  it('still costs a round, so the burst cannot be waited out', () => {
    /* Unlike an unrecognised pair — a fact about the catalogue, which the
       catalogue pays for — a timeout is a round the player actually spent. */
    const s = play();
    expect(timeoutRound(s, 2).unseenRounds).toBe(s.unseenRounds + 1);
    expect(markUnseen(s, 2).unseenRounds).toBe(s.unseenRounds);
  });

  it('deals the next matchup rather than stalling the game', () => {
    const s = play();
    const after = timeoutRound(s, 2);
    expect(after.current).not.toBeNull();
    expect(after.current!.left.id).not.toBe(s.current!.left.id);
  });

  it('cannot fold evidence even structurally', () => {
    // Belt and braces on the property that matters most: the source of
    // `timeoutRound` reaches neither the evidence builder nor the fold.
    const src = String(timeoutRound);
    expect(src).not.toContain('evidenceFor');
    expect(src).not.toContain('applyPermanent');
  });
});
