/**
 * ONE LABEL, ONE NUMBER — "Your VERD1CT" may only ever caption the canonical
 * score.
 *
 * THE DEFECT, MEASURED AT 975938f. Four different quantities were being
 * printed under the same brand label on the same screens:
 *
 *   - `WatchCall` (cards, QuickLook, ratings strip) printed
 *     `dna.canonical.score` — the canonical contract (#86).
 *   - `AlgorithmScore` (the pink panel `PosterCard` mounts) printed
 *     `dna.score` — the taste blend — as "Your VERD1CT".
 *   - `CardDna` printed `dna.tasteScore` — the raw taste fit — as
 *     "Your VERD1CT".
 *   - `DnaScore` (title page) printed `dna.score` + the AI nudge as
 *     "Your VERD1CT".
 *
 * One card could show three different numbers under one label. That is not a
 * style problem: a label is a claim about identity, and the canonical scoring
 * contract exists precisely so that claim has one referent (INV-5: one
 * identity owns cross-surface score state).
 *
 * These are source-reading pins in the `productionWiring.test.ts` idiom: the
 * lib-level agreement is already pinned by `crossSurface.test.ts`; what let
 * this defect ship was that NO test looked at what the components actually
 * print. Copy may change; the LAW is: the brand label reads the canonical
 * field, the taste view is labeled as taste, and raw unbadged numbers do not
 * impersonate either.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('the brand label reads the canonical score', () => {
  it('AlgorithmScore headlines canonical, not the taste blend', () => {
    const src = read('src/components/AlgorithmScore.tsx');
    expect(src, 'the headline must read canonical first').toMatch(/canonical\?\.score/);
    expect(src, 'personalization must come from the canonical contract').toMatch(/canonical\?\.personalized/);
  });

  it('DnaScore headlines canonical; the AI strip stays the taste view', () => {
    const src = read('src/components/DnaScore.tsx');
    expect(src, 'the title-page headline must read canonical first').toMatch(/canonical\?\.score/);
  });

  it('CardDna shows the taste fit under a TASTE label, never the brand label', () => {
    const src = read('src/components/CardDna.tsx');
    // The taste-fit row is welcome — it just may not impersonate the verdict.
    expect(src, 'the taste row still claims to be the verdict').not.toMatch(/Your VERD/);
  });

  it('VerdictDelivery keeps canonical through its type boundary', () => {
    const src = read('src/components/VerdictDelivery.tsx');
    expect(src, 'the /api/dna response was narrowed in a way that discards canonical').toMatch(/canonical/);
  });

  it('the search row wears the badge instead of a raw unbadged number', () => {
    const src = read('src/components/search/SearchResultRow.tsx');
    expect(src, 'the score must carry the one visual identity').toMatch(/Verd1ctBadge/);
  });
});

describe('score-name hygiene', () => {
  it('the orphan /api/dna-score route (profile strength wearing a title-score name) is gone', () => {
    expect(
      existsSync(join(ROOT, 'src/app/api/dna-score/route.ts')),
      'a route named dna-score that returns PROFILE strength is a name collision with the title DNA score, and nothing calls it',
    ).toBe(false);
  });

  it("canonical.ts's docstring does not point at a file that does not exist", () => {
    const src = read('src/lib/scoring/canonical.ts');
    expect(src).not.toMatch(/src\/lib\/canonicalScore\.ts/);
  });
});
