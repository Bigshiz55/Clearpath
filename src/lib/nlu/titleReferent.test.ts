/**
 * "the Taken movie" NAMED THE WRONG WORK, AND THE FIX MUST NOT BREAK THE
 * CASES THAT WERE RIGHT.
 *
 * Deployed at the prior head: PASS (THE TAKEN (2024) — MAYBE at 55) · cues
 * honoured. The medium cue worked; the referent did not. `titleMatchTier`
 * ranks exact above article-stripped alt, so the literal reading "the Taken"
 * (exact for THE TAKEN, audience in the dozens) beat the frame reading
 * "Taken" (the 2008 film, audience in the tens of thousands) on a
 * technicality about an article the user typed as scaffolding.
 *
 * The adversarial half matters as much as the fix: an intentionally obscure
 * EXACT query must keep winning, a famous literal reading must never move,
 * and evidence that does not separate the readings must leave the user's own
 * words standing.
 */
import { describe, it, expect } from 'vitest';
import { chooseFramedReading, FRAME_DOMINANCE, type ReferentCandidate } from './titleReferent';

const c = (title: string, mediaType: 'movie' | 'tv', voteCount: number | null): ReferentCandidate =>
  ({ title, mediaType, voteCount });

describe('which work does a framed title name', () => {
  it('the case that shipped wrong: obscure literal, dominant frame → framed', () => {
    expect(chooseFramedReading(c('The Taken', 'movie', 40), c('Taken', 'movie', 10250))).toBe('framed');
  });

  it('no frame candidate → the literal words stand', () => {
    expect(chooseFramedReading(c('The Taken', 'movie', 40), null)).toBe('literal');
  });

  it('no literal candidate → the frame reading is the only reading', () => {
    // "the Whiplash movie": no film is called "the Whiplash".
    expect(chooseFramedReading(null, c('Whiplash', 'movie', 15000))).toBe('framed');
  });

  it('a FAMOUS literal reading never moves — Scary Movie stays Scary Movie', () => {
    expect(chooseFramedReading(c('Scary Movie', 'movie', 4800), c('Scary', 'movie', 900))).toBe('literal');
  });

  it('dominance is a high bar, not a taste nudge', () => {
    // 10× better known is NOT enough: the user's words stand.
    expect(chooseFramedReading(c('The Taken', 'movie', 100), c('Taken', 'movie', 1000))).toBe('literal');
    expect(chooseFramedReading(c('The Taken', 'movie', 100), c('Taken', 'movie', 100 * FRAME_DOMINANCE + 1))).toBe('framed');
  });

  it('no audience data on either side → no dominance can be claimed', () => {
    expect(chooseFramedReading(c('The Taken', 'movie', null), c('Taken', 'movie', null))).toBe('literal');
    expect(chooseFramedReading(c('The Taken', 'movie', 0), c('Taken', 'movie', 0))).toBe('literal');
  });

  it('a literal with zero audience still requires real dominance from the frame', () => {
    expect(chooseFramedReading(c('The Taken', 'movie', 0), c('Taken', 'movie', FRAME_DOMINANCE))).toBe('literal');
    expect(chooseFramedReading(c('The Taken', 'movie', 0), c('Taken', 'movie', FRAME_DOMINANCE + 1))).toBe('framed');
  });
});

/**
 * THE WIRING — structurally pinned where the choice executes.
 */
import { readFileSync } from 'node:fs';

describe('askJudgeTitle consults the referent chooser', () => {
  const src = readFileSync('src/lib/askJudge.ts', 'utf8');

  it('the frame reading comes from the sentence, the decision from the catalog', () => {
    expect(src).toMatch(/readAnchorSpan\(text\)/);
    expect(src).toMatch(/chooseFramedReading\(literalBest, framedBest\)/);
  });

  it('same-tier ties break on CUMULATIVE audience, weekly popularity beneath', () => {
    expect(src).toMatch(/\(r\.voteCount \?\? 0\) \* 1_000_000/);
  });
});
