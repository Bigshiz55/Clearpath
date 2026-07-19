import { describe, it, expect } from 'vitest';
import {
  DIMENSION_KEYS,
  isValidDimensions,
  buildProfile,
  dimensionMatch,
  topDials,
  matchHighlights,
  type TitleDimensions,
} from './dimensions';

const fill = (v: number): TitleDimensions => Object.fromEntries(DIMENSION_KEYS.map((k) => [k, v]));
const withDims = (over: Partial<TitleDimensions>): TitleDimensions => ({ ...fill(50), ...over }) as TitleDimensions;

describe('isValidDimensions', () => {
  it('requires a finite 0..100 for every key', () => {
    expect(isValidDimensions(fill(50))).toBe(true);
    expect(isValidDimensions({ ...fill(50), pacing: 150 })).toBe(false);
    const { pacing, ...missing } = fill(50);
    void pacing;
    expect(isValidDimensions(missing)).toBe(false);
    expect(isValidDimensions(null)).toBe(false);
  });
});

describe('buildProfile + dimensionMatch', () => {
  it('a title like the ones you loved scores far above one unlike them', () => {
    // User loves dark, slow-burn titles.
    const profile = buildProfile([
      { dims: withDims({ darkness: 95, pacing: 10 }), rating: 9 },
      { dims: withDims({ darkness: 90, pacing: 15 }), rating: 10 },
    ]);
    const onTaste = dimensionMatch(withDims({ darkness: 92, pacing: 12 }), profile);
    const offTaste = dimensionMatch(withDims({ darkness: 8, pacing: 90 }), profile);
    expect(onTaste).toBeGreaterThan(offTaste);
    expect(onTaste).toBeGreaterThan(65);
    expect(offTaste).toBeLessThan(40);
  });

  it('a disliked title pushes the profile toward the opposite end', () => {
    // Hated a gory title → profile should prefer clean, and reward a clean one.
    const profile = buildProfile([{ dims: withDims({ gore: 95 }), rating: 2 }]);
    expect(profile.pref.gore!).toBeLessThan(50);
    expect(dimensionMatch(withDims({ gore: 5 }), profile)).toBeGreaterThan(
      dimensionMatch(withDims({ gore: 95 }), profile),
    );
  });

  it('returns neutral 50 when there is no signal', () => {
    expect(dimensionMatch(fill(50), buildProfile([]))).toBe(50);
  });

  it('ignores axes the user is neutral on', () => {
    // Strong only on humor; a title differing only on humor should track that.
    const profile = buildProfile([{ dims: withDims({ humor: 95 }), rating: 10 }]);
    const funny = dimensionMatch(withDims({ humor: 90 }), profile);
    const serious = dimensionMatch(withDims({ humor: 10 }), profile);
    expect(funny).toBeGreaterThan(serious);
  });
});

describe('topDials', () => {
  it('surfaces the decisive axes with the right lean', () => {
    const profile = buildProfile([
      { dims: withDims({ gore: 95, humor: 90 }), rating: 2 }, // hates gore & (via dislike) humor-opposite
      { dims: withDims({ pacing: 5 }), rating: 10 }, // loves slow burn
    ]);
    const dials = topDials(profile);
    expect(dials.length).toBeGreaterThan(0);
    const gore = dials.find((d) => d.dim.key === 'gore');
    if (gore) expect(gore.lean).toBe('Clean');
  });
});

describe('matchHighlights', () => {
  it('reports agreeing and clashing axes', () => {
    const profile = buildProfile([{ dims: withDims({ darkness: 95, humor: 5 }), rating: 10 }]);
    const h = matchHighlights(withDims({ darkness: 90, humor: 95 }), profile);
    expect(h.agree.some((a) => a.label === 'Tone')).toBe(true);
    expect(h.clash.some((c) => c.label === 'Humor')).toBe(true);
  });
});
