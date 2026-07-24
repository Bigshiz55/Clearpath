/**
 * Court "Genre Draft" — GROUP SCORING ENGINE. PURE, but PROPRIETARY: the exact
 * weighting below is server-only and must never be imported by a client component
 * (only server actions / RPC handlers import this module). It turns each juror's
 * ranked picks + vetoes + Watch DNA into a single group recommendation.
 *
 * This is deliberately NOT majority voting. Each candidate gets a predicted
 * per-juror satisfaction, and the final score rewards CONSENSUS — high satisfaction
 * for the least-enthusiastic juror and low disagreement — so a title everyone likes
 * beats a title one juror loves and another dislikes. Discovery value and a veto
 * penalty keep it from collapsing to the blandest safe option every time.
 */
import { affinity01 } from './deck';
import type { CandidateScore, CourtCandidate, CourtParticipant, CourtSelections, CourtVerdict, RankedPick, Veto } from './types';

// ── Proprietary weights (server-only; do not export) ────────────────────────────
const RANK_BOOST: Record<1 | 2 | 3, number> = { 1: 0.45, 2: 0.28, 3: 0.14 }; // weighted, not equal
const PREF_VETO_DROP = 0.5; // how far a preference veto pulls that juror's satisfaction down
const PREF_VETO_PTS = 10; // aggregate penalty per preference veto
const W_AVG = 0.34; // overall predicted group satisfaction
const W_LOW = 0.40; // fairness to the least-satisfied juror (heaviest → consensus wins)
const W_AGREE = 0.26; // shared enthusiasm / low disagreement
const DISCOVERY_MAX = 12; // most a non-obvious pick can gain
const AVAIL_FULL = 1.0;
const AVAIL_LISTED = 0.85; // available but provider list unknown
const AVAIL_NONE = 0.3; // not verified available → low confidence

function clamp(x: number, lo: number, hi: number): number { return x < lo ? lo : x > hi ? hi : x; }
function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function stdev(xs: number[]): number { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); }

function rankOf(picks: RankedPick[] | undefined, key: string): 1 | 2 | 3 | null {
  return picks?.find((p) => p.key === key)?.rank ?? null;
}
function vetoOf(vetoes: Veto[] | undefined, key: string): Veto | null {
  return vetoes?.find((v) => v.key === key) ?? null;
}

/** Predicted satisfaction (0..1) of one juror for one candidate. */
function satisfaction(p: CourtParticipant, c: CourtCandidate, sel: CourtSelections): number {
  const dna = affinity01(p, c);
  const rank = rankOf(sel.picks[p.id], c.key);
  const boost = rank ? RANK_BOOST[rank] : 0;
  const veto = vetoOf(sel.vetoes?.[p.id], c.key);
  const drop = veto?.kind === 'preference' ? PREF_VETO_DROP : 0;
  return clamp(dna + boost - drop, 0, 1);
}

function availabilityConfidence(c: CourtCandidate): number {
  if (!c.available) return AVAIL_NONE;
  return c.providers && c.providers.length ? AVAIL_FULL : AVAIL_LISTED;
}

/**
 * Score every candidate for the jury and pick a winner, runner-up, and wildcard.
 * `opts.hardVetoes` makes even a preference veto eliminate a title; a `content`
 * veto ALWAYS eliminates (a declared restriction, not a mere preference).
 */
export function deliberate(
  candidates: CourtCandidate[],
  participants: CourtParticipant[],
  selections: CourtSelections,
  opts: { hardVetoes?: boolean } = {},
): CourtVerdict {
  const sel: CourtSelections = { picks: selections.picks ?? {}, vetoes: selections.vetoes ?? {} };

  const ranked: CandidateScore[] = candidates.map((c) => {
    const sats = participants.map((p) => satisfaction(p, c, sel));
    const perParticipant: Record<string, number> = {};
    participants.forEach((p, i) => { perParticipant[p.id] = Math.round(sats[i]! * 100); });

    const avg = mean(sats) * 100;
    const low = Math.min(...(sats.length ? sats : [0])) * 100;
    const agreement = clamp(1 - 2 * stdev(sats), 0, 1) * 100;

    // Vetoes.
    let prefVetoes = 0;
    let eliminated = false;
    for (const p of participants) {
      const v = vetoOf(sel.vetoes?.[p.id], c.key);
      if (!v) continue;
      if (v.kind === 'content') eliminated = true; // declared restriction → always out
      else { prefVetoes += 1; if (opts.hardVetoes) eliminated = true; }
    }
    const vetoPenalty = prefVetoes * PREF_VETO_PTS;

    // Discovery: strong predicted fit that few (or none) explicitly picked.
    const pickedFraction = participants.length
      ? participants.filter((p) => rankOf(sel.picks[p.id], c.key) != null).length / participants.length
      : 0;
    const discoveryBonus = DISCOVERY_MAX * clamp(avg / 100, 0, 1) * (1 - pickedFraction);

    const availabilityConf = availabilityConfidence(c);
    const consensus = W_AVG * avg + W_LOW * low + W_AGREE * agreement;
    let finalScore = clamp(consensus + discoveryBonus - vetoPenalty, 0, 100) * availabilityConf;
    if (eliminated) finalScore = Number.NEGATIVE_INFINITY;

    return {
      key: c.key,
      candidate: c,
      avgSatisfaction: round1(avg),
      lowestSatisfaction: round1(low),
      agreementScore: round1(agreement),
      vetoPenalty,
      discoveryBonus: round1(discoveryBonus),
      availabilityConfidence: availabilityConf,
      finalScore: eliminated ? Number.NEGATIVE_INFINITY : round1(finalScore),
      eliminated,
      perParticipant,
    };
  });

  // Rank by final score (eliminated sink to the bottom); deterministic key tiebreak.
  ranked.sort((a, b) => b.finalScore - a.finalScore || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const eligible = ranked.filter((r) => !r.eliminated);
  const winner = eligible[0] ?? null;
  const runnerUp = eligible[1] ?? null;

  // Wildcard: a less-obvious pick with strong group potential — highest discovery
  // (blended with a little of its final score) among titles that aren't the top two.
  const wildcard =
    [...eligible.slice(2)].sort(
      (a, b) => (b.discoveryBonus * 2 + b.finalScore * 0.1) - (a.discoveryBonus * 2 + a.finalScore * 0.1) || (a.key < b.key ? -1 : 1),
    )[0] ?? null;

  return { ranked, winner, runnerUp, wildcard };
}

function round1(x: number): number { return Math.round(x * 10) / 10; }
