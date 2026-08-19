import { describe, it, expect } from 'vitest';
import { interpret } from '@/lib/interpret/interpret';

/**
 * IRRELEVANT BACKGROUND MUST NOT SWALLOW THE QUESTION.
 *
 * "I had a burrito and want something fun tonight" classified as a STATEMENT.
 * The clause splitter broke on punctuation but not on a coordinating "and", so
 * the whole utterance stayed one clause, led with "I had", tripped the
 * first-person and past-tense guards, and the actionable half vanished.
 *
 * Punctuated forms already worked — "Dinner was heavy, give me something fun"
 * and "Work was awful — what should I watch?" both split correctly. Only the
 * conjunction was missing, and the split is deliberately narrow: it fires only
 * when a request verb phrase follows, so "cops and robbers", "a comedy and a
 * thriller" and "Rocky and Creed" are untouched.
 */

describe('an actionable request survives irrelevant background', () => {
  const CASES = [
    'I had a burrito and want something fun tonight.',
    'I had a long day and want something easy tonight.',
    'Dinner was heavy, give me something fun.',
    'I just got home and need a short movie.',
    'Work was awful — what should I watch?',
    'I watched Rocky last week and want another boxing movie.',
    'I like Yellowstone. What should I watch?',
    'We have an hour before bed, find us something short.',
  ];
  for (const text of CASES) {
    it(`"${text}"`, () => {
      expect(interpret(text).kind, text).toBe('recommendation');
    });
  }

  it('the actionable half keeps its content, not just its classification', () => {
    expect(interpret('I watched Rocky last week and want another boxing movie.')
      .subjects.map((s) => s.span)).toContain('boxing');
    expect(interpret('I had a long day and want something easy tonight.')
      .tones.map((t) => t.term)).toContain('easy');
  });
});

describe('controls — background alone is still background', () => {
  const BACKGROUND = [
    'I had a burrito.',
    'Dinner was heavy.',
    'Work was awful.',
    'I watched Rocky last week.',
    'I just got home.',
  ];
  for (const text of BACKGROUND) {
    it(`"${text}" is not a request`, () => {
      expect(interpret(text).kind, text).not.toBe('recommendation');
    });
  }

  /* NOUN COORDINATION IS NOT A CLAUSE BOUNDARY. If the split fired on every
     "and", these would be torn in half and their spans destroyed. */
  it('"and" joining nouns does not split the clause', () => {
    expect(interpret('a movie about cops and robbers').subjects.map((s) => s.span)).toContain('cops');
    expect(interpret('something dark and gritty').tones.map((t) => t.term)).toContain('dark');
    expect(interpret('something dark and gritty').tones.map((t) => t.term)).toContain('gritty');
  });
});
