import { describe, it, expect } from 'vitest';
import { applyDeterministicFloor, overlayAi } from './deterministicFloor';
import { naiveParseQuery, EMPTY_QUERY } from '@/lib/finderParse';
import type { FinderQuery } from '@/lib/finder';

/**
 * RANDOMIZED CONSTRAINT-PRESERVATION PROPERTY TEST.
 *
 * The unit tests beside this file were written around cases a human thought of.
 * This one generates sentences nobody wrote a test for — thousands of novel
 * combinations across EVERY constraint type the parser supports — and checks a
 * property rather than an expected value:
 *
 *     Whatever the deterministic parser understood from the user's words must
 *     still be there after the merge, unchanged, under every AI behaviour.
 *
 * WHY IT ASSERTS NO EXPECTED VALUES. Ground truth is `naiveParseQuery(sentence)`
 * itself, whatever that happens to be. So the test cannot be fooled by my own
 * idea of what a phrase "should" parse to, it needs no updating when the parser
 * improves, and a constraint type added to `FinderQuery` tomorrow is covered as
 * soon as a fragment for it appears below. Nothing here special-cases runtime,
 * years, boxing, baseball or any other subject — the FRAGMENTS supply
 * vocabulary (a generator must), the ASSERTIONS never mention a field by name.
 *
 * FOUR FAILURE CLASSES, all release-blocking:
 *   DROPPED   — the sentence stated it, the merge lost it
 *   CHANGED   — the sentence stated a bound, the merge holds a different one
 *               (this is also how "weakened" shows up: 100 → 140 is a change)
 *   SHRUNK    — the sentence stated a set, the merge no longer contains it
 *   INVENTED  — the merge holds a constraint no one stated: not the sentence,
 *               not the AI, not the supplied UI state
 */

/** Deterministic RNG — a seeded LCG, so a failure is always reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000);
}

/**
 * Sentence fragments, at least one per constraint type the parser can set.
 * Deliberately varied phrasing, and deliberately NOT the phrasings used by the
 * existing tests or by the frozen corpus — the point is novel input.
 */
const FRAGMENTS: string[][] = [
  ['a horror movie', 'a comedy show', 'an animated film', 'a documentary series', 'a western'],
  ['under 95 minutes', 'less than 140 minutes', 'under two hours', 'shorter than 105 mins', 'max 130 minutes'],
  ['after 2011', 'before 1998', 'between 2004 and 2019', 'from the 1970s', 'newer than 2016'],
  ['imdb above 6.5', 'imdb over 8', 'audience over 65%', 'audience above 90%', 'match 75+'],
  ['nothing scary', 'no romance', 'not a musical', 'nothing animated', 'no horror'],
  ['all episodes out', 'bingeable', 'coming soon', 'on my services', 'in english'],
  ['from the last 18 months', 'released recently', 'out in the last 3 years', '', ''],
  ['', '', '', '', ''],
];

function sentence(rand: () => number): string {
  const parts: string[] = [];
  for (const group of FRAGMENTS) {
    if (rand() < 0.55) {
      const pick = group[Math.floor(rand() * group.length)]!;
      if (pick) parts.push(pick);
    }
  }
  // Order varies too — a parser that only works left-to-right is a real risk.
  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [parts[i], parts[j]] = [parts[j]!, parts[i]!];
  }
  return parts.join(' ').trim();
}

const NEUTRAL = EMPTY_QUERY as unknown as Record<string, unknown>;
const asRec = (q: FinderQuery) => q as unknown as Record<string, unknown>;

/**
 * The union of the neutral shape and the object's own keys.
 *
 * `EMPTY_QUERY` omits the OPTIONAL members of `FinderQuery` (`minYear`,
 * `maxYear`, `excludeGenreIds`, `providerIds`, …) because absent IS their
 * neutral state — so enumerating its keys alone makes those constraints
 * invisible to this test. That is not hypothetical: the first version of this
 * file did exactly that and reported only 10 constraint types, which is how the
 * matching hole in `deterministicFloor` was found. Enumerate the union.
 */
function stated(q: FinderQuery): string[] {
  const src = asRec(q);
  const keys = new Set<string>([...Object.keys(NEUTRAL), ...Object.keys(src)]);
  return [...keys].filter((k) => {
    const v = src[k];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return v !== NEUTRAL[k];
  });
}

/** Every way a merge can betray the user, checked generically. */
function violations(
  label: string,
  det: FinderQuery,
  ai: FinderQuery | null,
  supplied: FinderQuery,
  merged: FinderQuery,
): string[] {
  const out: string[] = [];
  const d = asRec(det), m = asRec(merged);
  const sources = [det, supplied, ...(ai ? [ai] : [])];

  for (const k of stated(det)) {
    const dv = d[k], mv = m[k];
    if (mv == null || (Array.isArray(mv) && mv.length === 0)) {
      out.push(`DROPPED ${k}: stated ${JSON.stringify(dv)}, merged ${JSON.stringify(mv)} [${label}]`);
      continue;
    }
    if (typeof dv === 'number' && mv !== dv) {
      out.push(`CHANGED ${k}: stated ${dv}, merged ${JSON.stringify(mv)} [${label}]`);
      continue;
    }
    if (Array.isArray(dv) && Array.isArray(mv)) {
      const missing = dv.filter((x) => !mv.includes(x));
      if (missing.length) out.push(`SHRUNK ${k}: lost ${JSON.stringify(missing)} [${label}]`);
      continue;
    }
    if (!Array.isArray(dv) && typeof dv !== 'number' && mv !== dv) {
      out.push(`CHANGED ${k}: stated ${JSON.stringify(dv)}, merged ${JSON.stringify(mv)} [${label}]`);
    }
  }

  // INVENTED — a constraint nobody asked for. Checked against ALL sources, so
  // a legitimate AI enrichment is not mistaken for an invention.
  for (const k of stated(merged)) {
    if (sources.some((s) => stated(s).includes(k))) continue;
    out.push(`INVENTED ${k}: ${JSON.stringify(m[k])} came from nowhere [${label}]`);
  }
  return out;
}

/** The AI behaviours a release must survive, built from the parse itself. */
function aiModes(det: FinderQuery, rand: () => number): [string, FinderQuery | null][] {
  const keys = stated(det);
  const partial = { ...EMPTY_QUERY } as unknown as Record<string, unknown>;
  // AI fills roughly half of what the sentence said, and nothing else — the
  // realistic partial answer that a wholesale assignment used to destroy.
  for (const k of keys) if (rand() < 0.5) partial[k] = asRec(det)[k];

  const conflicting = { ...EMPTY_QUERY } as unknown as Record<string, unknown>;
  for (const k of keys) {
    const v = asRec(det)[k];
    if (typeof v === 'number') conflicting[k] = v + 37; // a different, weaker bound
  }

  return [
    ['no api key → null', null],
    ['ai returned null', null],
    ['ai threw / timed out → null', null],
    ['ai partial intent', partial as unknown as FinderQuery],
    ['ai agrees', { ...det }],
    ['ai enriches (pace)', { ...EMPTY_QUERY, pace: 70 }],
    ['ai conflicts with stated bounds', conflicting as unknown as FinderQuery],
  ];
}

describe('randomized constraint preservation across every constraint type', () => {
  it('no generated search silently drops, changes, shrinks or invents a constraint', () => {
    const rand = rng(20260810);
    const failures: string[] = [];
    const seenFields = new Set<string>();
    let generated = 0, withConstraints = 0;

    for (let i = 0; i < 1500; i++) {
      const text = sentence(rand);
      if (!text) continue;
      generated++;
      const det = naiveParseQuery(text);
      const detFields = stated(det);
      if (detFields.length === 0) continue;
      withConstraints++;
      detFields.forEach((f) => seenFields.add(f));

      for (const [label, ai] of aiModes(det, rand)) {
        // Supplied UI state: sometimes empty, sometimes carrying a stale value.
        const supplied: FinderQuery = rand() < 0.3 ? { ...EMPTY_QUERY, minMatch: 55 } : { ...EMPTY_QUERY };
        const merged = applyDeterministicFloor(overlayAi(supplied, ai), det);
        failures.push(...violations(`"${text}" | ${label}`, det, ai, supplied, merged));
      }
    }

    // The run has to be substantial and broad, or a green result means nothing.
    expect(generated, 'generator produced too few searches').toBeGreaterThan(500);
    expect(withConstraints, 'too few searches carried a constraint').toBeGreaterThan(300);
    expect(seenFields.size, `covered only: ${[...seenFields].sort().join(", ")}`).toBeGreaterThanOrEqual(13);

    expect(failures.slice(0, 25), `${failures.length} preservation violations`).toEqual([]);
  });

  /**
   * NEGATIVE CONTROL — the detector must be able to FAIL.
   *
   * A property test that cannot catch the bug it was written for is decoration.
   * This replays the EXACT pre-fix merge (`if (ai) query = ai.query`, a
   * wholesale assignment of a complete object carrying nulls) and asserts the
   * harness above reports violations. If someone weakens `violations()` into
   * something that always returns [], this test goes red.
   */
  it('DETECTS the pre-fix merge — proof the check can fail', () => {
    const rand = rng(20260810);
    const caught: string[] = [];
    for (let i = 0; i < 400 && caught.length < 5; i++) {
      const text = sentence(rand);
      if (!text) continue;
      const det = naiveParseQuery(text);
      if (stated(det).length === 0) continue;
      // The old behaviour: AI's partial answer REPLACES everything.
      const partial = { ...EMPTY_QUERY } as unknown as Record<string, unknown>;
      const keys = stated(det);
      partial[keys[0]!] = asRec(det)[keys[0]!];
      const oldMerged = partial as unknown as FinderQuery; // query = ai.query
      caught.push(...violations(`"${text}" | PRE-FIX`, det, oldMerged, { ...EMPTY_QUERY }, oldMerged));
    }
    expect(caught.length, 'the harness failed to detect the original defect').toBeGreaterThan(0);
    expect(caught.some((c) => c.startsWith('DROPPED')), `caught: ${caught.slice(0, 3).join(' | ')}`).toBe(true);
  });

  it('covers every constraint type the parser is capable of setting', () => {
    // Discovered from the parser's own behaviour, not asserted from a list, so
    // this fails loudly if a whole constraint class stops being exercised.
    const rand = rng(777);
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const t = sentence(rand);
      if (t) stated(naiveParseQuery(t)).forEach((f) => seen.add(f));
    }
    expect([...seen].sort().length, `types exercised: ${[...seen].sort().join(", ")}`).toBeGreaterThanOrEqual(13);
  });
});
