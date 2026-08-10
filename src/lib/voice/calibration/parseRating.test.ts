import { describe, it, expect } from 'vitest';
import { ACCEPT_THRESHOLD, combinedConfidence, parseRating } from './parseRating';

/**
 * These are the sentences a recogniser actually hands over. The product target
 * is that a spoken number advances in under half a second, which means a wrong
 * reading is worse than no reading — a silently mis-scored item is invisible,
 * while a re-ask costs one prompt. So the assertions below split into two
 * halves: what MUST parse, and what must REFUSE to.
 */

const rating = (s: string) => parseRating(s).value;

describe('the ways people say a number', () => {
  it('reads bare digits and words', () => {
    expect(rating('8')).toBe(8);
    expect(rating('10')).toBe(10);
    expect(rating('0')).toBe(0);
    expect(rating('eight')).toBe(8);
    expect(rating('ten')).toBe(10);
    expect(rating('zero')).toBe(0);
  });

  it('reads hedged numbers, which is how most people answer', () => {
    expect(rating('probably a seven')).toBe(7);
    expect(rating('like an eight')).toBe(8);
    expect(rating("I'd say about a 6")).toBe(6);
    expect(rating('uhh, four I guess')).toBe(4);
    expect(rating('ten out of ten')).toBe(10);
  });

  it('reads an opinion given instead of a number', () => {
    expect(rating('none')).toBe(0);
    expect(rating('hate it')).toBe(0);
    expect(rating('never show me that')).toBe(0);
    expect(rating('love it')).toBe(10);
    expect(rating('not really')).toBe(3);
    expect(rating('meh')).toBe(5);
    expect(rating('yeah')).toBe(7);
  });

  it('recovers the classic mishearings when the answer is just that word', () => {
    expect(rating('ate')).toBe(8);
    expect(rating('won')).toBe(1);
    expect(rating('for')).toBe(4);
    expect(rating('oh')).toBe(0);
    expect(parseRating('ate').via).toBe('homophone');
  });

  it('never lets a homophone hijack a real number', () => {
    // "for" is a 4 and "eight" is an 8; the number word has to win outright.
    expect(rating("I'd go for eight")).toBe(8);
    expect(rating('two or three... no, three')).toBe(3);
  });

  it('does not mine a homophone out of an ordinary sentence', () => {
    // Tier 4 only fires on a short utterance, so this is a re-ask, not a 4.
    expect(parseRating('yeah I could go for that one I think').via).not.toBe('homophone');
  });
});

describe('refusing rather than guessing', () => {
  it('will not choose between two different numbers', () => {
    expect(parseRating('seven or eight').intent).toBe('none');
    expect(parseRating('three, four, something like that').intent).toBe('none');
  });

  it('will not average a genuinely mixed opinion', () => {
    expect(parseRating('love it but not really').intent).toBe('none');
  });

  it('rejects anything off the scale', () => {
    expect(parseRating('eleven').intent).toBe('none');
    expect(parseRating('42').intent).toBe('none');
    expect(parseRating('100').intent).toBe('none');
  });

  it('treats silence and noise as nothing heard', () => {
    for (const s of ['', '   ', 'hmm', 'uh']) expect(parseRating(s).intent).toBe('none');
  });
});

describe('navigation is not a rating', () => {
  it('hears skip and back', () => {
    expect(parseRating('skip').intent).toBe('skip');
    expect(parseRating('pass').intent).toBe('skip');
    expect(parseRating('no idea').intent).toBe('skip');
    expect(parseRating('go back').intent).toBe('back');
  });

  it('prefers a number over a skip word in the same breath', () => {
    // "skip it — seven" is an answer, and treating it as a skip loses data.
    expect(parseRating('skip it, seven').intent).toBe('rating');
    expect(rating('skip it, seven')).toBe(7);
  });

  it('does not mine "go back" for a number', () => {
    expect(parseRating('go back one').intent).toBe('back');
  });
});

describe('confidence decides whether we ask again', () => {
  it('a clear number is certain enough to accept', () => {
    expect(combinedConfidence(parseRating('8'))).toBeGreaterThanOrEqual(ACCEPT_THRESHOLD);
  });

  it('a poor microphone reading drags an answer under the bar', () => {
    expect(combinedConfidence(parseRating('8'), 0.05)).toBeLessThan(ACCEPT_THRESHOLD);
  });

  it('a browser that reports no confidence at all does not block a clear answer', () => {
    // Safari always reports 0. Treating that as "no confidence" would re-ask
    // every single item on that browser.
    expect(combinedConfidence(parseRating('8'), 0)).toBeGreaterThanOrEqual(ACCEPT_THRESHOLD);
    expect(combinedConfidence(parseRating('8'), undefined)).toBeGreaterThanOrEqual(ACCEPT_THRESHOLD);
  });

  it('an interpreted phrase is accepted, a guessed homophone with a bad mic is not', () => {
    expect(combinedConfidence(parseRating('love it'))).toBeGreaterThanOrEqual(ACCEPT_THRESHOLD);
    expect(combinedConfidence(parseRating('ate'), 0.1)).toBeLessThan(ACCEPT_THRESHOLD);
  });
});
