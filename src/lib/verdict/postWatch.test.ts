import { describe, it, expect } from 'vitest';
import {
  REACTIONS,
  reactionOption,
  reactionFromRating,
  alreadyAnswered,
  bandFor,
  gradeCall,
  accuracyLine,
  MIN_ACCURACY_SAMPLE,
  type Reaction,
  type CallResult,
} from './postWatch';
import { tierFromScore, primaryCallFromTier } from '@/lib/scoring/verdict';

describe('the four reactions', () => {
  it('offers exactly the four plain-language options, in descending order', () => {
    expect(REACTIONS.map((r) => r.id)).toEqual(['loved', 'liked', 'okay', 'not_for_me']);
    expect(REACTIONS.map((r) => r.label)).toEqual(['Loved it', 'Liked it', 'It was okay', 'Not for me']);
    for (let i = 1; i < REACTIONS.length; i++) {
      expect(REACTIONS[i]!.rating).toBeLessThan(REACTIONS[i - 1]!.rating);
    }
  });

  it('keeps every rating inside the column constraint (1..10)', () => {
    for (const r of REACTIONS) {
      expect(r.rating).toBeGreaterThanOrEqual(1);
      expect(r.rating).toBeLessThanOrEqual(10);
      expect(Number.isInteger(r.rating)).toBe(true);
    }
  });

  it('round-trips through the rating we store — this is what dedupe depends on', () => {
    for (const r of REACTIONS) {
      expect(reactionFromRating(r.rating)).toBe(r.id);
    }
  });

  it('maps a hand-set watchlist rating onto the nearest reaction', () => {
    expect(reactionFromRating(9)).toBe('loved');
    expect(reactionFromRating(7)).toBe('liked');
    expect(reactionFromRating(5)).toBe('okay');
    expect(reactionFromRating(4)).toBe('not_for_me');
    expect(reactionFromRating(1)).toBe('not_for_me');
  });

  it('treats a missing rating as unanswered — and any rating as answered', () => {
    expect(reactionFromRating(null)).toBeNull();
    expect(reactionFromRating(undefined)).toBeNull();
    expect(reactionFromRating(Number.NaN)).toBeNull();
    expect(alreadyAnswered(null)).toBe(false);
    expect(alreadyAnswered(undefined)).toBe(false);
    // A user who rated 1/10 by hand has answered. We must not ask them again.
    expect(alreadyAnswered(1)).toBe(true);
    expect(alreadyAnswered(10)).toBe(true);
  });

  it('throws rather than silently defaulting on an unknown reaction', () => {
    expect(() => reactionOption('nope' as Reaction)).toThrow();
  });
});

describe('the band we actually told them', () => {
  it('agrees with the engine at EVERY score — we grade the call we printed', () => {
    // This is the point of deriving the band instead of re-declaring
    // thresholds: if the engine's tiers ever move, grading moves with them.
    // A drift here would mean scoring ourselves against a call we never made.
    const expected = (n: number) => {
      const call = primaryCallFromTier(tierFromScore(n));
      return call === 'WATCH IT' ? 'watch' : call === 'MAYBE' ? 'maybe' : 'skip';
    };
    for (let n = 0; n <= 100; n++) {
      expect(bandFor(n), `score ${n}`).toBe(expected(n));
    }
  });

  it('covers all three bands', () => {
    expect(bandFor(100)).toBe('watch');
    expect(bandFor(60)).toBe('maybe');
    expect(bandFor(0)).toBe('skip');
  });
});

describe('grading our own call', () => {
  it('scores a confident recommendation the user loved as a hit', () => {
    const g = gradeCall(88, 'loved');
    expect(g.result).toBe('hit');
    expect(g.band).toBe('watch');
    expect(g.headline).toBe('We called it.');
    expect(g.detail).toContain('88');
  });

  it('scores a confident recommendation the user rejected as a miss', () => {
    const g = gradeCall(88, 'not_for_me');
    expect(g.result).toBe('miss');
    expect(g.headline).toBe('We got that one wrong.');
  });

  it('counts talking someone out of something they liked as a FULL miss', () => {
    // The costliest error the product can make: we suppressed a title they
    // would have enjoyed. It must not be softened to "partial".
    expect(gradeCall(31, 'liked').result).toBe('miss');
    expect(gradeCall(31, 'loved').result).toBe('miss');
  });

  it('never lets a hedge score a full miss in either direction', () => {
    const reactions: Reaction[] = ['loved', 'liked', 'okay', 'not_for_me'];
    for (const r of reactions) {
      expect(gradeCall(60, r).result).not.toBe('miss');
    }
  });

  it('does not flatter itself: a maybe only scores a clean hit in the middle', () => {
    expect(gradeCall(60, 'liked').result).toBe('hit');
    expect(gradeCall(60, 'okay').result).toBe('hit');
    expect(gradeCall(60, 'loved').result).toBe('partial');
    expect(gradeCall(60, 'not_for_me').result).toBe('partial');
  });

  it('grades nothing when there was no score on record, and says why', () => {
    for (const missing of [null, undefined, Number.NaN]) {
      const g = gradeCall(missing, 'loved');
      expect(g.result).toBeNull();
      expect(g.band).toBeNull();
      expect(g.detail).toMatch(/didn’t have a score/);
    }
  });

  it('always quotes back both halves of the comparison', () => {
    const g = gradeCall(74, 'okay');
    expect(g.detail).toContain('74');
    expect(g.detail.toLowerCase()).toContain('it was okay');
  });
});

describe('the accuracy claim is gated', () => {
  const hits = (n: number): CallResult[] => Array.from({ length: n }, () => 'hit' as CallResult);

  it('refuses to state a percentage below the minimum sample', () => {
    for (let n = 0; n < MIN_ACCURACY_SAMPLE; n++) {
      const line = accuracyLine(hits(n));
      expect(line.shown).toBe(false);
      // The most dangerous possible output here is "100% accurate" off three
      // rows. The text must not contain a percentage at all.
      expect(line.text).not.toMatch(/\d+%/);
    }
  });

  it('counts down honestly toward the threshold', () => {
    expect(accuracyLine(hits(0)).text).toContain(`${MIN_ACCURACY_SAMPLE} calls`);
    const line = accuracyLine(hits(7));
    expect(line.graded).toBe(7);
    expect(line.text).toContain('3 more');
  });

  it('states the rate once there is enough of it', () => {
    const line = accuracyLine(hits(MIN_ACCURACY_SAMPLE));
    expect(line.shown).toBe(true);
    expect(line.percent).toBe(100);
    expect(line.text).toContain('100%');
    expect(line.text).toContain('10');
  });

  it('gives a partial half credit — neither bucket alone is truthful', () => {
    const rows: CallResult[] = [...hits(5), ...Array.from({ length: 5 }, () => 'partial' as CallResult)];
    expect(accuracyLine(rows).percent).toBe(75);
  });

  it('reports a bad run as a bad run', () => {
    const rows: CallResult[] = Array.from({ length: 12 }, () => 'miss' as CallResult);
    const line = accuracyLine(rows);
    expect(line.shown).toBe(true);
    expect(line.percent).toBe(0);
    expect(line.text).toContain('0%');
  });

  it('ignores ungradable calls entirely rather than scoring them as failures', () => {
    const rows: (CallResult | null)[] = [...hits(10), null, null, null];
    const line = accuracyLine(rows);
    expect(line.graded).toBe(10);
    expect(line.percent).toBe(100);
  });
});
