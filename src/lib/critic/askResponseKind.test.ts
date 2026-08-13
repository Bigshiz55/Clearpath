import { describe, it, expect } from 'vitest';
import { classifyAskResponse } from './askResponseKind';

/**
 * THE CLIENT MUST BRANCH ON SEMANTIC STATE, NOT ON ARRAY LENGTH.
 *
 * Found by review on PR #59. The Ask UI entered the clarification branch only
 * when `comparisonOptions.length > 0`, so a NOT_FOUND anchor — which correctly
 * carries an EMPTY option list, because inventing candidates for a title we
 * cannot find is precisely the guess this workstream exists to prevent — fell
 * through to the generic results branch and rendered
 *
 *   "No title clears all of that. Remove a chip below or re-file…"
 *
 * immediately followed by the clarification question. Two contradictory
 * statements about the same turn.
 *
 * The decision lives here as a pure function rather than inline in the
 * component: this repo tests components by extracting their decisions, and an
 * emptiness check masquerading as a state check is exactly the kind of bug that
 * hides inside JSX.
 */

const CLARIFY_BASE = { kind: 'clarify', clarify: 'Which Furious did you mean?', items: [] };

describe('classifyAskResponse · clarification is a STATE, not a count', () => {
  it('1 · NOT_FOUND — clarify with NO options is still a clarification', () => {
    /* THE REGRESSION. An empty option list is meaningful data: we know the
       title is unfindable and are asking the user to correct it. */
    expect(classifyAskResponse({ ...CLARIFY_BASE, comparisonOptions: [] })).toBe('clarify-question');
  });

  it('2 · …and it must NOT be treated as an empty result set', () => {
    const kind = classifyAskResponse({ ...CLARIFY_BASE, comparisonOptions: [], items: [] });
    expect(kind).not.toBe('results');
  });

  it('3 · a missing comparisonOptions field behaves the same way', () => {
    expect(classifyAskResponse({ kind: 'clarify', clarify: 'Which one?' })).toBe('clarify-question');
  });

  it('4 · AMBIGUOUS — clarify WITH options renders the candidate picker', () => {
    const kind = classifyAskResponse({
      ...CLARIFY_BASE,
      comparisonOptions: [{ tmdbId: 415381, title: 'Furious', mediaType: 'movie', year: 2017 }],
    });
    expect(kind).toBe('clarify-options');
  });

  it('5 · RESOLVED — an ordinary comparative answer is unchanged', () => {
    expect(classifyAskResponse({ kind: 'search', items: [{ id: 1 }] })).toBe('results');
    expect(classifyAskResponse({ kind: 'search', items: [] })).toBe('results');
  });

  it('6 · a named-title ruling is still its own branch', () => {
    expect(classifyAskResponse({ kind: 'title', verdict: { id: 1 } })).toBe('title');
  });

  it('7 · a title response without a verdict is not a ruling', () => {
    // The old guard was `kind === 'title' && data.verdict`; keep that pairing.
    expect(classifyAskResponse({ kind: 'title' })).toBe('results');
  });

  it('8 · junk and absent payloads degrade to the ordinary branch', () => {
    for (const v of [null, undefined, {}, { kind: 'nonsense' }, 'nope', 42]) {
      expect(classifyAskResponse(v), String(v)).toBe('results');
    }
  });

  it('9 · options that are not an array never fake a picker', () => {
    expect(classifyAskResponse({ ...CLARIFY_BASE, comparisonOptions: 'lots' })).toBe('clarify-question');
    expect(classifyAskResponse({ ...CLARIFY_BASE, comparisonOptions: {} })).toBe('clarify-question');
  });
});
