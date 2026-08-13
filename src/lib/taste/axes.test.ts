import { describe, it, expect } from 'vitest';
import { DIMENSIONS, DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { TRAIT_KEYS, type TraitKey } from '@/lib/voice/quickdna/traits';
import {
  RICH_AXIS_KEYS,
  TASTE_AXES,
  TASTE_AXIS_KEYS,
  TRAIT_ROUTES,
  axisForTrait,
} from './axes';
import { MIN_COVERAGE, auditAxes, relate, underCovered, type AxisVector } from './audit';

/**
 * THE SCHEMA IS A CLAIM, SO IT IS TESTED LIKE ONE.
 *
 * "Twenty-eight axes, each one distinguishable" is the sort of statement that
 * sounds rigorous and is usually just a list somebody liked. These run the
 * separability audit over the live catalogue and fail if any retained axis turns
 * out to duplicate another — which is the only thing that makes the count
 * defensible rather than decorative.
 *
 * They also pin the two properties that make this an EXTENSION rather than a
 * replacement: the fifteen legacy keys survive verbatim, so evidence already
 * accumulated under them keeps accumulating, and every one of the forty-four
 * Showdown traits is routed somewhere rather than quietly dropped.
 */

/** The catalogue in canonical-axis space — the same projection production uses. */
const corpus: AxisVector[] = TITLES.map((t) => {
  const values: Record<string, number> = {};
  for (const e of t.traits) {
    const mapped = axisForTrait(e.key);
    if (!mapped) continue;
    const signed = (e.invert ? -e.strength : e.strength) * (mapped.invert ? -1 : 1);
    values[mapped.axis] = (values[mapped.axis] ?? 0) + signed;
  }
  return { id: t.id, values };
});

/** Axes the diagnostic catalogue actually says something about. */
const backed = TASTE_AXIS_KEYS.filter((k) => corpus.some((t) => Math.abs(t.values[k] ?? 0) > 0));

describe('the canonical vocabulary is an extension, not a replacement', () => {
  it('keeps all fifteen scoring dimensions verbatim', () => {
    for (const k of DIMENSION_KEYS) {
      expect(TASTE_AXIS_KEYS, `legacy axis "${k}" was dropped — every belief stored under it would be orphaned`).toContain(k);
    }
  });

  it('adds rich axes without renaming or re-polarising a legacy one', () => {
    // A rename is silent data loss: the old key keeps its evidence and nothing
    // reads it again. A polarity flip is worse — the evidence is read and means
    // the opposite of what it says.
    for (const k of DIMENSION_KEYS) {
      const axis = TASTE_AXES.find((a) => a.key === k)!;
      expect(axis.legacy).toBe(true);
    }
    expect(RICH_AXIS_KEYS.filter((k) => DIMENSION_KEYS.includes(k))).toEqual([]);
  });

  it('and without changing one word of the copy a legacy axis is explained with', () => {
    /* `explain.ts` now builds `DIM_BY_KEY` from TASTE_AXES rather than from
       DIMENSIONS, so this registry is the source of every "✓ Dark & heavy —
       matches your taste" line the product prints. If a legacy label or pole
       drifted here, user-facing copy would change silently on a surface nobody
       edited, which is exactly the kind of change that never gets reviewed.
       Pinned per-field rather than by object equality so the failure names the
       word that moved. */
    for (const d of DIMENSIONS) {
      const axis = TASTE_AXES.find((a) => a.key === d.key)!;
      expect(axis.label, `label for "${d.key}"`).toBe(d.label);
      expect(axis.low, `low pole for "${d.key}"`).toBe(d.low);
      expect(axis.high, `high pole for "${d.key}"`).toBe(d.high);
    }
  });

  it('routes every one of the 44 Showdown traits somewhere', () => {
    const unrouted = TRAIT_KEYS.filter((k) => !TRAIT_ROUTES[k]);
    expect(unrouted, 'a trait with no route is silently discarded at the boundary').toEqual([]);
  });

  it('and every routed axis and genre actually exists', () => {
    for (const key of TRAIT_KEYS) {
      const route = TRAIT_ROUTES[key];
      if (route.kind === 'axis' || route.kind === 'merged') {
        expect(TASTE_AXIS_KEYS, `trait "${key}" routes to unknown axis "${route.axis}"`).toContain(route.axis);
      }
      if (route.kind === 'genre') expect(route.slug.length).toBeGreaterThan(0);
    }
  });
});

describe('every retained axis is measurably distinguishable from every other', () => {
  it('no retained axis duplicates another', () => {
    const audited = auditAxes(corpus, backed);
    const duplicated = audited.filter((a) => !a.independent);
    expect(
      duplicated.map((a) => `${a.key} ~ ${a.redundantWith.join('/')}`),
      'an axis duplicates another, so its evidence is being split across two keys',
    ).toEqual([]);
  });

  it('the axes the brief named specifically are independent of what they get confused with', () => {
    /* THE POINT OF THE WHOLE EXERCISE. Each of these is the distinction the
       recommender was previously incapable of acting on, paired with the axis it
       would have been collapsed into by a lossy mapping. */
    const mustSeparate: Array<[string, string]> = [
      ['weirdness', 'complexity'], // "must not merely become generic complexity"
      ['ambiguity', 'complexity'],
      ['ambiguity', 'weirdness'],
      ['horrorTolerance', 'darkness'], // "must not be approximated as darkness + violence"
      ['horrorTolerance', 'violence'],
      ['character', 'dialogue'], // characterFocus must act AS characterFocus
      ['cynicism', 'warmth'],
      ['sentimentality', 'warmth'],
      ['cynicism', 'sentimentality'], // must remain distinguishable from each other
    ];
    for (const [a, b] of mustSeparate) {
      const { separating, relation } = relate(corpus, a, b);
      expect(relation, `${a} vs ${b}: ${relation} (${separating} separating pairs)`).toBe('independent');
    }
  });

  it('the one merge is the one the catalogue proves', () => {
    // `international` was folded into `subtitles`. That claim has to survive the
    // same test everything else was held to, or it is just a preference.
    const { relation, correlation, separating } = relate(
      TITLES.map((t) => {
        const values: Record<string, number> = {};
        for (const e of t.traits) values[e.key] = (values[e.key] ?? 0) + (e.invert ? -e.strength : e.strength);
        return { id: t.id, values };
      }),
      'international',
      'subtitles',
    );
    expect(relation, `international/subtitles came back ${relation}`).toBe('redundant');
    expect(separating).toBe(0);
    expect(correlation).toBeGreaterThan(0.75);
  });
});

describe('coverage holes are reported, not hidden', () => {
  it('names the axes the diagnostic pool cannot yet support', () => {
    /* NOT A FAILURE — A WORK ITEM. An axis with five titles behind it is a hole
       in the instrument, and the fix is more annotated titles, not a smaller
       vocabulary. Asserting the exact list means the number cannot quietly get
       worse: adding an axis without titles to support it breaks this. */
    const holes = underCovered(corpus, backed).map((h) => h.key);
    expect(holes, `axes under ${MIN_COVERAGE} titles: ${JSON.stringify(underCovered(corpus, backed))}`).toEqual([
      'sentimentality',
    ]);
  });

  it('reports which legacy axes the diagnostic pool says nothing about', () => {
    // `attention` and `morality` are real axes fed by the title classifier and
    // other surfaces; Showdown's catalogue simply does not annotate them. Naming
    // them is what stops "Showdown covers everything" being believed.
    const unbacked = TASTE_AXIS_KEYS.filter((k) => !backed.includes(k));
    expect(unbacked.sort()).toEqual(['attention', 'morality']);
  });
});

describe('trait routing preserves meaning', () => {
  it('inverted routes are inverted for a stated reason, not by accident', () => {
    // Two traits are the LOW pole of a legacy axis. Getting either backwards
    // would silently teach the opposite of what the player said.
    expect(axisForTrait('patience' as TraitKey)).toEqual({ axis: 'pacing', invert: true });
    expect(axisForTrait('episodic' as TraitKey)).toEqual({ axis: 'serialized', invert: true });
  });

  it('no trait routes to an axis while another routes to its inverse', () => {
    // Two traits landing on one axis with opposite polarity would cancel out —
    // the belief would sit at neutral no matter how consistently someone played.
    const seen = new Map<string, boolean>();
    for (const key of TRAIT_KEYS) {
      const m = axisForTrait(key);
      if (!m) continue;
      const prior = seen.get(m.axis);
      if (prior === undefined) seen.set(m.axis, m.invert);
      else expect(prior, `traits disagree on the polarity of "${m.axis}"`).toBe(m.invert);
    }
  });
});
