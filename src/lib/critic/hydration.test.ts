import { describe, it, expect } from 'vitest';
import { rankWithPreference } from '@/lib/preference/rank';
import { deriveDna } from '@/lib/preference/engine';
import type { PreferenceEvent } from '@/lib/preference/types';
import { DIMENSION_KEYS, isValidDimensions, type TitleDimensions } from '@/lib/scoring/dimensions';
import { resolveAnchor, anchorsToObjective, type AnchorCandidate } from './anchor';
import { hydrateAnchors, dimensionCacheKey } from './hydrate';
import { objectiveAuthority } from './objective';

/**
 * GC3 — A RESOLVED IDENTITY IS NOT YET A UNDERSTANDING.
 *
 * GC2 proved we know WHICH title the user meant. It deliberately stopped there:
 * `resolveAnchor` leaves `dims` undefined, so `objectiveAuthority` returns 0 and
 * the critic stays inert. That is honest — no fingerprint, no claim — and it
 * also means the whole chain is still incapable of moving a real request.
 *
 * This closes the gap using the fingerprint the production ranker already
 * trusts: `title_dimensions`, read through the same cache-only path
 * (`getCachedDimensions`) and validated by the same `isValidDimensions` gate.
 * No critic-only fingerprint, no second classifier, no new confidence system.
 *
 * ── ONE TEST, TWO STATES, NOT REWRITTEN BETWEEN THEM ──────────────────────
 * The BEFORE and AFTER assertions live side by side in `the same anchor, two
 * states` below. BEFORE is the unhydrated anchor GC2 produces; AFTER is that
 * exact anchor hydrated. Everything else — DNA, candidates, base scores,
 * resolved identity, ranker — is shared by construction rather than by
 * discipline, because two nearly-identical fixtures is how a "held constant"
 * claim quietly stops being true.
 */

// ── shared, immutable across every case ───────────────────────────────────
const NOW = Date.UTC(2026, 0, 20);
const CANDIDATES = [
  { id: 'tense-thriller', objective: 70, dims: fill({ darkness: 85, pace: 80, humor: 10 }), genres: ['thriller'] },
  { id: 'warm-comedy', objective: 70, dims: fill({ darkness: 15, pace: 45, humor: 90 }), genres: ['comedy'] },
];
const events: PreferenceEvent[] = Array.from({ length: 12 }, (_, i) => ({
  id: `e${i}`,
  at: NOW - (i + 1) * 86_400_000,
  titleId: `movie:${1000 + i}`,
  action: 'seen_liked' as const,
  dims: fill({ darkness: 60, pace: 60, humor: 50 }),
  genres: ['drama'],
}));
const DNA = deriveDna(events, NOW);
const BASELINE = rankWithPreference(CANDIDATES, DNA, { corrections: {} });

/** A complete, VALID fingerprint — every canonical axis present, as the real
 *  cache stores them. Partial blobs are rejected by `isValidDimensions`, which
 *  is the existing semantics this reuses rather than replaces. */
function fill(overrides: Record<string, number>): TitleDimensions {
  const out: Record<string, number> = {};
  for (const k of DIMENSION_KEYS) out[k] = overrides[k] ?? 50;
  return out as TitleDimensions;
}

const c = (id: number, title: string, mediaType: 'movie' | 'tv' = 'movie', year: number | null = null): AnchorCandidate =>
  ({ id, title, mediaType, year });

/** The one anchor every case below uses, resolved by the GC2 path. */
function widowsBay() {
  const r = resolveAnchor({ spokenAs: 'Widows Bay', mediaType: 'movie' }, [
    c(555, 'Widows Bay', 'movie', 2020),
  ]);
  if (r.status !== 'resolved') throw new Error('fixture: GC2 resolution regressed');
  return r;
}

/** A stand-in for `getCachedDimensions`, keyed exactly as the real cache is. */
const cacheOf = (entries: Record<string, TitleDimensions>) => async (
  keys: { tmdb_id: number; media_type: 'movie' | 'tv' }[],
) => {
  const out = new Map<string, TitleDimensions>();
  for (const k of keys) {
    const hit = entries[dimensionCacheKey(k.media_type, k.tmdb_id)];
    if (hit) out.set(dimensionCacheKey(k.media_type, k.tmdb_id), hit);
  }
  return out;
};

const BLEAK = fill({ darkness: 92, pace: 86, humor: 6 });
const CACHE = cacheOf({ 'movie-555': BLEAK });

describe('GC3 — the same anchor, two states', () => {
  it('BEFORE — resolved but unhydrated: authority 0, ranking identical to baseline', () => {
    const objective = anchorsToObjective('better_than', [widowsBay()]);
    expect(objective.anchors).toHaveLength(1);
    expect(objective.anchors[0]!.dims).toBeUndefined();
    expect(objective.authority).toBe(0);
    expect(
      rankWithPreference(CANDIDATES, DNA, { corrections: {}, critic: objective }).map((r) => r.finalScore),
    ).toEqual(BASELINE.map((r) => r.finalScore));
  });

  it('AFTER — the SAME anchor hydrated: authority > 0, and the ORDER changes', async () => {
    const hydrated = await hydrateAnchors([widowsBay()], CACHE);
    const objective = anchorsToObjective('better_than', hydrated);

    expect(objective.anchors[0]!.dims).toBeDefined();
    expect(objective.authority).toBeGreaterThan(0);

    const ranked = rankWithPreference(CANDIDATES, DNA, { corrections: {}, critic: objective });
    expect(ranked.some((r) => (r.criticNudge ?? 0) !== 0)).toBe(true);
    expect(ranked.map((r) => r.id)).not.toEqual(BASELINE.map((r) => r.id));
  });
});

describe('the canonical identity is the cache key', () => {
  it('keys on media type + tmdb id, matching the production cache', () => {
    expect(dimensionCacheKey('movie', 555)).toBe('movie-555');
    expect(dimensionCacheKey('tv', 555)).toBe('tv-555');
  });

  it('a movie CANNOT receive a TV fingerprint of the same id', async () => {
    /* The cross-load that makes an anchor confidently wrong. `title_dimensions`
       is queried by tmdb_id alone, so only the composite key stops a movie
       picking up its same-numbered series row. */
    const tvOnly = cacheOf({ 'tv-555': BLEAK });
    const hydrated = await hydrateAnchors([widowsBay()], tvOnly);
    expect(hydrated[0]!.status === 'resolved' && hydrated[0]!.anchor.dims).toBeUndefined();
    expect(anchorsToObjective('better_than', hydrated).authority).toBe(0);
  });

  it('same-name remakes cannot cross-load, because the id differs', async () => {
    const dune84 = resolveAnchor({ spokenAs: 'Dune', mediaType: 'movie', year: 1984 }, [
      c(438631, 'Dune', 'movie', 2021),
      c(841, 'Dune', 'movie', 1984),
    ]);
    // Only the 2021 film is fingerprinted.
    const only2021 = cacheOf({ 'movie-438631': BLEAK });
    const hydrated = await hydrateAnchors([dune84], only2021);
    expect(hydrated[0]!.status === 'resolved' && hydrated[0]!.anchor.dims).toBeUndefined();
  });

  it('no title string is used as identity after resolution', async () => {
    /* Hydration must ask for ids, never names — otherwise GC2's whole point is
       undone one layer later. */
    let askedFor: unknown;
    await hydrateAnchors([widowsBay()], async (keys) => {
      askedFor = keys;
      return new Map();
    });
    expect(askedFor).toEqual([{ tmdb_id: 555, media_type: 'movie' }]);
    expect(JSON.stringify(askedFor)).not.toContain('Widows');
  });
});

describe('a missing or malformed fingerprint makes no claim', () => {
  it('a cache MISS leaves the anchor unhydrated and authority 0', async () => {
    const hydrated = await hydrateAnchors([widowsBay()], cacheOf({}));
    expect(anchorsToObjective('better_than', hydrated).authority).toBe(0);
    expect(
      rankWithPreference(CANDIDATES, DNA, {
        corrections: {},
        critic: anchorsToObjective('better_than', hydrated),
      }).map((r) => r.finalScore),
    ).toEqual(BASELINE.map((r) => r.finalScore));
  });

  it('MALFORMED dims are rejected by the existing canonical gate', async () => {
    /* Reuses `isValidDimensions` rather than inventing a critic-only notion of
       quality. A partial blob is not a weaker fingerprint, it is not one. */
    const partial = { darkness: 90 } as unknown as TitleDimensions;
    expect(isValidDimensions(partial)).toBe(false);
    const hydrated = await hydrateAnchors([widowsBay()], cacheOf({ 'movie-555': partial }));
    expect(hydrated[0]!.status === 'resolved' && hydrated[0]!.anchor.dims).toBeUndefined();
    expect(anchorsToObjective('better_than', hydrated).authority).toBe(0);
  });

  it('an empty object is not a fingerprint', async () => {
    const hydrated = await hydrateAnchors([widowsBay()], cacheOf({ 'movie-555': {} as TitleDimensions }));
    expect(anchorsToObjective('better_than', hydrated).authority).toBe(0);
  });

  it('a cache that throws degrades to existing behaviour, never to a guess', async () => {
    const hydrated = await hydrateAnchors([widowsBay()], async () => {
      throw new Error('table missing');
    });
    expect(anchorsToObjective('better_than', hydrated).authority).toBe(0);
  });
});

describe('partial understanding stays partial', () => {
  it('one hydrated + one ambiguous is NOT full authority', async () => {
    /* The renormalisation trap: dropping what failed and computing authority
       over only the survivors would report a half-understood request as fully
       understood. */
    const ambiguous = resolveAnchor({ spokenAs: 'Dune' }, [
      c(438631, 'Dune', 'movie', 2021),
      c(841, 'Dune', 'movie', 1984),
    ]);
    const hydrated = await hydrateAnchors([widowsBay(), ambiguous], CACHE);
    const objective = anchorsToObjective('better_than', hydrated, { requested: 2 });
    expect(objective.anchors).toHaveLength(1);
    expect(objective.authority).toBeGreaterThan(0);
    expect(objective.authority).toBeLessThan(1);
  });

  it('one hydrated + one resolved-but-unfingerprinted is also partial', async () => {
    const other = resolveAnchor({ spokenAs: 'Some Other Film' }, [
      c(777, 'Some Other Film', 'movie', 2019),
    ]);
    const hydrated = await hydrateAnchors([widowsBay(), other], CACHE); // only 555 is cached
    const objective = anchorsToObjective('better_than', hydrated, { requested: 2 });
    expect(objective.authority).toBeGreaterThan(0);
    expect(objective.authority).toBeLessThan(1);
  });

  it('both hydrated earns full authority', async () => {
    const other = resolveAnchor({ spokenAs: 'Some Other Film' }, [
      c(777, 'Some Other Film', 'movie', 2019),
    ]);
    const both = cacheOf({ 'movie-555': BLEAK, 'movie-777': BLEAK });
    const objective = anchorsToObjective('better_than', await hydrateAnchors([widowsBay(), other], both), {
      requested: 2,
    });
    expect(objective.authority).toBe(1);
  });
});

describe('nothing else changed', () => {
  it('no critic objective is byte-identical to previous behaviour', () => {
    expect(rankWithPreference(CANDIDATES, DNA, { corrections: {} }).map((r) => r.finalScore)).toEqual(
      BASELINE.map((r) => r.finalScore),
    );
  });

  it('hydration performs no classification — it only reads', async () => {
    /* Cache-only is the architectural requirement: no AI or remote classifier
       in the recommendation request path. A miss stays a miss. */
    let calls = 0;
    await hydrateAnchors([widowsBay()], async () => {
      calls += 1;
      return new Map();
    });
    expect(calls).toBe(1);
    expect(objectiveAuthority([])).toBe(0);
  });
});
