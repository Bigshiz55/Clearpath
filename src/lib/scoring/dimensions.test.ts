import { describe, it, expect } from 'vitest';
import {
  DIMENSION_KEYS,
  isValidDimensions,
  buildProfile,
  dimensionMatch,
  dnaStrength,
  topDials,
  tasteDials,
  applyOverrides,
  profileConfidence,
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

describe('dnaStrength', () => {
  it('is 0 for an empty profile and always in 0..100', () => {
    const s = dnaStrength(buildProfile([]));
    expect(s).toBe(0);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  it('grows as you rate more decisive titles', () => {
    const few = dnaStrength(buildProfile([{ dims: withDims({ darkness: 95, pacing: 5 }), rating: 10 }]));
    const many = dnaStrength(
      buildProfile(
        Array.from({ length: 40 }, () => ({ dims: withDims({ darkness: 95, pacing: 5, humor: 5 }), rating: 10 })),
      ),
    );
    expect(many).toBeGreaterThan(few);
    expect(many).toBeLessThanOrEqual(100);
  });

  it('a decisive taste scores above a wishy-washy one at equal volume', () => {
    const rows = (over: Partial<TitleDimensions>) => Array.from({ length: 20 }, () => ({ dims: withDims(over), rating: 9 }));
    const decisive = dnaStrength(buildProfile(rows({ darkness: 98, humor: 2, pacing: 5 })));
    const bland = dnaStrength(buildProfile(rows({ darkness: 52, humor: 48, pacing: 51 })));
    expect(decisive).toBeGreaterThan(bland);
  });
});

describe('tasteDials', () => {
  const strong = buildProfile(
    Array.from({ length: 30 }, () => ({ dims: withDims({ darkness: 96, humor: 4, pacing: 8 }), rating: 9 })),
  );

  it('carries confidence, sample count, lean and a strength tier', () => {
    const dials = tasteDials(strong);
    expect(dials.length).toBeGreaterThan(0);
    const dark = dials.find((d) => d.dim.key === 'darkness')!;
    expect(dark.lean).toBe('Dark');
    expect(dark.samples).toBe(30);
    expect(dark.confidence).toBeGreaterThan(0.5);
    expect(dark.tier).toBe('strong');
  });

  it('labels a thin profile as still learning', () => {
    const thin = buildProfile([{ dims: withDims({ darkness: 70 }), rating: 7 }]);
    const dials = tasteDials(thin);
    if (dials.length) expect(dials.every((d) => d.confidence < 0.3 ? d.tier === 'learning' : true)).toBe(true);
  });

  it('always surfaces a pinned axis and marks it, even with no learned signal', () => {
    const empty = buildProfile([]);
    const pinned = applyOverrides(empty, { romance: { pref: 90, isLimit: false }, gore: { pref: 0, isLimit: true } });
    const dials = tasteDials(pinned);
    const romance = dials.find((d) => d.dim.key === 'romance')!;
    expect(romance.pinned).toBe(true);
    expect(romance.tier).toBe('strong');
    const gore = dials.find((d) => d.dim.key === 'gore')!;
    expect(gore.isLimit).toBe(true);
  });
});

describe('applyOverrides', () => {
  it('overlays the pinned value, ignores unknown keys, and clamps', () => {
    const p = applyOverrides(buildProfile([]), {
      humor: { pref: 120, isLimit: false }, // clamps to 100
      bogus: { pref: 50, isLimit: false },
    });
    expect(p.pref.humor).toBe(100);
    expect(p.overrides?.humor).toEqual({ pref: 100, isLimit: false });
    expect(p.overrides?.bogus).toBeUndefined();
  });

  it('a pinned dial steers matching toward the chosen end', () => {
    const p = applyOverrides(buildProfile([]), { violence: { pref: 5, isLimit: true } });
    expect(dimensionMatch(withDims({ violence: 5 }), p)).toBeGreaterThan(dimensionMatch(withDims({ violence: 95 }), p));
  });
});

describe('profileConfidence', () => {
  it('rises with more, stronger ratings and stays in 0..1', () => {
    const few = profileConfidence(buildProfile([{ dims: withDims({ darkness: 90 }), rating: 7 }]));
    const many = profileConfidence(
      buildProfile(Array.from({ length: 30 }, () => ({ dims: withDims({ darkness: 90 }), rating: 10 }))),
    );
    expect(few).toBeGreaterThanOrEqual(0);
    expect(many).toBeGreaterThan(few);
    expect(many).toBeLessThanOrEqual(1);
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
