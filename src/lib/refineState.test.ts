import { describe, it, expect } from 'vitest';
import { effectiveConstraints, canonicalQueryKey, normalizeQuery, activeFilterChips } from './refineState';
import { naiveParseQuery, EMPTY_QUERY } from './finderParse';
import type { FinderQuery } from './finder';

const base = (over: Partial<FinderQuery> = {}): FinderQuery => ({ ...EMPTY_QUERY, genreIds: [], ...over });

describe('FAMILY MOVIE NIGHT — the permanent refinement regression flow', () => {
  it('runs the full mandated sequence: parse → refine → key change → audio stays off', () => {
    // 1-2. Search "Family movie night" and record the original plan + key.
    const original = naiveParseQuery('Family movie night');
    const key0 = canonicalQueryKey(original, 'Family movie night', null);

    // 10. English audio must be OFF by default — nothing in this ask requests it.
    expect(original.englishAudioOnly).toBe(false);

    // 6-9. Change runtime, audience minimum, IMDb minimum, and Your Match minimum.
    const refined = effectiveConstraints({
      queryConstraints: original,
      savedPreferences: {},
      temporaryRefinements: { maxRuntime: 120, minAudience: 70, minImdb: 6.5, minMatch: 60 },
    });

    // 10 again. The refinements did not sneak English audio on.
    expect(refined.englishAudioOnly).toBe(false);

    // 12-13. A new plan exists and the cache key changed.
    const key1 = canonicalQueryKey(refined, 'Family movie night', null);
    expect(key1).not.toBe(key0);

    // 14. The effective request contains EVERY active refinement.
    expect(refined.maxRuntime).toBe(120);
    expect(refined.minAudience).toBe(70);
    expect(refined.minImdb).toBe(6.5);
    expect(refined.minMatch).toBe(60);

    // 18. Active filters are enumerable for the chips row.
    const chips = activeFilterChips(refined);
    expect(chips).toEqual(expect.arrayContaining(['≤ 120 min', 'Audience 70%+', 'IMDb 6.5+', 'Match 60+']));
    expect(chips).not.toContain('English audio');

    // Un-refining back to neutral restores the ORIGINAL key exactly (round-trip).
    const undone = effectiveConstraints({
      queryConstraints: original,
      savedPreferences: {},
      temporaryRefinements: { maxRuntime: null, minAudience: null, minImdb: null, minMatch: null },
    });
    expect(canonicalQueryKey(undone, 'Family movie night', null)).toBe(key0);
  });
});

describe('constraint layers — saved < query < temporary precedence', () => {
  it('saved preferences fill only NEUTRAL fields; the ask always wins', () => {
    const ask = base({ mediaType: 'movie', maxRuntime: 100 });
    const eff = effectiveConstraints({
      queryConstraints: ask,
      savedPreferences: { maxRuntime: 180, onMyServices: true },
      temporaryRefinements: {},
    });
    expect(eff.maxRuntime).toBe(100); // ask beats saved
    expect(eff.onMyServices).toBe(true); // saved fills the neutral field
  });

  it('a temporary refinement beats both the ask and saved preferences', () => {
    const eff = effectiveConstraints({
      queryConstraints: base({ maxRuntime: 100 }),
      savedPreferences: { maxRuntime: 180 },
      temporaryRefinements: { maxRuntime: 90 },
    });
    expect(eff.maxRuntime).toBe(90);
  });

  it('saved preferences never resurrect a constraint the user explicitly cleared', () => {
    // User dragged runtime back to "Any" (null) — saved 180 must NOT re-apply
    // through the temporary layer.
    const eff = effectiveConstraints({
      queryConstraints: base({ maxRuntime: 100 }),
      savedPreferences: {},
      temporaryRefinements: { maxRuntime: null },
    });
    expect(eff.maxRuntime).toBeNull();
  });
});

describe('canonical query key — determinism and neutrality', () => {
  it('is insensitive to array order and duplicates', () => {
    const a = base({ genreIds: [35, 18, 35], providerIds: [9, 8] });
    const b = base({ genreIds: [18, 35], providerIds: [8, 9] });
    expect(canonicalQueryKey(a, 'x', null)).toBe(canonicalQueryKey(b, 'x', null));
  });

  it('treats every neutral spelling identically: null, 0, absent, empty array', () => {
    const a = base({ minAudience: 0, minImdb: null, providerIds: [], castIds: undefined });
    const b = base({ minAudience: null, minImdb: 0, providerIds: undefined, castIds: [] });
    expect(canonicalQueryKey(a, 'x', null)).toBe(canonicalQueryKey(b, 'x', null));
    // "Any" never secretly sends a numeric threshold.
    expect(normalizeQuery(a).minAudience).toBeNull();
  });

  it('changes when ANY effective constraint changes (each field is load-bearing)', () => {
    const neutral = base();
    const k0 = canonicalQueryKey(neutral, 'x', null);
    const mutations: Partial<FinderQuery>[] = [
      { mediaType: 'movie' },
      { genreIds: [18] },
      { maxRuntime: 120 },
      { sinceMonths: 24 },
      { minAudience: 70 },
      { minImdb: 7 },
      { minMatch: 60 },
      { englishAudioOnly: true },
      { onMyServices: true },
      { providerIds: [8] },
      { streamItOnly: true },
      { bingeableOnly: true },
      { upcoming: true },
      { liveOnly: true },
      { pace: 80 },
      { minYear: 1990 },
      { maxYear: 1999 },
      { excludeGenreIds: [27] },
      { originCountries: ['ES'] },
      { originalLanguages: ['es'] },
      { keywordIds: [9715] },
      { similarTo: 'Rocky' },
    ];
    const keys = mutations.map((m) => canonicalQueryKey(base(m), 'x', null));
    for (const [i, k] of keys.entries()) {
      expect(k, `mutation ${JSON.stringify(mutations[i])} must change the key`).not.toBe(k0);
    }
    // And all mutations are pairwise distinct from each other.
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('includes the ask text and the watcher — different person, different key', () => {
    const q = base();
    expect(canonicalQueryKey(q, 'family movie night', null)).not.toBe(canonicalQueryKey(q, 'date night', null));
    expect(canonicalQueryKey(q, 'x', 'Amy')).not.toBe(canonicalQueryKey(q, 'x', null));
    // …but insignificant text differences (case/whitespace) do NOT change it.
    expect(canonicalQueryKey(q, '  Family Movie Night ', null)).toBe(canonicalQueryKey(q, 'family movie night', null));
  });

  it('property: key is deterministic across repeated computation (seeded sweep)', () => {
    // Deterministic pseudo-random sweep over the constraint space.
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 500; i++) {
      const q = base({
        mediaType: (['any', 'movie', 'tv'] as const)[Math.floor(rnd() * 3)],
        genreIds: rnd() > 0.5 ? [18, 35].slice(0, 1 + Math.floor(rnd() * 2)) : [],
        maxRuntime: rnd() > 0.5 ? 60 + Math.floor(rnd() * 18) * 10 : null,
        minAudience: rnd() > 0.5 ? Math.floor(rnd() * 19) * 5 : null,
        minImdb: rnd() > 0.5 ? Math.floor(rnd() * 18) / 2 : null,
        englishAudioOnly: rnd() > 0.8,
        upcoming: rnd() > 0.9,
        providerIds: rnd() > 0.7 ? [8, 9, 337].slice(0, 1 + Math.floor(rnd() * 3)) : undefined,
      });
      expect(canonicalQueryKey(q, 'sweep', null)).toBe(canonicalQueryKey({ ...q }, 'sweep', null));
    }
  });
});

describe('active filter chips', () => {
  it('a fully neutral query has NO chips (nothing is secretly filtering)', () => {
    expect(activeFilterChips(base())).toEqual([]);
  });

  it('every active constraint surfaces as a chip', () => {
    const chips = activeFilterChips(
      base({ mediaType: 'movie', maxRuntime: 90, englishAudioOnly: true, providerIds: [8], genreIds: [35] })
    );
    expect(chips).toEqual(expect.arrayContaining(['Movies', '≤ 90 min', 'English audio', '1 service', '1 genre']));
  });
});
