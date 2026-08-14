import { describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * NO SILENT FIELDS — every executable canonical field has an owner.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Meaning with nowhere to go is how interpretation becomes lossy. Tones sat
 * parsed-but-ignored in `CanonicalIntent` for days before anyone noticed,
 * because nothing failed when a field was dropped. This suite makes that
 * structurally impossible: every key of the executable intent surface must be
 * in exactly one of two ledgers —
 *
 *   EXECUTED    — proven here (or in the named suite) to move the execution
 *   DOCUMENTED  — explicitly non-executable, with the reason stated and the
 *                 claim behind the reason tested where practical
 *
 * A new CanonicalIntent field fails this suite until it is placed. Removing a
 * mapping fails the behavioral proof. There is no third state.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/tmdb/client', () => ({ searchPeople: vi.fn(async () => []), searchKeywords: vi.fn(async () => []) }));

import { intentToQuery } from './canonicalExecution';
import { EMPTY_INTENT, executable, type CanonicalIntent } from '@/lib/interpret/types';

const base = (over: Partial<CanonicalIntent>): CanonicalIntent => ({
  ...EMPTY_INTENT,
  kind: 'recommendation',
  subjects: [],
  genres: [],
  tones: [],
  people: [],
  titles: [],
  providers: [],
  date: {},
  runtime: {},
  origin: { countries: [], languages: [], englishDubOnly: false, englishAudioOnly: false },
  background: [],
  ...over,
});

/** Field → how it reaches execution. The proofs below must cover this list. */
const EXECUTED: Record<string, string> = {
  kind: 'selects the execution arm — recommendation → canonical pipeline, lookup → title path, statement → legacy (servingModeParity + titleOwnership suites)',
  media: 'intentToQuery → query.mediaType; contradiction (none) → route clarify (mediaPolarity + canonicalSideDoors suites)',
  requestedCount: 'intentToQuery → query.finalCount + the route limit',
  subjects: 'pending.requiredSubjects/excludedSubjects → searchBySubject / resolveKeywordIds',
  genres: 'intentToQuery → genreIds/excludeGenreIds via the shared alias map, unmapped spans → subject channel',
  tones: 'intentToQuery → genre alias / pace / exclusion channel / disclosed when undeliverable',
  people: 'pending.requiredPeople/excludedPeople → resolvePersonReference → cast + credit-verified exclusion',
  providers: 'pending.providers → resolveProvider → providerIds',
  date: 'intentToQuery → minYear/maxYear',
  runtime: 'intentToQuery → maxRuntime',
  origin: 'intentToQuery → originCountries/originalLanguages/englishDubOnly/englishAudioOnly',
};

const DOCUMENTED: Record<string, string> = {
  titles:
    'relation "requested" IS executed — it flips kind to lookup and the title path answers (titleOwnership suite). '
    + 'Taste relations (seen/liked/disliked) are references, not constraints on THIS query: the finder already '
    + 'excludes watched titles for the signed-in user, and similarity is the pre-canonical similar-to path’s job.',
  excludeSeen:
    'satisfied by default: runFinder removes watched/dropped titles for the signed-in user unconditionally '
    + '(src/lib/finder.ts seen-set), so the flag adds no constraint execution does not already apply.',
};

describe('the executable surface is fully accounted for', () => {
  it('every executable field is in exactly one ledger', () => {
    const fields = Object.keys(executable(base({})));
    const placed = new Set([...Object.keys(EXECUTED), ...Object.keys(DOCUMENTED)]);
    for (const f of fields) {
      expect(placed.has(f), `CanonicalIntent.${f} is in NEITHER ledger — parsed meaning with nowhere to go`).toBe(true);
    }
    for (const f of placed) {
      expect(fields.includes(f), `ledger names ${f}, which is not an executable field`).toBe(true);
    }
    const both = Object.keys(EXECUTED).filter((f) => f in DOCUMENTED);
    expect(both, 'a field cannot be both executed and documented-away').toEqual([]);
  });
});

describe('behavioral proof for each EXECUTED field', () => {
  it('media moves mediaType', () => {
    expect(intentToQuery(base({ media: 'tv' })).query.mediaType).toBe('tv');
    expect(intentToQuery(base({ media: 'movie' })).query.mediaType).toBe('movie');
  });

  it('requestedCount moves finalCount and the returned count', () => {
    const m = intentToQuery(base({ requestedCount: 3 }));
    expect(m.query.finalCount).toBe(3);
    expect(m.requestedCount).toBe(3);
  });

  it('subjects reach the pending world resolution, by polarity', () => {
    const m = intentToQuery(base({ subjects: [{ span: 'boxing', wanted: true }, { span: 'gore', wanted: false }] }));
    expect(m.pending.requiredSubjects).toContain('boxing');
    expect(m.pending.excludedSubjects).toContain('gore');
  });

  it('genres execute through the alias map, and unmapped spans fall to the subject channel', () => {
    const m = intentToQuery(base({
      genres: [
        { span: 'thriller', wanted: true, holder: 'user' },
        { span: 'supernatural', wanted: false, holder: 'user' },
        { span: 'biography', wanted: false, holder: 'user' },
      ],
    }));
    expect(m.query.genreIds).toContain(53);
    expect(m.query.excludeGenreIds ?? []).toContain(14);
    expect(m.pending.excludedSubjects, 'an unmapped genre veto must not vanish').toContain('biography');
  });

  it('tones execute as genre, pace, exclusion, or disclosure — never silence', () => {
    const funny = intentToQuery(base({ tones: [{ term: 'funny', wanted: true, holder: 'user' }] }));
    expect(funny.query.genreIds).toContain(35);
    const fast = intentToQuery(base({ tones: [{ term: 'fast-paced', wanted: true, holder: 'user' }] }));
    expect(fast.query.pace).toBe(90);
    const dark = intentToQuery(base({ tones: [{ term: 'dark', wanted: true, holder: 'user' }] }));
    expect(dark.undeliverableTones).toContain('dark');
    const notGory = intentToQuery(base({ tones: [{ term: 'gory', wanted: false, holder: 'user' }] }));
    expect(notGory.pending.excludedSubjects).toContain('gory');
  });

  it('people reach the pending person resolution, by relation, with role', () => {
    const m = intentToQuery(base({
      people: [
        { span: 'Sylvester Stallone', relation: 'required', role: 'any' },
        { span: 'Adam Sandler', relation: 'excluded', role: 'any' },
      ],
    }));
    expect(m.pending.requiredPeople).toEqual([{ spokenAs: 'Sylvester Stallone', role: 'any' }]);
    expect(m.pending.excludedPeople).toEqual(['Adam Sandler']);
  });

  it('providers reach the pending provider resolution', () => {
    expect(intentToQuery(base({ providers: ['netflix'] })).pending.providers).toEqual(['netflix']);
  });

  it('date moves the year bounds', () => {
    const m = intentToQuery(base({ date: { minYear: 1990, maxYear: 1999 } }));
    expect(m.query.minYear).toBe(1990);
    expect(m.query.maxYear).toBe(1999);
  });

  it('runtime moves the ceiling', () => {
    expect(intentToQuery(base({ runtime: { maxMinutes: 110 } })).query.maxRuntime).toBe(110);
  });

  it('origin moves countries, languages and the audio strictness', () => {
    const m = intentToQuery(base({
      origin: { countries: ['KR'], languages: ['ko'], englishDubOnly: true, englishAudioOnly: false },
    }));
    expect(m.query.originCountries).toEqual(['KR']);
    expect(m.query.originalLanguages).toEqual(['ko']);
    expect(m.query.englishDubOnly).toBe(true);
    const audio = intentToQuery(base({
      origin: { countries: [], languages: [], englishDubOnly: false, englishAudioOnly: true },
    }));
    expect(audio.query.englishAudioOnly).toBe(true);
  });
});
