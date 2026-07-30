/**
 * "CINDERELLA MAN" IS NOT "CINDERELLA".
 *
 * The similar-to path matched a named title against TMDB results with a raw
 * substring test in both directions:
 *
 *     a === b || a.includes(b) || b.includes(a)
 *
 * That cannot separate a title from a title it contains. Ask for the boxing
 * picture, get the fairy tale; ask for the fairy tale, get the boxing picture —
 * and no popularity ranking fixes it, because whichever is more famous wins
 * BOTH questions.
 *
 * Run against a whole sentence it was worse still. For "kinda like Rocky or
 * Cinderella Man that I probably haven't seen" the reference was never split,
 * so the entire clause was the search string — and "Man", "Seen" and "That"
 * all passed the substring test. The first junk result became the seed, its
 * media type became the filter, and a boxing request returned The Adventures of
 * Jimmy Neutron filtered to Shows.
 *
 * The behaviour is unit-tested in `nlu/titleReference.test.ts`. This pins the
 * WIRING, because `askJudge.ts` is server-only and cannot be imported into a
 * plain test process — and because the failure was never the algorithm (the
 * strict matcher already existed in `titleNormalize.ts`); it was that the live
 * path did not call it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveNamedTitle } from '@/lib/nlu/titleReference';
import { titleMatchTier } from '@/lib/nlu/titleNormalize';

const ROOT = join(__dirname, '..', '..', '..');
const src = readFileSync(join(ROOT, 'src/lib/askJudge.ts'), 'utf8');

describe('the substring title test is gone from the live path', () => {
  it('no raw two-way includes() comparison remains', () => {
    expect(src).not.toMatch(/a\s*===\s*b\s*\|\|\s*a\.includes\(b\)/);
    expect(src).not.toMatch(/a\.includes\(b\)\s*\|\|\s*b\.includes\(a\)/);
  });

  it('the near-match gate goes through the word-boundary tiering', () => {
    expect(src).toContain('titleMatchTier(');
  });

  it('the similar-to path resolves each named title strictly', () => {
    expect(src).toContain('referenceCandidates(');
    expect(src).toContain('resolveNamedTitle(');
  });

  it('a reference that resolves to no exact title seeds nothing at all', () => {
    // `resolveSeeds` must SKIP an unresolved name rather than fall back to the
    // nearest result. Substituting there is exactly how Cinderella Man became
    // Cinderella, and how a sentence became a cartoon.
    expect(src).toMatch(/if \(!match\) continue;/);
  });

  it('both named titles are used, not just the first', () => {
    expect(src).toMatch(/resolveSeeds\(refText,\s*2\b/);
    expect(src).toContain('neighbourhoods');
  });

  it('an explicitly stated media type is not overwritten by the seed\'s own', () => {
    // The read-back chip said "Shows" for a request beginning "a boxing movie",
    // because the seed's type was copied straight into the filter.
    expect(src).toContain('wantType ?? seed.mediaType');
    expect(src).not.toMatch(/mediaType:\s*seed\.mediaType\s*,/);
  });
});

describe('the property itself, end to end', () => {
  const catalogue = [
    { title: 'Cinderella', popularity: 950 },
    { title: 'Cinderella Man', popularity: 38 },
  ];

  it('the more famous containing title never answers for the one named', () => {
    expect(resolveNamedTitle('Cinderella Man', catalogue).match?.title).toBe('Cinderella Man');
    expect(resolveNamedTitle('Cinderella', catalogue).match?.title).toBe('Cinderella');
  });

  it('containment is reported as containment, never as identity', () => {
    expect(titleMatchTier('Cinderella Man', 'Cinderella')).toBe('contains');
    expect(titleMatchTier('Cinderella', 'Cinderella Man')).toBe('contains');
  });
});
