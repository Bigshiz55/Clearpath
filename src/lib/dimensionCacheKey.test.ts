/**
 * THE CARD'S "WHY IT FITS" WAS DEAD, EVERYWHERE, ALWAYS.
 *
 * P0-E asks whether the reason shown matches the ranking that produced it. On
 * this pipeline the answer was no, for a reason no amount of reading the copy
 * would have found: `dimensionFitFor` — the sole source of the card's taste
 * agreements and its "Heads up" concerns — looked its fingerprint up under
 * `${mediaType}:${id}`, and the cache stores every fingerprint under
 * `${mediaType}-${id}`. A colon where the map has a hyphen. The lookup missed
 * on every title for every user, `fit` came back null, and the card rendered
 * the factual reasons only.
 *
 * That is the worst shape a defect can take here, because its failure mode is
 * SILENCE: a missing reason is indistinguishable from having nothing to say.
 * Meanwhile `personalRanking.ts` read the same cache with the right key and
 * moved the title's rank. So the ranking was personalized and the explanation
 * was not — the exact mismatch P0-E is about, and it had been shipping.
 *
 * The key is now stated ONCE (`fingerprintKey`) and derived everywhere. Seven
 * readers had written it out by hand and agreed; the eighth did not, and hand
 * agreement is not a contract. This test is the contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fingerprintKey } from '@/lib/taste/fingerprint';
import { DIMENSION_KEYS, type DimensionProfile, type TitleDimensions } from '@/lib/scoring/dimensions';

/* Built from the real vocabulary, not a hand-typed copy — a mock that has
   drifted from the schema proves nothing about the schema. */
const DIMS = Object.fromEntries(DIMENSION_KEYS.map((k, i) => [k, 20 + ((i * 7) % 70)])) as TitleDimensions;

/* A profile with real decisiveness and real evidence weight, so
   `matchHighlights` actually has axes to report. `samples` clears
   MIN_SAMPLES_FOR_FIT. */
const PROFILE: DimensionProfile = {
  pref: Object.fromEntries(DIMENSION_KEYS.map((k, i) => [k, i % 2 === 0 ? 85 : 15])),
  weight: Object.fromEntries(DIMENSION_KEYS.map((k) => [k, 20])),
  samples: 12,
};

vi.mock('@/lib/titleDimensions', () => ({
  getCachedDimensions: vi.fn(async () => new Map([[fingerprintKey({ mediaType: 'movie', tmdbId: 603 }), DIMS]])),
  getUserDimensionProfile: vi.fn(async () => PROFILE),
  getTitleDimensions: vi.fn(async () => null),
}));

describe('the card reads the fingerprint cache with the key the cache writes', () => {
  beforeEach(() => vi.resetModules());

  it('dimensionFitFor finds a fingerprint that is actually cached', async () => {
    const { dimensionFitFor } = await import('@/lib/dna');
    const fit = await dimensionFitFor({} as never, 'user-1', 'movie', 603, 12);
    expect(fit, 'the lookup missed a fingerprint the cache holds').not.toBeNull();
    expect(Array.isArray(fit!.agree) && Array.isArray(fit!.clash)).toBe(true);
  });

  it('every reader derives the key rather than writing it out', () => {
    // A hand-written `${mediaType}-${id}` is how the eighth reader drifted; the
    // seven that happened to agree were luck, not a guarantee.
    const READERS = [
      'src/lib/dna.ts',
      'src/lib/ask/personalRanking.ts',
      'src/lib/packs/dna.ts',
      'src/lib/actions/dnaQuiz.ts',
      'src/lib/actions/rapidFire.ts',
      'src/lib/actions/showdown.ts',
      'src/lib/showdown/payoffPool.ts',
      'src/lib/showdown/dimensionCoverage.ts',
      'src/lib/scoreSamples.ts',
      'src/lib/titleDimensions.ts',
      'src/app/api/cron/classify/route.ts',
    ];
    for (const f of READERS) {
      const raw = readFileSync(f, 'utf8');
      // Comments explain the defect and quote the broken key on purpose; the
      // contract is about what the module DOES.
      const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      /* THE CONTRACT IS ABOUT MAP ACCESS, not about template literals in
         general. `movie:603` is also a legitimate `titleId` in this codebase
         (showdown events, preference rows) and stays as it is. What may never
         be hand-written is the key a fingerprint map is READ or WRITTEN with —
         that is the one both halves have to agree on, and the one that drifted.
         So: no `.get(\`…\`)` / `.set(\`…\`)` whose literal joins a media type
         to an id. */
      const handWritten = (src.match(/\.(?:get|set|has)\(`[^`\n]*`/g) ?? []).filter(
        (call) => /media[_]?[Tt]ype/.test(call) && /(?:tmdb_?[Ii]d|\bid\b)/.test(call),
      );
      expect(handWritten, `${f} builds a cache key by hand: ${handWritten.join(', ')}`).toEqual([]);
      expect(raw, `${f} must derive the key`).toMatch(/fingerprintKey\(/);
    }
  });
});
