/**
 * THE COLD-START TASTE SCANNER.
 *
 * The old planner had one objective and applied it identically on round 1 and
 * round 20. That is wrong at both ends. On round 1 there is no profile, so
 * "reduce uncertainty" cannot discriminate — every axis is equally unknown, so
 * the argmax is decided by whichever pair happens to have the longest trait
 * vector, and the opening question is the same for everybody regardless of who
 * they are. On round 20 the same objective keeps proposing whatever is still
 * technically unresolved, which is usually a territory the player has already
 * shown no interest in.
 *
 * A scan has three jobs, in order, and they want different questions:
 *
 *   SWEEP        Show the entertainment universe. Maximise DISTANCE — between
 *                the two titles, and between this pair and everything already
 *                shown. Information gain is deliberately not consulted: with a
 *                flat prior it is noise dressed as signal.
 *
 *   HYPOTHESIS   Something is emerging. Now test it: gain x attribution x
 *                coverage, the objective the middle game was always right for.
 *                "Chose anime over mainstream comedy" is not an answer, it is
 *                six hypotheses — animation, stylisation, fantasy, emotional
 *                intensity, subtitles, novelty — and this phase is where they
 *                get separated.
 *
 *   RESOLVE      Make it hard. Prefer pairs the model CANNOT PREDICT: where
 *                the profile says the player would like both almost equally.
 *                A question whose answer we already know teaches nothing, and
 *                — this is the product requirement — it also feels like the
 *                machine has stopped paying attention. Late rounds should be
 *                genuinely difficult, and difficulty is exactly what maximum
 *                predictive entropy means.
 *
 * PERFORMANCE IS A DESIGN CONSTRAINT, NOT AN OPTIMISATION. The pool is 113
 * titles, so scoring every pair is 6,328 candidates per round, each touching
 * forty-four axes. That timed out the test suite outright at the old
 * complexity. The fix is a two-stage argmax: score TITLES (linear), keep the
 * best `SHORTLIST`, then score pairs only within the shortlist. Same shape of
 * answer, a fiftieth of the work, and still fully deterministic — no sampling,
 * no randomness, so the persona simulations remain reproducible.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import { TITLES, type DiagnosticTitle } from '@/lib/voice/quickdna/definition';
import {
  TRAIT_KEYS,
  traitBelief,
  traitConfidence,
  traitUncertainty,
  type TraitKey,
  type TraitProfile,
} from '@/lib/voice/quickdna/traits';
import { attributionConfidence, axisAttribution, isTwist } from './attribution';
import { coverageNeed } from './coverage';
import { informationGain, pairKey, pull, separation, type Matchup } from './matchup';

export type ScanPhase = 'sweep' | 'hypothesis' | 'resolve';

/** Decisions in a full scan. Twenty rounds, forty unique titles. */
export const SCAN_DECISIONS = 20;
/** Below this the scan has not learned enough to be worth reporting. */
export const SCAN_MIN_DECISIONS = 12;

/**
 * Where each phase ends, as a fraction of the scan.
 *
 * A THIRD ON SWEEP is not a round number picked for tidiness — with ~14 broad
 * territories to touch and two titles per round, six or seven rounds is the
 * least that can honestly claim to have shown someone the universe. Fewer and
 * the "adaptive" phase is adapting to noise.
 */
export const SWEEP_UNTIL = 0.35;
export const HYPOTHESIS_UNTIL = 0.75;

export function phaseFor(decisionIndex: number, total = SCAN_DECISIONS): ScanPhase {
  const progress = total > 0 ? decisionIndex / total : 0;
  if (progress < SWEEP_UNTIL) return 'sweep';
  if (progress < HYPOTHESIS_UNTIL) return 'hypothesis';
  return 'resolve';
}

/** How many titles survive stage one and get paired against each other. */
export const SHORTLIST = 26;

export interface ScanContext {
  profile: TraitProfile;
  /**
   * EVERY title already put on screen this session, winner or loser, whatever
   * the answer was. The absolute no-repeat invariant: being shown the same film
   * twice is the clearest possible signal that a quiz is not listening.
   */
  seenTitleIds: readonly string[];
  /** Axes recently asked about — damps fixation without forbidding anything. */
  recentAxes: readonly TraitKey[];
  decisionIndex: number;
  total?: number;
  pool?: readonly DiagnosticTitle[];
}

/** Signed trait vector, for distance work. */
function vector(title: DiagnosticTitle): Map<TraitKey, number> {
  const m = new Map<TraitKey, number>();
  for (const e of title.traits) {
    m.set(e.key, (m.get(e.key) ?? 0) + (e.invert ? -e.strength : e.strength));
  }
  return m;
}

/** How far apart two titles are across every axis either one asserts. */
export function territoryDistance(a: DiagnosticTitle, b: DiagnosticTitle): number {
  const va = vector(a);
  const vb = vector(b);
  const keys = new Set<TraitKey>([...va.keys(), ...vb.keys()]);
  let sum = 0;
  for (const k of keys) sum += Math.abs((va.get(k) ?? 0) - (vb.get(k) ?? 0));
  return sum;
}

/**
 * How much NEW ground a title covers relative to what has already been shown.
 *
 * This is what stops the sweep showing four crime films in a row simply because
 * crime films are recognisable and strongly fingerprinted. It rewards a title
 * whose axes nobody has been asked about yet, which is the only way a genuine
 * radar sweep happens rather than a walk through the most popular corner.
 */
export function noveltyAgainst(
  title: DiagnosticTitle,
  shown: readonly DiagnosticTitle[],
): number {
  const v = vector(title);
  if (v.size === 0) return 0;
  const touched = new Set<TraitKey>();
  for (const s of shown) for (const k of vector(s).keys()) touched.add(k);
  let fresh = 0;
  let mass = 0;
  for (const [k, val] of v) {
    const w = Math.abs(val);
    mass += w;
    if (!touched.has(k)) fresh += w;
  }
  return mass > 0 ? fresh / mass : 0;
}

/**
 * What the profile predicts about a title — roughly "would they enjoy this",
 * 0..1, weighted by how confident we are in each axis.
 *
 * Only used by RESOLVE, where the goal is a pair whose two predictions are as
 * close as possible: a coin-flip for the model is the hardest question for the
 * player, and the most informative answer we can still get.
 */
export function predictedAppeal(title: DiagnosticTitle, profile: TraitProfile): number {
  let weighted = 0;
  let mass = 0;
  for (const [k, val] of vector(title)) {
    const belief = traitBelief(profile, k);
    const conf = traitConfidence(profile, k);
    if (conf <= 0) continue;
    const lean = (belief.pref - 50) / 50; // -1..1
    const w = Math.abs(val) * conf;
    weighted += lean * Math.sign(val) * w;
    mass += w;
  }
  if (mass <= 0) return 0.5;
  return Math.max(0, Math.min(1, 0.5 + (weighted / mass) * 0.5));
}

/** Recently-asked axes are damped so the scan does not fixate. */
function stale(testing: readonly TraitKey[], recent: readonly TraitKey[]): number {
  if (testing.length === 0) return 1;
  const idx = [...recent].reverse().indexOf(testing[0]!);
  if (idx === -1) return 1;
  return [0.45, 0.7, 0.85][idx] ?? 0.95;
}

/** Stage one: which titles are even worth pairing, for THIS phase. */
function shortlist(
  pool: readonly DiagnosticTitle[],
  ctx: ScanContext,
  phase: ScanPhase,
  shown: readonly DiagnosticTitle[],
): DiagnosticTitle[] {
  const scored = pool.map((t) => {
    let score: number;
    if (phase === 'sweep') {
      /* NOVELTY LEADS, RECOGNITION MODULATES — and the order matters.
         Multiplying BY recognition let popularity erase the niche: anime sits
         at 0.4-0.6 recognition against Titanic's 0.95, so an anime-loving
         simulated player was never shown a single anime and came out of the
         scan labelled "mainstream, spectacle, comedy". The catalogue contained
         Akira, Your Name and Princess Mononoke throughout; the planner simply
         never dealt them. A sweep that only visits the famous corners is not a
         sweep. Recognition still counts — an unanswerable pair wastes the one
         round where the player is deciding whether this is worth ninety
         seconds — but as a 0.5..1 modifier rather than a gate. */
      score = (0.5 + 0.5 * t.recognition) * (0.2 + 0.8 * noveltyAgainst(t, shown));
    } else if (phase === 'hypothesis') {
      /* UNCERTAINTY LEADS, APPEAL MODULATES — and the appeal half is what makes
         the game adapt to a PERSON rather than to a schedule.
         
         Every information-theoretic term in this planner — uncertainty, gain,
         coverage need, even the closeness of a predicted call — is invariant
         under inverting a profile. Two players with exactly opposite taste
         develop mirrored beliefs and IDENTICAL confidence, so all of those
         score every pair the same and both players were dealt the same twenty
         questions. Measured: 20 of 20 identical for a dark-preferring and a
         light-preferring player, with beliefs that were perfect mirrors
         (pref 100 vs pref 0) on every axis.
         
         Predicted appeal is the one term that is not symmetric: the titles this
         person is expected to want are exactly the titles the mirror player is
         expected to reject. It also happens to be the right product behaviour —
         a calibration game that keeps showing you things you would never watch
         is both less informative and less fun than one that argues with you
         about films you might actually pick. */
      let open = 0;
      for (const [k, v] of vector(t)) open += Math.abs(v) * traitUncertainty(ctx.profile, k);
      score = open * t.recognition * (0.5 + 0.5 * predictedAppeal(t, ctx.profile));
    } else {
      // RESOLVE: titles the model has an opinion about — a pair can only be
      // finely balanced if both sides are predictable enough to balance.
      let known = 0;
      for (const [k] of vector(t)) known += traitConfidence(ctx.profile, k);
      score = known * t.recognition;
    }
    return { t, score };
  });
  scored.sort((a, b) => b.score - a.score || (a.t.id < b.t.id ? -1 : 1));
  return scored.slice(0, SHORTLIST).map((s) => s.t);
}

/** The next matchup, or null when the scan is done. */
export function nextScanMatchup(ctx: ScanContext): Matchup | null {
  const total = ctx.total ?? SCAN_DECISIONS;
  if (ctx.decisionIndex >= total) return null;

  const seen = new Set(ctx.seenTitleIds);
  const all = ctx.pool ?? TITLES;
  const shown = all.filter((t) => seen.has(t.id));
  // THE INVARIANT, enforced at the source: a seen title is not a candidate.
  const pool = all.filter((t) => !seen.has(t.id));
  if (pool.length < 2) return null;

  const phase = phaseFor(ctx.decisionIndex, total);
  const list = shortlist(pool, ctx, phase, shown);

  let best: Matchup | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      if (a.id === b.id) continue;

      const axes = [...new Set([...a.traits, ...b.traits].map((e) => e.key))];
      const split = axes.map((k) => ({ key: k, sep: Math.min(1, separation(a, b, k)) }));
      const seps = split.map((s) => s.sep).filter((s) => s > 0);
      if (seps.length === 0) continue;
      const attribution = attributionConfidence(seps);
      const answerable = Math.min(a.recognition, b.recognition);
      const { gain, testing } = informationGain(a, b, ctx.profile);

      let score: number;
      if (phase === 'sweep') {
        /* DISTANCE, not gain. Two titles that state opposite propositions, in
           territory nobody has been asked about yet. Gain is omitted on
           purpose: against a flat prior every axis is equally uncertain, so
           gain reduces to "whose trait list is longest" — a property of the
           CATALOGUE, not the player, and the reason the old opening question
           was identical for everyone. */
        const fresh = (noveltyAgainst(a, shown) + noveltyAgainst(b, shown)) / 2;
        score = territoryDistance(a, b) * (0.4 + 0.6 * fresh) * answerable;
      } else if (phase === 'hypothesis') {
        const need = coverageNeed(
          ctx.profile,
          split.map((s) => ({ key: s.key, attribution: axisAttribution(s.sep, seps) })),
        );
        /* BALANCE IS WHAT MAKES THE GAME ADAPT TO A PERSON RATHER THAN TO A
           SCHEDULE, and its absence here was a real defect. `gain`, `attribution`
           and `need` are all functions of how CERTAIN the profile is and none of
           them of what it BELIEVES — so two players with exactly opposite taste
           develop identical uncertainty and were dealt an identical session.
           Measured before this line existed: 20 of 20 questions the same for a
           dark-preferring and a light-preferring player.

           `1 - |Δpredicted|` is the missing half. It peaks on the pair this
           particular profile rates most evenly — the question the model cannot
           call — which is a different pair for two people who have answered
           differently, and is also the round a player experiences as the game
           reading them. The resolve phase already used it; the phase where
           hypotheses actually form did not. */
        const balance =
          1 - Math.abs(predictedAppeal(a, ctx.profile) - predictedAppeal(b, ctx.profile));
        score = gain * attribution * need * stale(testing, ctx.recentAxes) * (0.35 + 0.65 * balance);
      } else {
        /* RESOLVE: closeness. `1 - |Δpredicted|` peaks when the model rates the
           two titles identically — the question it genuinely cannot call, which
           is also the one the player finds hardest. Attribution still matters
           (a close pair that differs on six axes teaches little) and so does
           recognition. */
        const balance = 1 - Math.abs(predictedAppeal(a, ctx.profile) - predictedAppeal(b, ctx.profile));
        score = balance * attribution * answerable * (0.5 + 0.5 * Math.min(1, gain));
      }

      if (score > bestScore) {
        bestScore = score;
        best = { left: a, right: b, testing, gain, attribution, twist: isTwist(seps) };
      }
    }
  }
  return best;
}

/** Per-axis confidence, for a readout that never collapses to one number. */
export function dimensionConfidence(profile: TraitProfile): Array<{
  key: TraitKey;
  pref: number;
  confidence: number;
  tier: 'high' | 'medium' | 'low';
}> {
  return TRAIT_KEYS.map((key) => {
    const b = traitBelief(profile, key);
    const c = traitConfidence(profile, key);
    return {
      key,
      pref: b.pref,
      confidence: c,
      tier: c >= 0.5 ? ('high' as const) : c >= 0.25 ? ('medium' as const) : ('low' as const),
    };
  }).sort((a, b) => b.confidence - a.confidence);
}

export { pairKey, pull };
