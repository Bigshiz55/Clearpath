/**
 * CRITIC REASONING — what a better recommendation should keep, move, or drop.
 *
 * ── WHAT THIS REPLACES, AND WHY ───────────────────────────────────────────
 * The provisional model rewarded DEPARTURE from the anchor centroid whenever
 * the relation was `better_than`. It proved GC8's causality and it is wrong as
 * semantics. "Better than X" does not mean "different from X": somebody naming
 * two films they love and asking for better is not asking to flee them. A
 * candidate can be dramatically different from an anchor and dramatically
 * worse, and undirected distance cannot tell those apart — it has no idea which
 * of the anchor's qualities were the good ones.
 *
 * This is the stage that knows. It turns three DIFFERENT KINDS OF FACT into
 * structured, per-axis instructions:
 *
 *   ANCHOR FACT   "these films are high on suspense"
 *   USER FACT     "this user's mature DNA prefers low warmth"
 *   REQUEST FACT  "they asked for funnier"
 *
 * Kept apart deliberately. Collapsing them into one number before reasoning is
 * what makes a grounded explanation impossible later — GC7 cannot say "keeps
 * the tension you liked in X, but drops the sentiment that tends to lose you"
 * unless something recorded which fact produced which instruction.
 *
 * ── PRESERVE / IMPROVE / AVOID ────────────────────────────────────────────
 *   PRESERVE  the anchor expresses it AND the user's confident taste agrees.
 *             Two facts, never one — an anchor merely HAVING a trait is not a
 *             reason to keep it.
 *   IMPROVE   evidence supports a direction: the user's confident taste points
 *             elsewhere, or the request explicitly asked for movement.
 *             "Improve" always means improve FOR THIS USER; there is no
 *             objectively better value of an axis.
 *   AVOID     the anchor is strong on an axis the user confidently rejects.
 *             Grounded negative evidence only — never inferred from possession.
 *
 * ── SILENCE BEATS FAKE CERTAINTY ──────────────────────────────────────────
 * An axis the anchors do not express is not reasoned about. A user with no
 * confident direction does not get one invented. Anchors that contradict each
 * other with no confident user preference to break the tie produce NO
 * instruction rather than a midpoint — averaging 10 and 90 into 50 is not
 * understanding, it is the absence of it wearing a number.
 *
 * PURE. No I/O, no model call. Deterministically derived from anchor
 * fingerprints + relation + explicit modifiers + Taste DNA, which is why no
 * second request-path LLM call was added: the reasoning does not need one, and
 * an LLM sentence is never ranking evidence by itself.
 */

import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import { effectiveTaste } from '@/lib/preference/explain';
import { MIN_RANK_CONF } from '@/lib/preference/rank';
import type { DnaState } from '@/lib/preference/types';
import type { CriticRelation, ResolvedAnchor } from './objective';

/** Where a claim came from. Three classes, never merged. */
export type Provenance = 'anchor' | 'user_dna' | 'request';

export interface TraitInstruction {
  /** Canonical axis key — the same vocabulary the ranker and cache use. */
  axis: string;
  kind: 'preserve' | 'improve' | 'avoid';
  /** Desired position on the axis, 0..100. */
  target: number;
  /** 0..1 — how hard to push. */
  strength: number;
  /** Which facts produced this instruction. */
  evidence: Provenance[];
}

export interface CriticPlan {
  instructions: TraitInstruction[];
  authority: number;
  relation: CriticRelation;
}

/** An explicit shift the user asked for, per axis. */
export type Modifiers = Record<string, 'higher' | 'lower'>;

export interface PlanInput {
  relation: CriticRelation;
  anchors: readonly ResolvedAnchor[];
  dna: DnaState;
  modifiers: Modifiers;
  authority: number;
}

/** Far enough from neutral that the anchors are actually asserting something. */
const ANCHOR_EXPRESSED = 15;
/** Anchors this far apart on an axis are contradicting, not agreeing. */
const ANCHOR_CONFLICT = 35;
/** A request is a stronger directional claim than an inference. */
const REQUEST_STRENGTH = 0.95;

interface AxisReading {
  mean: number;
  spread: number;
  expressed: boolean;
}

function readAnchors(anchors: readonly ResolvedAnchor[], axis: string): AxisReading | null {
  const vals: number[] = [];
  for (const a of anchors) {
    const v = (a.dims as Record<string, number> | undefined)?.[axis];
    if (typeof v === 'number') vals.push(v);
  }
  if (vals.length === 0) return null;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const spread = Math.max(...vals) - Math.min(...vals);
  return { mean, spread, expressed: Math.abs(mean - 50) >= ANCHOR_EXPRESSED };
}

export function buildPlan(input: PlanInput): CriticPlan {
  const { relation, anchors, dna, modifiers, authority } = input;
  const out: TraitInstruction[] = [];
  if (anchors.length === 0) return { instructions: out, authority, relation };

  const taste = effectiveTaste(dna);

  for (const axis of DIMENSION_KEYS) {
    const anchor = readAnchors(anchors, axis);
    const modifier = modifiers[axis];
    const belief = taste[axis];
    /* CONFIDENT means the ranker itself would act on it. Reusing
       `MIN_RANK_CONF` rather than inventing a critic-only threshold keeps one
       answer to "do we know this about the user". */
    const confident =
      belief != null && belief.confidence >= MIN_RANK_CONF && belief.polarity !== 0;

    // ── REQUEST FACT — the strongest directional claim available ──────────
    if (modifier) {
      const from = anchor?.mean ?? 50;
      out.push({
        axis,
        kind: 'improve',
        target: modifier === 'higher' ? Math.min(100, from + 30) : Math.max(0, from - 30),
        strength: REQUEST_STRENGTH,
        evidence: anchor ? ['request', 'anchor'] : ['request'],
      });
      continue;
    }

    if (!anchor) continue; // the anchors say nothing about this axis

    /* CONTRADICTORY ANCHORS. "X meets Y" where X is 10 and Y is 90 does not
       mean 50. With a confident user preference we can pick a side; without
       one the axis is genuinely unresolved and the plan stays silent. */
    if (anchor.spread >= ANCHOR_CONFLICT) {
      if (!confident) continue;
      out.push({
        axis,
        kind: 'improve',
        target: belief!.pref,
        strength: Math.min(1, belief!.confidence),
        evidence: ['anchor', 'user_dna'],
      });
      continue;
    }

    if (!anchor.expressed) continue; // nothing asserted, nothing to reason about

    const anchorHigh = anchor.mean > 50;

    if (confident) {
      const userHigh = belief!.polarity === 1;
      if (userHigh === anchorHigh) {
        /* AGREEMENT — the anchor's quality is one this user actually wants.
           This is the case undirected distance destroys: under `better_than`
           it is precisely what must be KEPT. */
        out.push({
          axis,
          kind: 'preserve',
          target: anchor.mean,
          strength: Math.min(1, belief!.confidence),
          evidence: ['anchor', 'user_dna'],
        });
      } else {
        /* CONFLICT — the anchor leans one way and the user's mature taste the
           other. `avoid` when the anchor is strong on something they reject;
           otherwise a directional improvement toward them. Either way the
           target follows the USER: there is no objectively better value, and a
           plan that decided "lighter is better" for somebody who prefers dark
           would be inference overruling explicit evidence. */
        const strongAnchor = Math.abs(anchor.mean - 50) >= 25;
        out.push({
          axis,
          kind: strongAnchor ? 'avoid' : 'improve',
          target: belief!.pref,
          strength: Math.min(1, belief!.confidence),
          evidence: ['anchor', 'user_dna'],
        });
      }
      continue;
    }

    /* NO CONFIDENT USER DIRECTION. What the relation alone licenses:
       resemblance relations may keep the anchor's shape, because similarity is
       genuinely the goal. `better_than` may NOT — "the anchor has it" is one
       fact, and preserving on one fact is exactly the trap this gate closes. */
    if (relation === 'like' || relation === 'like_but' || relation === 'blend') {
      out.push({
        axis,
        kind: 'preserve',
        target: anchor.mean,
        strength: 0.5,
        evidence: ['anchor'],
      });
    }
  }

  return { instructions: out, authority, relation };
}
