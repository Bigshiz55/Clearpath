import { DecisionRun, edgesBy, hardRequirements } from './types';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * GRAPH INVARIANTS — machine-testable guardrails over decision runs.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Each production failure becomes a graph regression: "a boxing movie →
 * GoodFellas" is not a regex to re-test but an INVARIANT that must hold over
 * every captured run — the required subject stays connected from input to
 * final candidates, request-only language writes no durable taste, a
 * rejected candidate never returns. These checks are pure and total: they
 * run in unit tests over runs produced by the REAL routes, and they can run
 * over persisted production runs in the founder inspector.
 *
 * A violation names itself. An empty list is the pass.
 */

export interface Violation {
  invariant: string;
  message: string;
}

/**
 * INV-1 — A HARD REQUIRED CONSTRAINT MUST EITHER BE SATISFIED BY EVERY
 * RETURNED RESULT, OR PRODUCE AN EXPLICIT NO-RESULT/CLARIFY STATE. It may
 * never silently disappear. (Satisfaction is per-candidate: each returned
 * candidate carries a `satisfies` edge for the requirement's object.)
 */
export function inv1RequiredConstraintSurvives(run: DecisionRun): Violation[] {
  const out: Violation[] = [];
  const required = hardRequirements(run);
  const returned = edgesBy(run, 'returned');
  if (required.length === 0) return out;
  if (returned.length === 0) {
    // No results is legal ONLY when the run says so explicitly — or when the
    // run ROUTED: a routing run returns nothing by design, the destination
    // owns the results, and the routed_to edge (whose URL carries the
    // requirement — proven browser-side) is its explicit terminal state.
    // Before Slice A the airing route dodged this check by recording NO
    // requires_subject edge at all, which is worse than either outcome: the
    // obligation was invisible, not discharged.
    const explicit = edgesBy(run, 'classified_as').some((e) =>
      ['clarify', 'no_results'].includes(e.object),
    ) || run.intent.kind === 'clarify' || run.intent.kind === 'no_results'
      || edgesBy(run, 'routed_to').length > 0;
    if (!explicit) {
      out.push({
        invariant: 'INV-1',
        message: 'hard requirements exist, zero results returned, and the run does not declare an explicit empty/clarify state',
      });
    }
    return out;
  }
  /* EACH REQUIREMENT KIND HAS ITS OWN PROOF SHAPE — checking a shape that
     does not exist would claim evidence we don't hold (the sin the graph
     exists to end). A SUBJECT is proven per candidate by the finder's own
     semantic verdict (a `satisfies` edge). MEDIA is proven by the
     candidate's canonical identity — the media type is IN the node ref. A
     COUNT is a property of the result SET: returning fewer is an honest
     shortfall, returning more is the violation. Genre/runtime obligations
     are recorded on the request today and gain per-candidate fact edges in
     the content-evidence phase; until then INV-1 makes no claim about them
     rather than a false one. */
  for (const req of required) {
    if (req.predicate === 'requires_subject') {
      for (const r of returned) {
        const candidate = r.object;
        const satisfied = run.edges.some(
          (e) => e.predicate === 'satisfies' && e.subject === candidate && e.object === req.object,
        );
        if (!satisfied) {
          out.push({
            invariant: 'INV-1',
            message: `returned candidate ${candidate} carries no satisfies edge for required subject "${req.object}"`,
          });
        }
      }
    } else if (req.predicate === 'requires_media') {
      for (const r of returned) {
        if (!String(r.object).startsWith(`candidate:${req.object}:`)) {
          out.push({
            invariant: 'INV-1',
            message: `returned candidate ${r.object} is not the required medium "${req.object}"`,
          });
        }
      }
    } else if (req.predicate === 'requires_count') {
      const n = Number(req.object);
      if (Number.isFinite(n) && returned.length > n) {
        out.push({
          invariant: 'INV-1',
          message: `requested ${n} result(s), ${returned.length} returned`,
        });
      }
    }
  }
  return out;
}

/**
 * INV-2 — WRITES NEVER DERIVE FROM REQUEST-ONLY LANGUAGE. The "a boxing
 * movie" → "Locked in: loves a boxing movie" defect, as a law. A write
 * inside a request_only run is lawful ONLY when it carries the durable
 * clause text that justified it ("I love slow burns… give me a thriller."
 * writes its first half); a pure request may write nothing at all.
 */
export function inv2RequestOnlyNeverDurable(run: DecisionRun): Violation[] {
  if (run.intent.persistence !== 'request_only') return [];
  const writes = [...edgesBy(run, 'wrote_taste'), ...edgesBy(run, 'seeded_title')];
  return writes
    .filter((w) => String(w.detail?.durableEvidence ?? '').trim() === '')
    .map((w) => ({
      invariant: 'INV-2',
      message: `request_only run wrote durable evidence with no durable clause to justify it: ${w.predicate} ${w.object}`,
    }));
}

/** INV-6 — A FINAL RECOMMENDATION MUST RETAIN A PATH TO THE RAW REQUEST. */
export function inv6RawRequestRetained(run: DecisionRun): Violation[] {
  if (run.rawText.trim().length > 0) return [];
  return [{ invariant: 'INV-6', message: 'the run lost the raw utterance' }];
}

/** INV-8 — NO RANKING ADJUSTMENT MAY REINTRODUCE AN INELIGIBLE CANDIDATE. */
export function inv8NoRejectedReturned(run: DecisionRun): Violation[] {
  const rejected = new Set(edgesBy(run, 'rejected').map((e) => e.subject));
  return edgesBy(run, 'returned')
    .filter((e) => rejected.has(e.object))
    .map((e) => ({
      invariant: 'INV-8',
      message: `rejected candidate ${e.object} was returned anyway`,
    }));
}

/**
 * INV-10 — UNKNOWN EVIDENCE MAY NOT BE RENDERED AS CONFIRMED FACT. Any edge
 * whose detail declares `state: 'unknown'` must not simultaneously claim a
 * confirming provenance confidence of 1.
 */
export function inv10UnknownNotConfirmed(run: DecisionRun): Violation[] {
  return run.edges
    .filter((e) => (e.detail?.state === 'unknown') && e.provenance?.confidence === 1)
    .map((e) => ({
      invariant: 'INV-10',
      message: `edge ${e.subject} ${e.predicate} ${e.object} is unknown yet fully confident`,
    }));
}

/**
 * INV-4 — AVAILABILITY CLAIMS CARRY SOURCE + TIMESTAMP. An `available_on` /
 * `airs_on` edge asserts a fact about the outside world that ages; asserting
 * it with no source or no "as of" is how a stale offer gets presented as a
 * current fact. The builders enforce the same rule constructively (no
 * observation time → no claim emitted); this catches any emitter that
 * forgets.
 */
export function inv4AvailabilityClaimsSourced(run: DecisionRun): Violation[] {
  return run.edges
    .filter((e) => e.predicate === 'available_on' || e.predicate === 'airs_on')
    .filter((e) => !e.provenance?.source || !e.provenance?.observedAt)
    .map((e) => ({
      invariant: 'INV-4',
      message: `${e.predicate} ${e.object} claimed for ${e.subject} without source+observedAt provenance`,
    }));
}

/**
 * INV-9 — GROUP EVIDENCE NEVER LEAKS INTO DURABLE INDIVIDUAL TASTE. A court
 * verdict is what the ROOM decided under tonight's constraints; a docket
 * verdict is a one-night ranking; a subscription snapshot is arithmetic over
 * a window. None of them is evidence about who any individual user IS, and a
 * write edge inside one would launder a group outcome into a personal
 * belief. The SQL asserted this in comments; the modules honor it by
 * inspection; this makes it a law over every recorded run.
 */
const GROUP_EPHEMERAL_ENTRY_POINTS = new Set(['court', 'verdict', 'subscriptions']);

export function inv9GroupNeverDurable(run: DecisionRun): Violation[] {
  if (!GROUP_EPHEMERAL_ENTRY_POINTS.has(run.entryPoint)) return [];
  return [...edgesBy(run, 'wrote_taste'), ...edgesBy(run, 'seeded_title')].map((w) => ({
    invariant: 'INV-9',
    message: `${run.entryPoint} run wrote durable individual taste: ${w.predicate} ${w.object}`,
  }));
}

/** The whole suite over one run. Empty result = the run is lawful. */
export function checkRunInvariants(run: DecisionRun): Violation[] {
  return [
    ...inv1RequiredConstraintSurvives(run),
    ...inv2RequestOnlyNeverDurable(run),
    ...inv4AvailabilityClaimsSourced(run),
    ...inv6RawRequestRetained(run),
    ...inv8NoRejectedReturned(run),
    ...inv9GroupNeverDurable(run),
    ...inv10UnknownNotConfirmed(run),
  ];
}
