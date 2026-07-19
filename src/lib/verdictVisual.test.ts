import { describe, it, expect } from 'vitest';
import { verdictVisualForTier, verdictVisualForCall, verdictVisual, isTopTier, tierForScore, scoreVerdict } from './verdictVisual';
import { tierFromScore } from './scoring/verdict';

describe('Verdict visual language', () => {
  it('collapses the two top tiers into one green "watch" signal', () => {
    expect(verdictVisualForTier('Must Watch').key).toBe('watch');
    expect(verdictVisualForTier('Strong Watch').key).toBe('watch');
    expect(verdictVisualForTier('Must Watch').badge).toBe(verdictVisualForTier('Strong Watch').badge);
  });

  it('maps the middle tiers to gold and the floor to gray/red', () => {
    expect(verdictVisualForTier('Worth Watching').key).toBe('worth');
    expect(verdictVisualForTier('Possible Watch').key).toBe('worth');
    expect(verdictVisualForTier('Low Priority').key).toBe('uncertain');
    expect(verdictVisualForTier('Skip').key).toBe('skip');
  });

  it('maps primary calls consistently', () => {
    expect(verdictVisualForCall('WATCH IT').key).toBe('watch');
    expect(verdictVisualForCall('MAYBE').key).toBe('worth');
    expect(verdictVisualForCall('SKIP IT').key).toBe('skip');
  });

  it('falls back to uncertain for anything unrecognized', () => {
    expect(verdictVisualForTier('Nonsense').key).toBe('uncertain');
    expect(verdictVisualForCall('???').key).toBe('uncertain');
  });

  it('exposes a stable palette for each key', () => {
    expect(verdictVisual('wildcard').label).toBe('Wildcard');
    expect(verdictVisual('watch').hex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(verdictVisual('watch').solid).not.toBe(verdictVisual('watch').badge);
  });

  it('marks only the single strongest tier as the top pick', () => {
    expect(isTopTier('Must Watch')).toBe(true);
    expect(isTopTier('Strong Watch')).toBe(false);
    expect(isTopTier('Skip')).toBe(false);
  });

  it('keeps the DNA score→tier thresholds identical to the objective verdict', () => {
    // The DNA Score must land in the SAME tier as an equal objective score, or
    // the "one call" promise breaks. Sweep the whole range including boundaries.
    for (let s = 0; s <= 100; s++) {
      expect(tierForScore(s)).toBe(tierFromScore(s));
    }
  });

  it('turns a score into a single headline call with matching color', () => {
    expect(scoreVerdict(90).call).toBe('STREAM IT');
    expect(scoreVerdict(90).visual.key).toBe('watch');
    expect(scoreVerdict(60).call).toBe('WORTH IT');
    expect(scoreVerdict(10).call).toBe('SKIP IT');
    expect(scoreVerdict(10).visual.key).toBe('skip');
  });
});
