/**
 * "SOMETHING LIKE TULSA KING THAT I WOULD LIKE".
 *
 * A real ask that returned six unrelated new releases. Two faults produced it,
 * and both are pinned here:
 *
 *   1. THE REFERENCE CAME BACK EMPTY. The extractor took the LAST comparison
 *      cue, and that sentence ends on a bare "like" with nothing after it. No
 *      reference meant the similarity path bailed and the ask silently degraded
 *      to generic discovery — which looks, from the outside, exactly like the
 *      feature not existing.
 *   2. ONLY ONE ROUTE COULD ANSWER IT. The Refine box posts to /api/finder,
 *      which read the AI's `query` and dropped its `similarTo` on the floor.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractReference } from '@/lib/askJudge';
import { classifySearch } from '@/lib/nlu/searchMode';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('extractReference', () => {
  it('THE BUG: a trailing "that I would like" no longer eats the reference', () => {
    expect(extractReference('Looking for something similar to Tulsa King that I would like')).toBe('Tulsa King');
    expect(extractReference('give me something like Tulsa King that I would like')).toBe('Tulsa King');
    expect(extractReference("something like Fargo that I'd enjoy")).toBe('Fargo');
    expect(extractReference('a show like Severance for me')).toBe('Severance');
  });

  it('still works on the plain forms', () => {
    expect(extractReference('something like Tulsa King')).toBe('Tulsa King');
    expect(extractReference('shows like Mindhunter')).toBe('Mindhunter');
    expect(extractReference('in the vein of Fargo')).toBe('Fargo');
    // A leading "The" is stripped as filler. Harmless: the title search matches
    // "Sopranos" to "The Sopranos" either way.
    expect(extractReference('reminds me of The Sopranos')).toBe('Sopranos');
  });

  it('still prefers the later cue when both leave a real title', () => {
    expect(extractReference("shows I'd enjoy if I liked Fargo")).toBe('Fargo');
  });

  it('is null when there is no comparison at all', () => {
    expect(extractReference('a crime thriller under two hours')).toBeNull();
    expect(extractReference('Tulsa King')).toBeNull();
  });

  it('does not swallow a title that merely contains a filler word', () => {
    expect(extractReference('something like Like Water for Chocolate')).toBe('Like Water for Chocolate');
  });

  it('trims trailing punctuation rather than carrying it into the search', () => {
    expect(extractReference('anything like Ozark?')).toBe('Ozark');
    expect(extractReference('movies like Heat.')).toBe('Heat');
  });
});

describe('the classifier still calls it a similarity ask', () => {
  it('recognises every phrasing the user actually typed', () => {
    for (const t of [
      'Looking for something similar to Tulsa King that I would like',
      'give me something like Tulsa King that I would like',
      'something like Tulsa King',
    ]) {
      expect(classifySearch(t)?.mode, t).toBe('similar_to');
    }
  });
});

describe('both retrieval routes answer it', () => {
  it('the finder route runs the similarity path, not just generic discovery', () => {
    const route = read('src/app/api/finder/route.ts');
    expect(route).toContain('askSimilarTo');
    expect(route).toContain('classifySearch');
    expect(route).toContain('extractReference');
  });

  it('neither route lets the classifier’s raw span outrank a real extraction', () => {
    // `cls.reference` is the whole sentence for these phrasings, so preferring
    // it is what made the fix invisible on the ask route too.
    for (const p of ['src/app/api/finder/route.ts', 'src/app/api/ask/route.ts']) {
      const route = read(p);
      const at = route.indexOf('const reference =');
      expect(at, p).toBeGreaterThan(-1);
      const expr = route.slice(at, route.indexOf(';', at));
      expect(expr.indexOf('extractReference'), p).toBeLessThan(expr.indexOf('cls.reference'));
    }
  });
});
