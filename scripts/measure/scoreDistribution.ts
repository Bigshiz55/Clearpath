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
import { relevanceSignals, RELEVANCE_NUDGE_MAX } from '../../src/lib/ask/relevanceSignal';
import { PREF_NUDGE_MAX } from '../../src/lib/preference/rank';
import { dimensionMatch, DIMENSION_KEYS, buildProfile, type TitleDimensions, type DimensionProfile } from '../../src/lib/scoring/dimensions';

/** Deterministic RNG — the measurement must be reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const stats = (xs: number[]) => {
  if (xs.length === 0) return { n: 0, min: 0, max: 0, mean: 0, median: 0, p10: 0, p25: 0, p75: 0, p90: 0, stddev: 0, spread: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const varc = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return {
    n: xs.length, min: s[0]!, max: s[s.length - 1]!, mean: +mean.toFixed(2),
    median: q(50), p10: q(10), p25: q(25), p75: q(75), p90: q(90),
    stddev: +Math.sqrt(varc).toFixed(2),
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

/**
 * Scenarios whose request names a SUBJECT, so `evaluateSubjectCentrality`
 * produces a per-candidate 0..100 the ranking can use. Taken from queries this
 * product has actually been measured serving ("another boxing movie", "movies
 * about chess", "two space movies"), never invented: a scenario marked
 * subject-bearing that the product would not gate on a subject would
 * manufacture an improvement that no user receives.
 */
const SUBJECT_BEARING = new Set(['subject-aboutness', 'subject-boxing', 'subject-space']);

/**
 * The evaluator's own confidence scale for a candidate that PASSED the subject
 * gate: title hit 95, keyword cluster + summary 92, cluster alone 86, two
 * non-setting mentions 80. Not a distribution invented here — these are the
 * literal constants in `evaluateSubjectCentrality`.
 */
const PASSING_CONFIDENCES = [95, 92, 86, 80];

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
  ['subject-boxing',          24, 62, 86],  // observed: "another boxing movie"
  ['subject-space',            2, 70, 80],  // observed: "two space movies"
  ['sparse-candidates',        5, 70, 78],
  ['broad-candidates',        40, 55, 88],
];

interface Row {
  scenario: string; profile: string; candidates: number;
  base: ReturnType<typeof stats>; nudge: ReturnType<typeof stats>; final: ReturnType<typeof stats>;
  zeroEvidence: number; positive: number; negative: number;
  rankChanges: number; rankChangeRate: number; top1Changed: boolean; top3Changed: boolean;
  weakOvertookStrong: number; maxBaseGapCrossed: number;
  /* HOW MUCH ROOM THE SCALE ACTUALLY HAS. A field where most candidates share
     a score has no dynamic range to rank with, whatever the ceiling says. */
  uniqueBase: number; uniqueFinal: number; nearTieBasePct: number; nearTieFinalPct: number;
  /* HOW DECISIVE THE ANSWER IS. A one-point win is a coin toss wearing a
     ranking; a fifteen-point win is a verdict. */
  winMarginBase: number; winMarginFinal: number;
  /* AFTER — the same field with the request-fit channel in the order. */
  subjectBearing: boolean; winMarginRelevance: number;
  winnerBefore: number; winnerAfter: number; runnerUpAfter: number;
  relevanceChangedTop1: boolean; relevanceAbsMax: number;
  /* PER CHANNEL, MEASURED IN ISOLATION — the same field scored with only the
     fingerprint term live, then only the stated-preference term. */
  dimOnly: { absMax: number; rankChanges: number };
  prefOnly: { absMax: number; rankChanges: number };
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

      /* REQUEST FIT, FROM THE EVALUATOR'S OWN SCALE. Only for scenarios whose
         request actually names a subject; everywhere else the channel is inert
         because the request drew no distinction between candidates. */
      const subjectBearing = SUBJECT_BEARING.has(scenario);
      const rel = rng(0x5B1EC7);
      const confidences: (number | null)[] = items.map(() =>
        subjectBearing ? PASSING_CONFIDENCES[Math.floor(rel() * PASSING_CONFIDENCES.length)]! : null,
      );
      const relSignals = relevanceSignals(confidences.map((c) => ({ confidence: c, centrality: c == null ? null : 'CENTRAL' })));

      const scored = items.map((it) => {
        const dm = it.dims && samples > 0 ? dimensionMatch(it.dims, profile) : null;
        const sig = personalSignal({
          objective: it.base, dimMatch: dm, prefNudge: 0,
          reasons: [], concerns: [], explainConfidence: 0,
          profileSamples: samples,
        });
        const relNudge = relSignals[it.id]?.nudge ?? 0;
        return {
          ...it, dm,
          final: sig.rankScore, nudge: sig.rankScore - it.base, participated: sig.participated,
          // BEFORE = quality + person. AFTER = quality + person + request fit.
          withRelevance: sig.rankScore + relNudge, relNudge,
        };
      });

      const byBase = [...scored].sort((a, b) => b.base - a.base || a.id - b.id);
      const byFinal = [...scored].sort((a, b) => b.final - a.final || a.id - b.id);
      const byRelevance = [...scored].sort((a, b) => b.withRelevance - a.withRelevance || a.id - b.id);
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

      /* ── DYNAMIC RANGE ────────────────────────────────────────────────
         `unique` counts distinct scores; a near tie is a pair the scale
         separates by a point or less, which is not a separation a reader
         would defend. Both are measured before and after the personal term,
         because a term that only breaks ties should RAISE uniqueness. */
      const uniq = (xs: number[]) => new Set(xs.map((x) => Math.round(x))).size;
      const nearTiePct = (xs: number[]) => {
        const sorted = [...xs].sort((a, b) => a - b);
        let pairs = 0;
        for (let i = 1; i < sorted.length; i += 1) if (sorted[i]! - sorted[i - 1]! <= 1) pairs += 1;
        return sorted.length > 1 ? +(pairs / (sorted.length - 1)).toFixed(3) : 0;
      };
      const margin = (arr: typeof scored, of: (x: (typeof scored)[number]) => number) =>
        arr.length > 1 ? +(of(arr[0]!) - of(arr[1]!)).toFixed(2) : 0;

      /* ── ONE CHANNEL AT A TIME ────────────────────────────────────────
         `personalSignal` takes the fingerprint match and the stated
         preference as separate inputs, so each can be run alone against the
         SAME field. That is what makes "which family moved the ranking"
         answerable rather than asserted. The preference draw is synthetic and
         bounded by the shipped constant, and labelled as such. */
      const channel = (useDims: boolean, usePref: boolean) => {
        const cr = rng(0x5EED);
        const one = scored.map((it) => {
          const prefNudge = usePref ? Math.round((cr() * 2 - 1) * PREF_NUDGE_MAX) : 0;
          const sig = personalSignal({
            objective: it.base,
            dimMatch: useDims ? it.dm : null,
            prefNudge,
            reasons: [], concerns: [], explainConfidence: 0,
            profileSamples: samples,
          });
          return { id: it.id, base: it.base, final: sig.rankScore, nudge: sig.rankScore - it.base };
        });
        const pos = (arr: typeof one) => new Map([...arr].sort((a, b) => b.final - a.final || a.id - b.id).map((x, i) => [x.id, i]));
        const pFinal = pos(one);
        const changes = one.filter((x) => pb.get(x.id) !== pFinal.get(x.id)).length;
        return { absMax: +Math.max(0, ...one.map((x) => Math.abs(x.nudge))).toFixed(2), rankChanges: changes };
      };

      rows.push({
        scenario, profile: pname, candidates: count,
        uniqueBase: uniq(scored.map((x) => x.base)),
        uniqueFinal: uniq(scored.map((x) => x.final)),
        nearTieBasePct: nearTiePct(scored.map((x) => x.base)),
        nearTieFinalPct: nearTiePct(scored.map((x) => x.final)),
        winMarginBase: margin(byBase, (x) => x.base),
        winMarginFinal: margin(byFinal, (x) => x.final),
        subjectBearing,
        winMarginRelevance: margin(byRelevance, (x) => x.withRelevance),
        winnerBefore: byFinal[0]?.id ?? -1,
        winnerAfter: byRelevance[0]?.id ?? -1,
        runnerUpAfter: byRelevance[1]?.id ?? -1,
        relevanceChangedTop1: (byFinal[0]?.id ?? -1) !== (byRelevance[0]?.id ?? -1),
        relevanceAbsMax: +Math.max(0, ...scored.map((x) => Math.abs(x.relNudge))).toFixed(2),
        dimOnly: channel(true, false),
        prefOnly: channel(false, true),
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
  /* DYNAMIC RANGE — does the scale have room to rank with at all? */
  uniqueBaseShare: +(
    rows.reduce((a, r) => a + r.uniqueBase, 0) / rows.reduce((a, r) => a + r.candidates, 0)
  ).toFixed(3),
  uniqueFinalShare: +(
    rows.reduce((a, r) => a + r.uniqueFinal, 0) / rows.reduce((a, r) => a + r.candidates, 0)
  ).toFixed(3),
  nearTieBase: stats(rows.map((r) => r.nearTieBasePct)),
  nearTieFinal: stats(rows.map((r) => r.nearTieFinalPct)),
  winMarginBase: stats(rows.map((r) => r.winMarginBase)),
  winMarginFinal: stats(rows.map((r) => r.winMarginFinal)),
  /* THE BEFORE/AFTER THE CLOSURE ASKED FOR, over the cells where the request
     actually names a subject. Reporting it over every cell would dilute a real
     effect with scenarios the channel is designed to leave alone. */
  subjectCells: rows.filter((r) => r.subjectBearing).length,
  winMarginSubjectBefore: stats(rows.filter((r) => r.subjectBearing).map((r) => r.winMarginFinal)),
  winMarginSubjectAfter: stats(rows.filter((r) => r.subjectBearing).map((r) => r.winMarginRelevance)),
  relevanceAbsMax: Math.max(0, ...rows.map((r) => r.relevanceAbsMax)),
  relevanceChangedTop1Pct: +(
    rows.filter((r) => r.subjectBearing && r.relevanceChangedTop1).length /
    Math.max(1, rows.filter((r) => r.subjectBearing).length)
  ).toFixed(3),
  nonSubjectUntouched: rows.filter((r) => !r.subjectBearing).every((r) => r.relevanceAbsMax === 0),
  /* WHICH FAMILY MOVED IT — the same field, one channel at a time. */
  byChannel: {
    fingerprint: {
      absMax: Math.max(0, ...rows.map((r) => r.dimOnly.absMax)),
      rankChangeRate: +(
        rows.reduce((a, r) => a + r.dimOnly.rankChanges, 0) / rows.reduce((a, r) => a + r.candidates, 0)
      ).toFixed(3),
    },
    statedPreference: {
      absMax: Math.max(0, ...rows.map((r) => r.prefOnly.absMax)),
      rankChangeRate: +(
        rows.reduce((a, r) => a + r.prefOnly.rankChanges, 0) / rows.reduce((a, r) => a + r.candidates, 0)
      ).toFixed(3),
    },
  },
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
  console.log(`   weaker-overtook-stronger pairs ${a.weakOvertookTotal}, widest base gap crossed ${a.maxBaseGapCrossed}`);
  console.log(`   DYNAMIC RANGE  distinct scores ${(a.uniqueBaseShare * 100).toFixed(0)}% of the field → ${(a.uniqueFinalShare * 100).toFixed(0)}% after the personal term`);
  console.log(`                  near ties (<=1pt apart) ${(a.nearTieBase.median * 100).toFixed(0)}% → ${(a.nearTieFinal.median * 100).toFixed(0)}% (median cell)`);
  console.log(`                  winning margin median ${a.winMarginBase.median} → ${a.winMarginFinal.median}  (p10 ${a.winMarginBase.p10} → ${a.winMarginFinal.p10}, p90 ${a.winMarginBase.p90} → ${a.winMarginFinal.p90})`);
  /* LABELLED AS A CAPABILITY PROBE, because that is what it is. The isolated
     channel run synthesises its own bounded preference draw over the SAME
     field, so it answers "what can this term do on its own" — it is NOT gated
     by the condition's fingerprint coverage or profile depth. Printed under a
     condition header without that label, the `no-dna` row reads as "no profile,
     and preference still moved 88.6% of titles", which would be a false claim
     about that condition. */
  console.log(`   BY CHANNEL     (isolated capability on the same field — not gated by this condition)`);
  console.log(`                  fingerprint |max| ${a.byChannel.fingerprint.absMax}, moved ${(a.byChannel.fingerprint.rankChangeRate * 100).toFixed(1)}% of titles`);
  console.log(`                  stated preference |max| ${a.byChannel.statedPreference.absMax}, moved ${(a.byChannel.statedPreference.rankChangeRate * 100).toFixed(1)}% of titles`);
  console.log(`   BASE SHAPE     min ${a.baseSpread.min} · p25 ${a.baseSpread.p25} · median ${a.baseSpread.median} · p75 ${a.baseSpread.p75} · max ${a.baseSpread.max} (spread per cell)`);
  const b = a.winMarginSubjectBefore, f = a.winMarginSubjectAfter;
  console.log(`   REQUEST FIT    ${a.subjectCells} subject-bearing cells · |max| ${a.relevanceAbsMax} (ceiling ${RELEVANCE_NUDGE_MAX}) · changed the winner in ${(a.relevanceChangedTop1Pct * 100).toFixed(0)}%`);
  console.log(`                  winning margin BEFORE  min ${b.min} · p25 ${b.p25} · median ${b.median} · p75 ${b.p75} · max ${b.max}`);
  console.log(`                  winning margin AFTER   min ${f.min} · p25 ${f.p25} · median ${f.median} · p75 ${f.p75} · max ${f.max}`);
  console.log(`                  non-subject cells untouched: ${a.nonSubjectUntouched ? 'yes' : 'NO — the channel is leaking'}\n`);
}

const path = 'artifacts/measure/score-distribution.json';
try {
  mkdirSync('artifacts/measure', { recursive: true });
  writeFileSync(path, JSON.stringify({ ceiling: PERSONAL_NUDGE_CEILING, conditions: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { aggregate: agg(v), cells: v }])) }, null, 1));
  console.log(`machine-readable → ${path}`);
} catch (e) {
  console.log('could not persist:', (e as Error).message);
}
