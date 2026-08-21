/**
 * WATCHVERDICT KNOWLEDGE COMPILER (pure core).
 *
 * Turns raw title evidence into a DURABLE, versioned fact: how central a given
 * subject is to a title, with confidence, provenance and a contradiction flag.
 * The search pipeline compiles this ONCE and reads it back, instead of
 * re-inferring the same stable fact on every request.
 *
 * DESIGN. This module is I/O-free and deterministic (except where an optional
 * semantic adjudication is passed in). It REUSES the existing, unit-tested
 * `evaluateSubjectCentrality` as its deterministic evidence tier — the same
 * logic the live finder already trusts — and then applies explicit
 * reconciliation rules so that ONE model inference can never become permanent,
 * unqualified truth:
 *
 *   • A weak keyword-tag-only signal never establishes CENTRAL (caps at MATERIAL).
 *   • Independent corroborating sources (title + tags + overview) raise confidence.
 *   • A semantic adjudication only ARBITRATES the ambiguous MATERIAL band; where
 *     it contradicts a confident deterministic verdict the fact is marked
 *     DISPUTED and its confidence is lowered, never silently overwritten.
 *   • Insufficient evidence stays UNKNOWN — the compiler never guesses.
 *
 * Subject-agnostic: the subject is passed in as a `SubjectRequirement` (canonical
 * slug + lexemes). Boxing, submarines, courtroom drama, chess and pigeon racing
 * all flow through the identical path — there is no per-topic table here.
 */

import {
  evaluateSubjectCentrality,
  type SubjectRequirement,
  type CandidateEvidence,
  type EligibilityVerdict,
  type SubjectCentrality,
} from '@/lib/nlu/semanticEligibility';

/**
 * Bumps whenever the compiler's evidence rules or the underlying evaluator's
 * contract change, so a stored fact from an older compiler is treated as stale
 * (recompiled) rather than trusted forever. Include the evaluator's own version
 * so a change there also invalidates compiled facts.
 */
export const COMPILER_VERSION = 'kl-v1';

/** The durable centrality classes. Adds ABSENT/UNKNOWN to the finder's scale so
 *  "we looked and it is provably not about this" and "we cannot tell" are
 *  distinct, storable facts — not collapsed into a single silence. */
export type FactCentrality = 'CENTRAL' | 'MATERIAL' | 'INCIDENTAL' | 'ABSENT' | 'UNKNOWN';

/** How the final verdict was reached — provenance, never hidden. */
export type DecidedBy = 'deterministic' | 'adjudicator' | 'metadata' | 'manual';

/** A semantic adjudication result (from the bounded LLM adjudicator or a stub). */
export interface Adjudication {
  centrality: SubjectCentrality | 'UNKNOWN';
  confidence: number; // 0..1
  reason?: string;
}

/** A compiled, durable fact about one (title, subject) pair. */
export interface CompiledSubjectFact {
  subject: string; // canonical slug
  centrality: FactCentrality;
  confidence: number; // 0..1
  /** Count of INDEPENDENT corroborating evidence sources (0..3). */
  sourceCount: number;
  disputed: boolean;
  decidedBy: DecidedBy;
  evidence: {
    supporting: string[];
    contrary: string[];
    /** Which raw signals were present: 'title' | 'keyword' | 'overview' | 'adjudicator'. */
    sources: string[];
  };
  compilerVersion: string;
}

/** Map the finder's 4-class deterministic scale onto the durable 5-class scale. */
function mapDeterministic(v: EligibilityVerdict): FactCentrality {
  // The evaluator flagged the verdict UNVERIFIABLE (a bare keyword tag with no
  // descriptive overview to corroborate it). That is not a MATERIAL fact — it is
  // an absence of evidence. Preserve it as UNKNOWN so the compiler never turns a
  // crowd-sourced tag into a durable claim.
  if (v.status === 'UNKNOWN') return 'UNKNOWN';
  switch (v.centrality) {
    case 'CENTRAL':
      return 'CENTRAL';
    case 'MATERIAL':
      return 'MATERIAL';
    case 'INCIDENTAL':
      return 'INCIDENTAL';
    case 'UNSUPPORTED':
    default:
      // UNSUPPORTED with a verifiable verdict (an overview existed and still
      // described nothing on-subject) is a real ABSENT fact. The unverifiable
      // case was already mapped to UNKNOWN by the status guard above.
      return 'ABSENT';
  }
}

/** The independent evidence sources present in a deterministic verdict. */
function sourcesOf(v: EligibilityVerdict): string[] {
  const s: string[] = [];
  if (v.signals.titleHit) s.push('title');
  if (v.signals.keywordExactCount >= 1) s.push('keyword');
  // A non-setting overline mention is an independent, corroborating source.
  if (v.signals.mentionSentences >= 1 && !v.signals.settingOnly) s.push('overview');
  return s;
}

/**
 * Reconcile a deterministic verdict with an optional semantic adjudication into
 * one durable fact. This is where the "no single inference becomes permanent
 * truth" rules live, and it is exhaustively unit-tested.
 */
export function reconcile(
  subject: string,
  det: EligibilityVerdict,
  adj?: Adjudication | null,
): CompiledSubjectFact {
  const sources = sourcesOf(det);
  const sourceCount = sources.length;
  let centrality = mapDeterministic(det);
  let confidence = det.confidence / 100;
  let decidedBy: DecidedBy = 'deterministic';
  let disputed = false;

  // RULE 1 — weak keyword-only evidence never establishes CENTRAL. If the ONLY
  // source is a keyword tag (no title hit, no descriptive overview), the strongest
  // durable claim is MATERIAL. A crowd-sourced tag is recall, not proof.
  const keywordOnly = sourceCount === 1 && sources[0] === 'keyword';
  if (keywordOnly && centrality === 'CENTRAL') {
    centrality = 'MATERIAL';
    confidence = Math.min(confidence, 0.5);
  }

  // RULE 2 — independent corroboration raises confidence. Two or three
  // independent sources agreeing is stronger than any single one.
  if (sourceCount >= 2 && (centrality === 'CENTRAL' || centrality === 'MATERIAL')) {
    confidence = Math.min(1, confidence + 0.05 * (sourceCount - 1));
  }

  // RULE 3 — a semantic adjudication ARBITRATES the ambiguous band and refutes
  // over-eager deterministic verdicts.
  if (adj) {
    const adjClass: FactCentrality = adj.centrality === 'UNSUPPORTED' ? 'ABSENT' : adj.centrality;
    const detCentral = centrality === 'CENTRAL' || centrality === 'MATERIAL';
    const adjCentral = adjClass === 'CENTRAL' || adjClass === 'MATERIAL';

    if (det.centrality === 'MATERIAL') {
      // The deterministic evaluator explicitly could not settle this band — adopt
      // the adjudication wholesale.
      centrality = adjClass;
      confidence = adj.confidence;
      decidedBy = 'adjudicator';
      if (!sources.includes('adjudicator')) sources.push('adjudicator');
    } else if (detCentral !== adjCentral) {
      // Confident deterministic verdict CONTRADICTS the adjudication (e.g. the
      // title carries the word but the model judges it incidental). Preserve the
      // disagreement: keep the higher-evidence deterministic class but flag it
      // disputed and lower confidence — never silently flip, never hide it.
      disputed = true;
      confidence = Math.min(confidence, 0.55);
      if (!sources.includes('adjudicator')) sources.push('adjudicator');
    }
    // Agreement leaves the deterministic verdict intact (already high-confidence).
  }

  // RULE 4 — insufficient evidence stays UNKNOWN. Never manufacture certainty.
  if (centrality === 'UNKNOWN') {
    confidence = Math.min(confidence, 0.4);
  }

  return {
    subject,
    centrality,
    confidence: Math.max(0, Math.min(1, Number(confidence.toFixed(3)))),
    sourceCount,
    disputed,
    decidedBy,
    evidence: {
      supporting: det.supportingEvidence,
      contrary: det.contraryEvidence,
      sources,
    },
    compilerVersion: COMPILER_VERSION,
  };
}

/**
 * Compile a single (title, subject) fact from raw evidence. `adjudicate` is an
 * OPTIONAL async hook used ONLY for the ambiguous MATERIAL band — the confident
 * bands never spend it. Returns the fact plus whether an adjudication was needed
 * (so callers can budget/telemetry the expensive path).
 */
export async function compileSubjectFact(
  req: SubjectRequirement,
  ev: CandidateEvidence,
  adjudicate?: (req: SubjectRequirement, ev: CandidateEvidence) => Promise<Adjudication | null>,
): Promise<{ fact: CompiledSubjectFact; adjudicated: boolean }> {
  const det = evaluateSubjectCentrality(req, ev);
  // Only the genuinely ambiguous band is worth a model call.
  if (det.ambiguous && adjudicate) {
    const adj = await adjudicate(req, ev).catch(() => null);
    return { fact: reconcile(req.canonical, det, adj), adjudicated: adj != null };
  }
  return { fact: reconcile(req.canonical, det, null), adjudicated: false };
}

/** True when a stored fact is strong enough to short-circuit re-adjudication. */
export function isDurable(fact: { compilerVersion: string; confidence: number }): boolean {
  return fact.compilerVersion === COMPILER_VERSION && fact.confidence >= 0.6;
}
