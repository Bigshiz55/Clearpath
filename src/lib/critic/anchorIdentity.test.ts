import { describe, it, expect } from 'vitest';
import { rankWithPreference } from '@/lib/preference/rank';
import { deriveDna } from '@/lib/preference/engine';
import type { PreferenceEvent } from '@/lib/preference/types';
import { objectiveAuthority, type ResolvedAnchor } from './objective';
import { resolveAnchor, anchorsToObjective, type AnchorCandidate } from './anchor';

/**
 * GC2 — A WRONGLY RESOLVED ANCHOR IS WORSE THAN A MISSING ONE.
 *
 * GC8 proved the critic signal moves ranking. That makes identity a safety
 * problem rather than a nicety: the term now pushes candidates AWAY from
 * whatever it believes the anchors are, confidently, so resolving "Dune" to the
 * wrong Dune does not degrade the answer — it inverts it against the wrong work.
 *
 * The forbidden implementation is the one production still uses at
 * `ask/route.ts:48`:
 *
 *     const hit = (await searchTitles(name).catch(() => []))[0];
 *
 * Search-result order is popularity, and popularity is not identity. These
 * tests are written against the matcher DIRECTLY with deterministic fixtures —
 * no network, no mocked ranker — so the identity rules are proved rather than
 * inferred from an end-to-end result that could pass for other reasons.
 */

const c = (
  id: number,
  title: string,
  mediaType: 'movie' | 'tv' = 'movie',
  year: number | null = null,
): AnchorCandidate => ({ id, title, mediaType, year });

/* THE POPULARITY TRAP, AS DATA. In every fixture below the WRONG title is
   first, because that is exactly what a popularity-ordered search returns and
   what `[0]` would take. */

/**
 * THE RED PROOF, KEPT PERMANENTLY.
 *
 * A missing module is a weak failure — it proves nothing about behaviour. This
 * models the production strategy at `ask/route.ts:48` against the SAME fixtures
 * and shows it is structurally incapable of satisfying the identity contract.
 * It stays in the suite so the unsafe strategy can never quietly return.
 */
const unsafeFirstResult = (candidates: readonly AnchorCandidate[]) => candidates[0] ?? null;

describe('RED — the popularity-first strategy cannot satisfy identity', () => {
  const dune = [c(438631, 'Dune', 'movie', 2021), c(841, 'Dune', 'movie', 1984)];

  it('picks the popular remake when asked for the 1984 film', () => {
    expect(unsafeFirstResult(dune)!.year).toBe(2021); // asked for 1984
    const safe = resolveAnchor({ spokenAs: 'Dune', mediaType: 'movie', year: 1984 }, dune);
    expect(safe.status === 'resolved' && safe.anchor.tmdbId).toBe(841);
  });

  it('answers confidently where the truth is ambiguous', () => {
    expect(unsafeFirstResult(dune)).not.toBeNull(); // always an answer
    expect(resolveAnchor({ spokenAs: 'Dune' }, dune).status).toBe('ambiguous');
  });

  it('ignores media type entirely', () => {
    const fargo = [c(275, 'Fargo', 'movie', 1996), c(60622, 'Fargo', 'tv', 2014)];
    expect(unsafeFirstResult(fargo)!.mediaType).toBe('movie'); // asked for tv
    const safe = resolveAnchor({ spokenAs: 'Fargo', mediaType: 'tv' }, fargo);
    expect(safe.status === 'resolved' && safe.anchor.tmdbId).toBe(60622);
  });

  it('accepts a near-miss as identity', () => {
    const near = [c(1, 'The Fast and the Furious', 'movie', 2001)];
    expect(unsafeFirstResult(near)!.title).toBe('The Fast and the Furious'); // asked for "Furious"
    expect(resolveAnchor({ spokenAs: 'Furious' }, near).status).toBe('not_found');
  });
});

describe('exact identity resolves', () => {
  it('title + media type + year resolves the intended canonical title', () => {
    const r = resolveAnchor({ spokenAs: 'Dune', mediaType: 'movie', year: 1984 }, [
      c(438631, 'Dune', 'movie', 2021), // more popular, and WRONG
      c(841, 'Dune', 'movie', 1984),
    ]);
    expect(r.status).toBe('resolved');
    if (r.status !== 'resolved') return;
    expect(r.anchor.tmdbId).toBe(841);
    expect(r.anchor.titleId).toBe('movie:841');
  });

  it('a unique exact match needs no year', () => {
    const r = resolveAnchor({ spokenAs: 'Widows Bay' }, [
      c(555, 'Widows Bay', 'movie', 2020),
      c(556, 'Widow Bay Chronicles', 'movie', 2019),
    ]);
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') expect(r.anchor.tmdbId).toBe(555);
  });

  it('normalization forgives punctuation and articles, not different words', () => {
    const ok = resolveAnchor({ spokenAs: 'the shawshank redemption' }, [
      c(278, 'The Shawshank Redemption', 'movie', 1994),
    ]);
    expect(ok.status).toBe('resolved');

    const no = resolveAnchor({ spokenAs: 'Widows Bay' }, [c(1, 'Widows Bay Returns', 'movie', 2021)]);
    expect(no.status).toBe('not_found');
  });
});

describe('AMBIGUITY IS NOT RESOLVED BY POPULARITY', () => {
  it('a same-name remake does NOT take the first/popular result', () => {
    /* THE HEADLINE. `searchTitles(name)[0]` returns 2021 Dune here. Without a
       year nothing distinguishes them, so the only honest answer is to refuse
       and let the caller ask. */
    const r = resolveAnchor({ spokenAs: 'Dune' }, [
      c(438631, 'Dune', 'movie', 2021),
      c(841, 'Dune', 'movie', 1984),
    ]);
    expect(r.status).toBe('ambiguous');
    if (r.status !== 'ambiguous') return;
    expect(r.options).toHaveLength(2);
    // Enough for an interactive surface to ask "which one?".
    expect(r.options.map((o) => o.year).sort()).toEqual([1984, 2021]);
  });

  it('the classic collision cases all refuse rather than guess', () => {
    for (const [name, years] of [
      ['It', [1990, 2017]],
      ['Crash', [1996, 2004]],
    ] as const) {
      const r = resolveAnchor({ spokenAs: name }, years.map((y, i) => c(i + 1, name, 'movie', y)));
      expect(r.status, `${name} was guessed`).toBe('ambiguous');
    }
  });

  it('a year disambiguates what a name alone cannot', () => {
    const r = resolveAnchor({ spokenAs: 'It', year: 2017 }, [
      c(1, 'It', 'movie', 1990),
      c(2, 'It', 'movie', 2017),
    ]);
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') expect(r.anchor.tmdbId).toBe(2);
  });
});

describe('media type is identity, not a filter to be relaxed', () => {
  it('a matching title of the WRONG media type does not resolve', () => {
    /* "The Office" the series and a same-named film are different works. */
    const r = resolveAnchor({ spokenAs: 'The Office', mediaType: 'movie' }, [
      c(2316, 'The Office', 'tv', 2005),
    ]);
    expect(r.status).toBe('not_found');
  });

  it('media type separates two otherwise identical names', () => {
    const r = resolveAnchor({ spokenAs: 'Fargo', mediaType: 'tv' }, [
      c(275, 'Fargo', 'movie', 1996), // more popular, and the wrong KIND
      c(60622, 'Fargo', 'tv', 2014),
    ]);
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') expect(r.anchor.tmdbId).toBe(60622);
  });
});

describe('a name we cannot place is reported, never invented', () => {
  it('no candidates at all is not_found', () => {
    expect(resolveAnchor({ spokenAs: 'Furious' }, []).status).toBe('not_found');
  });

  it('only near-misses is not_found — nothing is close enough to be identity', () => {
    const r = resolveAnchor({ spokenAs: 'Furious' }, [
      c(1, 'The Fast and the Furious', 'movie', 2001),
      c(2, 'Furious 7', 'movie', 2015),
    ]);
    expect(r.status).toBe('not_found');
    if (r.status === 'not_found') expect(r.spokenAs).toBe('Furious');
  });
});

// ── THE SAFETY PROPERTY: unresolved anchors cannot move ranking ────────────
const NOW = Date.UTC(2026, 0, 20);
const CANDIDATES = [
  { id: 'tense-thriller', objective: 70, dims: { darkness: 85, pace: 80, humor: 10 }, genres: ['thriller'] },
  { id: 'warm-comedy', objective: 70, dims: { darkness: 15, pace: 45, humor: 90 }, genres: ['comedy'] },
];
const events: PreferenceEvent[] = Array.from({ length: 12 }, (_, i) => ({
  id: `e${i}`,
  at: NOW - (i + 1) * 86_400_000,
  titleId: `movie:${1000 + i}`,
  action: 'seen_liked' as const,
  dims: { darkness: 60, pace: 60, humor: 50 },
  genres: ['drama'],
}));
const DNA = deriveDna(events, NOW);
const baseline = rankWithPreference(CANDIDATES, DNA, { corrections: {} }).map((r) => r.finalScore);

describe('only a RESOLVED anchor may influence ranking', () => {
  it('an ambiguous anchor contributes nothing', () => {
    const objective = anchorsToObjective('better_than', [
      resolveAnchor({ spokenAs: 'Dune' }, [
        c(438631, 'Dune', 'movie', 2021),
        c(841, 'Dune', 'movie', 1984),
      ]),
    ]);
    expect(objective.anchors).toHaveLength(0);
    expect(objective.authority).toBe(0);
    expect(
      rankWithPreference(CANDIDATES, DNA, { corrections: {}, critic: objective }).map((r) => r.finalScore),
    ).toEqual(baseline);
  });

  it('a not-found anchor contributes nothing', () => {
    const objective = anchorsToObjective('better_than', [resolveAnchor({ spokenAs: 'Furious' }, [])]);
    expect(objective.authority).toBe(0);
    expect(
      rankWithPreference(CANDIDATES, DNA, { corrections: {}, critic: objective }).map((r) => r.finalScore),
    ).toEqual(baseline);
  });

  it('one resolved and one ambiguous yields PARTIAL authority, not full', () => {
    /* The dishonest shortcut would be to drop the ambiguous anchor and proceed
       as though the objective were fully understood. Coverage is one of two. */
    const resolved = resolveAnchor({ spokenAs: 'Widows Bay' }, [c(555, 'Widows Bay', 'movie', 2020)]);
    const ambiguous = resolveAnchor({ spokenAs: 'Dune' }, [
      c(438631, 'Dune', 'movie', 2021),
      c(841, 'Dune', 'movie', 1984),
    ]);
    const withDims = { ...resolved } as typeof resolved;
    if (withDims.status === 'resolved') withDims.anchor.dims = { darkness: 90, pace: 85, humor: 5 };

    const objective = anchorsToObjective('better_than', [withDims, ambiguous], { requested: 2 });
    expect(objective.anchors).toHaveLength(1);
    expect(objective.authority).toBeGreaterThan(0);
    expect(objective.authority).toBeLessThan(1);
  });

  it('a resolved anchor with a fingerprint DOES move ranking', () => {
    /* The other direction, so these tests cannot pass by making everything
       inert. This is the GC8 property, reached through real resolution. */
    const r = resolveAnchor({ spokenAs: 'Widows Bay' }, [c(555, 'Widows Bay', 'movie', 2020)]);
    expect(r.status).toBe('resolved');
    if (r.status !== 'resolved') return;
    r.anchor.dims = { darkness: 90, pace: 85, humor: 5 };
    const objective = anchorsToObjective('better_than', [r]);
    expect(objective.authority).toBeGreaterThan(0);
    const scores = rankWithPreference(CANDIDATES, DNA, { corrections: {}, critic: objective }).map(
      (r2) => r2.finalScore,
    );
    expect(scores).not.toEqual(baseline);
  });
});

describe('the resolved anchor carries what the fingerprint stage needs', () => {
  it('canonical id, tmdb id and media type — never a display string as identity', () => {
    const r = resolveAnchor({ spokenAs: 'Fargo', mediaType: 'tv' }, [c(60622, 'Fargo', 'tv', 2014)]);
    expect(r.status).toBe('resolved');
    if (r.status !== 'resolved') return;
    const a: ResolvedAnchor = r.anchor;
    expect(a.titleId).toBe('tv:60622');
    expect(a.mediaType).toBe('tv');
    expect(a.tmdbId).toBe(60622);
    expect(a.spokenAs).toBe('Fargo');
    // No fingerprint yet — that is GC3 — so it earns no authority on its own.
    expect(objectiveAuthority([a])).toBe(0);
  });
});
