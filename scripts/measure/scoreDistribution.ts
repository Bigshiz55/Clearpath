#!/usr/bin/env npx tsx
/**
 * SCORE-COMPRESSION MEASUREMENT — READ-ONLY, REPRODUCIBLE, NO PRODUCTION DATA.
 *
 * The open question: `PERSONAL_NUDGE_CEILING` is 18, and one production sample
 * showed a 24-title thriller field spanning 17 points. If that is typical, the
 * personal term can reorder the entire field rather than break ties — which
 * would make personalization a replacement ranker, not a preference.
 *
 * This measures rather than assumes. It drives the REAL pure scoring seam
 * (`personalSignal` + `dimensionMatch`, the same functions `personalRanking`
 * calls) over synthetic candidate fields whose base-score distributions are
 * taken from OBSERVED production shapes, across five behavioural taste
 * profiles. Nothing here touches the network, the database, or a user.
 *
 * Synthetic candidates are the point, not a shortcut: the question is how the
 * TRANSFORM behaves across distribution shapes, and a fixed seed makes that
 * answerable and repeatable. Where a number comes from production it is
 * labelled as such.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { personalSignal, PERSONAL_NUDGE_CEILING } from '../../src/lib/ask/personalSignal';
import { dimensionMatch, DIMENSION_KEYS, buildProfile, type TitleDimensions, type DimensionProfile } from '../../src/lib/scoring/dimensions';

/** Deterministic RNG — the measurement must be reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const stats = (xs: number[]) => {
  if (xs.length === 0) return { n: 0, min: 0, max: 0, mean: 0, median: 0, p25: 0, p75: 0, stddev: 0, spread: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const varc = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return {
    n: xs.length, min: s[0]!, max: s[s.length - 1]!, mean: +mean.toFixed(2),
    median: q(50), p25: q(25), p75: q(75), stddev: +Math.sqrt(varc).toFixed(2),
    spread: s[s.length - 1]! - s[0]!,
  };
};

/** Five behavioural taste profiles. Shapes, not people. */
const PROFILES: Array<[string, Partial<Record<string, number>>]> = [
  ['mainstream-spectacle', { stakes: 90, pacing: 85, complexity: 30, darkness: 40, realism: 30 }],
  ['dark-crime',           { darkness: 90, realism: 80, violence: 70, humor: 20, complexity: 75 }],
  ['comfort-family',       { warmth: 90, humor: 80, darkness: 15, violence: 10, stakes: 30 }],
  ['horror-dark',          { suspense: 95, darkness: 88, violence: 80, warmth: 15, humor: 20 }],
  ['animation-anime',      { emotion: 85, warmth: 70, realism: 20, serialized: 75, complexity: 60 }],
];

function profileOf(pref: Partial<Record<string, number>>, samples: number): DimensionProfile {
  const p = buildProfile([]) as unknown as Record<string, unknown>;
  const prefMap: Record<string, number> = {};
  const weight: Record<string, number> = {};
  for (const k of DIMENSION_KEYS) {
    prefMap[k] = pref[k] ?? 50;
    weight[k] = pref[k] != null ? 1 : 0;
  }
  return { ...(p as object), pref: prefMap, weight, samples } as unknown as DimensionProfile;
}

/** Base-score distributions taken from observed production fields. */
const SCENARIOS: Array<[string, number, number, number]> = [
  // label, candidateCount, baseMin, baseMax
  ['broad-movie-discovery',   24, 68, 85],  // observed: "Looking for a good thriller"
  ['broad-tv-discovery',      24, 65, 84],
  ['thriller',                24, 68, 85],
  ['comedy',                  20, 62, 82],
  ['drama',                   20, 64, 86],
  ['horror',                  18, 58, 80],
  ['family',                  16, 60, 83],
  ['subject-aboutness',       13, 51, 82],  // observed: "movies about chess"
  ['person-credit',            3, 77, 79],  // observed: "three Stallone movies"
  ['comparative-critic',      12, 60, 84],
  ['sparse-candidates',        5, 70, 78],
  ['broad-candidates',        40, 55, 88],
];

interface Row {
  scenario: string; profile: string; candidates: number;
  base: ReturnType<typeof stats>; nudge: ReturnType<typeof stats>; final: ReturnType<typeof stats>;
  zeroEvidence: number; positive: number; negative: number;
  rankChanges: number; rankChangeRate: number; top1Changed: boolean; top3Changed: boolean;
  weakOvertookStrong: number; maxBaseGapCrossed: number;
}

/** `coverage` = share of candidates that HAVE a cached fingerprint. Production
 *  reality is that many do not, and that is one of the causes under test. */
function run(coverage: number, samples: number): Row[] {
  const rows: Row[] = [];
  for (const [scenario, count, lo, hi] of SCENARIOS) {
    for (const [pname, pref] of PROFILES) {
      const r = rng(0xC0FFEE);
      const profile = profileOf(pref, samples);
      const items = Array.from({ length: count }, (_, i) => {
        const base = Math.round(lo + r() * (hi - lo));
        const hasDims = r() < coverage;
        const dims: TitleDimensions | null = hasDims
          ? Object.fromEntries(DIMENSION_KEYS.map((k) => [k, Math.round(r() * 100)]))
          : null;
        return { id: i, base, dims };
      });

      const scored = items.map((it) => {
        const dm = it.dims && samples > 0 ? dimensionMatch(it.dims, profile) : null;
        const sig = personalSignal({
          objective: it.base, dimMatch: dm, prefNudge: 0,
          reasons: [], concerns: [], explainConfidence: 0,
          profileSamples: samples,
        });
        return { ...it, dm, final: sig.rankScore, nudge: sig.rankScore - it.base, participated: sig.participated };
      });

      const byBase = [...scored].sort((a, b) => b.base - a.base || a.id - b.id);
      const byFinal = [...scored].sort((a, b) => b.final - a.final || a.id - b.id);
      const posOf = (arr: typeof scored) => new Map(arr.map((x, i) => [x.id, i]));
      const pb = posOf(byBase), pf = posOf(byFinal);
      const rankChanges = scored.filter((x) => pb.get(x.id) !== pf.get(x.id)).length;

      // A weaker candidate overtaking a clearly stronger one is the failure
      // mode that matters: personalization replacing quality rather than
      // breaking a tie. "Clearly" = a base gap wider than the whole ceiling.
      let weakOvertook = 0, maxGap = 0;
      for (const a of scored) for (const b of scored) {
        if (a.id === b.id) continue;
        if (a.base < b.base && a.final > b.final) {
          weakOvertook += 1;
          maxGap = Math.max(maxGap, b.base - a.base);
        }
      }

      rows.push({
        scenario, profile: pname, candidates: count,
        base: stats(scored.map((x) => x.base)),
        nudge: stats(scored.filter((x) => x.participated).map((x) => x.nudge)),
        final: stats(scored.map((x) => x.final)),
        zeroEvidence: scored.filter((x) => !x.participated).length,
        positive: scored.filter((x) => x.nudge > 0).length,
        negative: scored.filter((x) => x.nudge < 0).length,
        rankChanges, rankChangeRate: +(rankChanges / count).toFixed(3),
        top1Changed: byBase[0]!.id !== byFinal[0]!.id,
        top3Changed: JSON.stringify(byBase.slice(0, 3).map((x) => x.id)) !== JSON.stringify(byFinal.slice(0, 3).map((x) => x.id)),
        weakOvertookStrong: weakOvertook / 2,
        maxBaseGapCrossed: maxGap,
      });
    }
  }
  return rows;
}

const CONDITIONS: Array<[string, number, number]> = [
  ['full-coverage-strong-dna', 1.0, 40],
  ['partial-coverage-strong-dna', 0.5, 40],
  ['full-coverage-weak-dna', 1.0, 3],
  ['no-dna', 1.0, 0],
];

const out: Record<string, Row[]> = {};
for (const [label, cov, samples] of CONDITIONS) out[label] = run(cov, samples);

const agg = (rows: Row[]) => ({
  scenarios: rows.length,
  baseSpread: stats(rows.map((r) => r.base.spread)),
  baseStddev: stats(rows.map((r) => r.base.stddev)),
  nudgeAbsMax: Math.max(0, ...rows.map((r) => Math.max(Math.abs(r.nudge.min), Math.abs(r.nudge.max)))),
  nudgeStddev: stats(rows.map((r) => r.nudge.stddev)),
  rankChangeRate: stats(rows.map((r) => r.rankChangeRate)),
  top1ChangedPct: +(rows.filter((r) => r.top1Changed).length / rows.length).toFixed(3),
  top3ChangedPct: +(rows.filter((r) => r.top3Changed).length / rows.length).toFixed(3),
  zeroEvidencePct: +(rows.reduce((a, r) => a + r.zeroEvidence, 0) / rows.reduce((a, r) => a + r.candidates, 0)).toFixed(3),
  weakOvertookTotal: rows.reduce((a, r) => a + r.weakOvertookStrong, 0),
  maxBaseGapCrossed: Math.max(0, ...rows.map((r) => r.maxBaseGapCrossed)),
});

console.log(`PERSONAL_NUDGE_CEILING = ${PERSONAL_NUDGE_CEILING}\n`);
for (const [label, rows] of Object.entries(out)) {
  const a = agg(rows);
  console.log(`── ${label} (${a.scenarios} scenario×profile cells)`);
  console.log(`   base spread   median ${a.baseSpread.median}  (min ${a.baseSpread.min}, max ${a.baseSpread.max})`);
  console.log(`   base stddev   median ${a.baseStddev.median}`);
  console.log(`   |nudge| max   ${a.nudgeAbsMax}   nudge stddev median ${a.nudgeStddev.median}`);
  console.log(`   rank change   ${(a.rankChangeRate.median * 100).toFixed(1)}% of titles (median)`);
  console.log(`   top-1 changed ${(a.top1ChangedPct * 100).toFixed(0)}% of cells · top-3 ${(a.top3ChangedPct * 100).toFixed(0)}%`);
  console.log(`   no evidence   ${(a.zeroEvidencePct * 100).toFixed(1)}% of titles`);
  console.log(`   weaker-overtook-stronger pairs ${a.weakOvertookTotal}, widest base gap crossed ${a.maxBaseGapCrossed}\n`);
}

const path = 'artifacts/measure/score-distribution.json';
try {
  mkdirSync('artifacts/measure', { recursive: true });
  writeFileSync(path, JSON.stringify({ ceiling: PERSONAL_NUDGE_CEILING, conditions: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { aggregate: agg(v), cells: v }])) }, null, 1));
  console.log(`machine-readable → ${path}`);
} catch (e) {
  console.log('could not persist:', (e as Error).message);
}
