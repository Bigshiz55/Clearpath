import {
  reconcile,
  isDurable,
  type Adjudication,
  type CompiledSubjectFact,
  type FactCentrality,
} from './compile';
import {
  evaluateSubjectCentrality,
  type SubjectRequirement,
  type CandidateEvidence,
  type SubjectCentrality,
} from '@/lib/nlu/semanticEligibility';

/**
 * The Knowledge-Layer decision for ONE ambiguous-band candidate, factored out of
 * the finder so it is directly unit-testable and legible (observability):
 *
 *   1. If a DURABLE compiled fact exists (current compiler version, confident
 *      enough), reuse it — NO model call, works fully offline. decidedVia
 *      'knowledge'.
 *   2. Otherwise adjudicate once. If the adjudicator answers, reconcile its
 *      verdict with the deterministic evidence into a durable fact to persist
 *      (compile-on-demand). decidedVia 'adjudicator'.
 *   3. If the adjudicator is unavailable (no key ⇒ null), the verdict is null
 *      and the caller rejects on uncertainty exactly as before this layer.
 *
 * Pure except for the injected `adjudicate` call — the store read (`known`) is
 * done by the caller in one batch, and the returned `persist` fact is written by
 * the caller, so this function itself performs no I/O.
 */

export type BandVerdict = {
  centrality: SubjectCentrality | 'UNKNOWN';
  confidence: number;
  reason?: string;
};

export interface StoredFactLike {
  centrality: FactCentrality;
  confidence: number;
  disputed: boolean;
  compilerVersion: string;
}

export interface BandResolution {
  verdict: BandVerdict | null;
  decidedVia: 'knowledge' | 'adjudicator';
  /** A newly compiled fact to persist (compile-on-demand), or null when reused. */
  persist: CompiledSubjectFact | null;
}

/** Map a stored durable fact back into the finder's verdict shape. */
function factToVerdict(known: StoredFactLike): BandVerdict {
  return {
    centrality: known.centrality === 'ABSENT' ? 'UNSUPPORTED' : known.centrality,
    confidence: known.confidence,
    reason: `compiled ${known.centrality.toLowerCase()} (confidence ${Math.round(
      known.confidence * 100,
    )}%${known.disputed ? ', disputed' : ''})`,
  };
}

export async function resolveAmbiguousSubject(
  req: SubjectRequirement,
  ev: CandidateEvidence,
  known: StoredFactLike | null,
  adjudicate: (req: SubjectRequirement, ev: CandidateEvidence) => Promise<Adjudication | null>,
): Promise<BandResolution> {
  if (known && isDurable(known)) {
    return { verdict: factToVerdict(known), decidedVia: 'knowledge', persist: null };
  }
  const adj = await adjudicate(req, ev).catch(() => null);
  if (!adj) return { verdict: null, decidedVia: 'adjudicator', persist: null };
  const det = evaluateSubjectCentrality(req, ev);
  const fact = reconcile(req.canonical, det, adj);
  return { verdict: { centrality: adj.centrality, confidence: adj.confidence, reason: adj.reason }, decidedVia: 'adjudicator', persist: fact };
}
