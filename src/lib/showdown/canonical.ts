/**
 * SHOWDOWN -> THE CANONICAL TASTE DNA, and nowhere else.
 *
 * Showdown's own `TraitProfile` is a local calibration state. The product's
 * permanent identity is the append-only `preference_events` log folded by
 * `src/lib/preference/engine.ts`, and this module maps one onto the other. It
 * deliberately does NOT introduce a second permanent store: a second profile is
 * a second thing to reconcile, a second thing to migrate on sign-in, and a
 * second answer to "what does this person like".
 *
 * WHY AN ATTRACTION GRADE AND NOT AN EXPERIENCE ONE. A head-to-head is a
 * PRE-WATCH statement — "I would rather watch this" — which is exactly what the
 * ATTRACTION channel means. Filing it as EXPERIENCE would claim the person had
 * seen and judged the film, which is a different and much stronger assertion
 * than they made, and would outrank the grades of titles they actually watched.
 *
 * HOW ATTRIBUTION SURVIVES THE CROSSING. The canonical engine weights an event
 * by its grade (`signals.ts`), so the natural home for "how much should this
 * count" is WHICH grade is chosen — not a new parallel weighting system that the
 * engine would have to learn about:
 *
 *   must_watch (1.1)       a clean, single-axis comparison — a Twist
 *   interested (0.8)       an ordinary well-attributed pick
 *   maybe_interested (0.3) a confounded pick across many axes
 *
 * That is the same ordering `attribution.ts` computes, expressed in the units
 * the engine already speaks. A four-axis guess cannot masquerade as a
 * certainty, because it lands two rungs lower on a ladder the engine already
 * understands.
 *
 * PURE. The write itself lives in `src/lib/actions/showdown.ts`.
 */

import type { AttractionGrade, PreferenceEvent } from '@/lib/preference/types';
import { TWIST_ATTRIBUTION_MIN } from './attribution';
import { GUT_CALL } from './reasons';
import type { ShowdownDecision } from './session';

/** Below this, a pick is too confounded to assert more than mild interest. */
export const CONFOUNDED_ATTRIBUTION_MAX = 0.45;

/** Where a pick lands on the canonical attraction ladder, by attribution. */
export function gradeForAttribution(attribution: number): AttractionGrade {
  if (attribution >= TWIST_ATTRIBUTION_MIN) return 'must_watch';
  if (attribution >= CONFOUNDED_ATTRIBUTION_MAX) return 'interested';
  return 'maybe_interested';
}

export interface CanonicalTitleRef {
  /** Stable engine key, e.g. "movie:807". */
  titleId: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

/**
 * The canonical events one Showdown decision produces.
 *
 * A PICK yields ONE positive event about the winner. It deliberately does not
 * also write a negative event about the loser: losing a head-to-head is not
 * dislike — the loser may be a film they love slightly less — and manufacturing
 * a negative from a comparative is the same class of error as treating "haven't
 * seen" as a rejection.
 *
 * NEITHER yields a negative event about BOTH, because refusing both is the one
 * answer that genuinely speaks against what is on screen.
 *
 * HAVEN'T SEEN yields nothing at all.
 */
/**
 * The parts of a decision this crossing actually needs.
 *
 * Narrower than `ShowdownDecision` on purpose: the planner's `testing` and
 * `gain` are provenance for the SESSION and say nothing to the canonical
 * engine, so requiring them would force every caller — including a server
 * action reconstructing a decision from a validated payload — to invent or cast
 * them. A cast there would have been a lie the compiler correctly refused.
 */
export type CanonicalDecision = Pick<
  ShowdownDecision,
  'leftId' | 'rightId' | 'verdict' | 'at' | 'responseMs' | 'intensity' | 'reason'
>;

/**
 * BEING TOLD BEATS INFERRING.
 *
 * `gradeForAttribution` is a proxy: it reads "how cleanly did this pair isolate
 * an axis" and guesses an appetite from it. That is the best available answer
 * when nobody was asked — and it is only ever a guess, because a surgically
 * clean matchup can still be a choice between two films someone would never
 * watch. When the follow-up DID ask, the stated answer replaces the proxy
 * outright rather than being blended with it: an average of a fact and an
 * inference is worse than the fact.
 *
 * A STATED REASON MOVES THE GRADE BY EXACTLY ONE RUNG, AND NEVER TO THE TOP.
 * `maybe_interested` is the CONFOUNDED rung — it exists to say "several things
 * could explain this tap". Being told which one removes precisely that doubt,
 * so the penalty it exists to apply no longer applies. What a reason does NOT
 * do is reach `must_watch`: naming the axis says why one film beat the other,
 * not how much the winner is wanted, and promoting a well-explained pick to the
 * top rung would repeat in the canonical layer exactly the confusion —
 * comparative read as absolute — that the evidence split exists to end. Only
 * the player saying so gets there.
 */
export function gradeForDecision(
  decision: Pick<CanonicalDecision, 'intensity' | 'reason'>,
  attribution: number,
): AttractionGrade {
  switch (decision.intensity) {
    case 'must':
      return 'must_watch';
    case 'keen':
      return 'interested';
    case 'relative':
      // "It was just the better of the two" — the player has explicitly declined
      // to claim more than the comparison itself, so neither may we.
      return 'maybe_interested';
    default:
      break;
  }
  const inferred = gradeForAttribution(attribution);
  // `GUT_CALL` is a real answer — "no single axis" — and it must not clear the
  // confounding it just confirmed.
  if (decision.reason && decision.reason !== GUT_CALL.id && inferred === 'maybe_interested') {
    return 'interested';
  }
  return inferred;
}

export function decisionToEvents(
  decision: CanonicalDecision,
  refs: { left: CanonicalTitleRef | null; right: CanonicalTitleRef | null },
  attribution: number,
): PreferenceEvent[] {
  const at = decision.at;
  const base = {
    at,
    source: 'showdown' as const,
    dwellMs: decision.responseMs,
  };

  if (decision.verdict === 'neither') {
    const out: PreferenceEvent[] = [];
    for (const [side, ref] of [['left', refs.left], ['right', refs.right]] as const) {
      if (!ref) continue;
      out.push({
        ...base,
        id: `${decision.leftId}-${decision.rightId}-${at}-neither-${side}`,
        titleId: ref.titleId,
        action: 'unseen_not_interested',
        attractionGrade: 'not_interested',
      });
    }
    return out;
  }

  /* BOTH IS TWO POSITIVE EVENTS, and it needs its own branch rather than
     falling through the pick logic below. It used to: `verdict === 'left' ?
     left : right` quietly filed "I want both of these" as a vote for whichever
     poster happened to be on the right, silently discarding half the answer and
     inventing a preference between two titles the player had just said they
     felt the same about. The verdict existed in the engine before it existed on
     screen, which is how a defect stays invisible — adding the control is what
     would have shipped it. */
  if (decision.verdict === 'both') {
    const out: PreferenceEvent[] = [];
    for (const [side, ref] of [['left', refs.left], ['right', refs.right]] as const) {
      if (!ref) continue;
      out.push({
        ...base,
        id: `${decision.leftId}-${decision.rightId}-${at}-both-${side}`,
        titleId: ref.titleId,
        action: 'unseen_interested',
        attractionGrade: gradeForDecision(decision, attribution),
      });
    }
    return out;
  }

  const ref = decision.verdict === 'left' ? refs.left : refs.right;
  if (!ref) return [];
  return [
    {
      ...base,
      id: `${decision.leftId}-${decision.rightId}-${at}-${decision.verdict}`,
      titleId: ref.titleId,
      action: 'unseen_interested',
      attractionGrade: gradeForDecision(decision, attribution),
    },
  ];
}

/**
 * The payload `recordShowdownSession` validates, built from a finished session.
 *
 * ATTRIBUTION IS COMPUTED HERE RATHER THAN TRUSTED FROM THE PLANNER'S RECORD,
 * because `Matchup.attribution` is transient — it lives on the dealt matchup and
 * not on the decision, so reconstructing it from the recorded pair is the only
 * way a resumed or re-serialised session can be priced at all. It is the same
 * function over the same two titles, so the number is identical.
 */
export interface CanonicalPayloadDecision extends CanonicalDecision {
  attribution: number;
}

export function sessionPayload(
  decisions: readonly ShowdownDecision[],
  attributionFor: (decision: ShowdownDecision) => number,
): CanonicalPayloadDecision[] {
  return decisions.map((d) => ({
    leftId: d.leftId,
    rightId: d.rightId,
    verdict: d.verdict,
    at: d.at,
    responseMs: d.responseMs,
    attribution: attributionFor(d),
    ...(d.reason !== undefined ? { reason: d.reason } : {}),
    ...(d.intensity !== undefined ? { intensity: d.intensity } : {}),
  }));
}

/**
 * Every canonical event a finished `dna`-mode session should record.
 *
 * Returns `[]` for a `tonight` session — the caller should never reach here
 * with one, and returning empty rather than throwing means a mistaken call
 * writes NOTHING rather than writing the wrong thing. Failing safe matters more
 * than failing loudly when the failure mode is "someone's identity was
 * overwritten by a Tuesday mood".
 */
export function sessionToEvents(
  decisions: readonly CanonicalDecision[],
  mode: 'dna' | 'tonight',
  resolve: (titleId: string) => CanonicalTitleRef | null,
  attributionFor: (decision: CanonicalDecision) => number,
): PreferenceEvent[] {
  if (mode !== 'dna') return [];
  const out: PreferenceEvent[] = [];
  for (const d of decisions) {
    out.push(
      ...decisionToEvents(
        d,
        { left: resolve(d.leftId), right: resolve(d.rightId) },
        attributionFor(d),
      ),
    );
  }
  return out;
}
