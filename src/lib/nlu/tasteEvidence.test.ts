import { describe, it, expect } from 'vitest';
import { tasteEvidenceText } from './tasteEvidence';

/**
 * WHAT MAY WRITE TO THE TASTE FILE. The production defect: taste extraction
 * read the WHOLE utterance, so "a boxing movie" — a request — became
 * likedTitles:["a boxing movie"] and a real title got rated 9/10. These pin
 * the selection rule: in a routed request only durable-preference clauses
 * survive; in a statement everything but companion clauses does.
 */
describe('routed requests: only durable preference writes', () => {
  it('a bare request yields NO evidence at all', () => {
    for (const q of ['a boxing movie', 'another boxing movie', '3 Sylvester Stallone movies', 'a romantic comedy for my wife']) {
      expect(tasteEvidenceText(q, { routedRequest: true }), q).toBe('');
    }
  });

  it('a mixed utterance keeps its durable half and sheds its request', () => {
    const out = tasteEvidenceText('I love slow burns but I hate gore. Give me a thriller tonight.', { routedRequest: true });
    expect(out).toMatch(/love slow burns/i);
    expect(out).not.toMatch(/give me|thriller tonight/i);
  });

  it('an evaluative reaction survives as evidence ("loved Ted Lasso")', () => {
    const out = tasteEvidenceText('Give me feel-good comedies — loved Ted Lasso', { routedRequest: true });
    expect(out).toMatch(/loved ted lasso/i);
    expect(out).not.toMatch(/give me/i);
  });

  it('bare familiarity is not taste ("I watched X yesterday")', () => {
    const out = tasteEvidenceText('I watched a horror movie yesterday. Give me a courtroom movie.', { routedRequest: true });
    expect(out).not.toMatch(/horror/i);
  });
});

describe('statements: the whole text remains evidence, minus companions', () => {
  it('a pure taste statement passes through', () => {
    expect(tasteEvidenceText('I love slow burns but I hate gore.', { routedRequest: false })).toMatch(/slow burns/i);
  });

  it('descriptor lists without preference verbs still build (the box promise)', () => {
    const out = tasteEvidenceText('fast action-packed blockbusters, big stakes, don’t care about deep plots', { routedRequest: false });
    expect(out).toMatch(/action-packed/i);
  });

  it("a companion's taste never reaches the user's extractor", () => {
    expect(tasteEvidenceText('My wife likes comedies', { routedRequest: false })).toBe('');
    const mixed = tasteEvidenceText('My wife likes comedies. I like courtroom dramas.', { routedRequest: false });
    expect(mixed).toMatch(/courtroom/i);
    expect(mixed).not.toMatch(/wife|comedies/i);
  });
});
