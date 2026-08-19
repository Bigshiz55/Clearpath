import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const why = read('src/components/watch/WhyThisTitle.tsx');
const dnaClient = read('src/lib/dnaClient.ts');

/**
 * THE CONCERN REACHES THE READER — STRUCTURALLY GUARANTEED.
 *
 * `/api/dna` has always returned `fit: { agree, clash }`. The card consumed
 * `agree` and dropped `clash`, so the reader saw only the case FOR a title.
 * These assertions keep the honest half wired, and keep it visually distinct
 * from an endorsement — a caution rendered in the endorsement's colour is a
 * caution nobody reads as one.
 *
 * Source-level, matching `cardSeparation.test.ts` in this directory: the
 * component fetches on mount and the suite runs in a node environment, so the
 * wiring is what can be guaranteed here. The BEHAVIOUR of the reason builder is
 * covered by `src/lib/reasons/tasteConcerns.test.ts`.
 */

describe('taste concerns reach the card', () => {
  it('the API still returns the clash half, so there is something to render', () => {
    expect(dnaClient).toMatch(/clash/);
  });

  it('the card passes clash into the reason builder', () => {
    expect(why, 'fit.clash is fetched and dropped again').toMatch(/tasteConcerns:\s*\(dna\?\.fit\?\.clash/);
  });

  it('a concern is not rendered in the endorsement colour', () => {
    // emerald is the "fits" chip; a caution must not borrow it.
    const concernBlocks = why.split('concern').slice(1).join('concern');
    expect(concernBlocks).toMatch(/amber/);
  });

  it('a concern is addressable separately from a reason', () => {
    expect(why).toMatch(/data-testid=\{r\.kind === 'concern' \? 'why-concern' : 'why-reason'\}/);
  });

  it('no raw personalization internals reach the markup', () => {
    for (const leak of ['preferenceNudge', 'dimensionMatch', 'rankScore', 'personalScore', 'embedding']) {
      expect(why, `${leak} leaked into the card`).not.toContain(leak);
    }
  });
});
