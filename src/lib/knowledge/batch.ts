import {
  compileSubjectFact,
  COMPILER_VERSION,
  type Adjudication,
  type CompiledSubjectFact,
} from './compile';
import { deriveHeaderTraits } from './headerTraits';
import {
  evaluateSubjectCentrality,
  type SubjectRequirement,
  type CandidateEvidence,
} from '@/lib/nlu/semanticEligibility';

/**
 * A COMPILER, NOT JUST A TABLE.
 *
 * `compileTitle` runs the evidence pipeline for one title across a set of
 * subjects, producing durable facts plus a header (tone/setting/anti-evidence).
 * It is idempotent (same evidence + same COMPILER_VERSION ⇒ same output),
 * cheap-first (deterministic evidence settles the confident bands with no model
 * call), and uses the optional adjudicator ONLY for the ambiguous band. This is
 * the batch/ingest counterpart to the request-path compile-on-demand in the
 * finder — same core, so the two can never disagree.
 *
 * It is deliberately I/O-free: callers supply the evidence (from TMDB, already
 * hydrated for a title) and persist the returned facts via the store. That keeps
 * this unit-testable and lets it run in a cron, at ingest, or on a founder
 * rebuild without embedding a data source.
 */

export interface CompiledTitle {
  facts: CompiledSubjectFact[];
  header: {
    status: 'compiled' | 'insufficient';
    /** Evidence-backed tone concepts (from the title's own evidence). */
    tone: string[];
    /** Evidence-backed setting concepts (from the title's own evidence). */
    setting: string[];
    /** Subjects the title is provably NOT about (ABSENT with real evidence). */
    antiEvidence: Array<{ subject: string; reason: string }>;
    evidenceSources: string[];
  };
  /** How many subjects needed a model call (for cost/telemetry). */
  adjudicatedCount: number;
}

export async function compileTitle(
  ev: CandidateEvidence,
  subjects: SubjectRequirement[],
  adjudicate?: (req: SubjectRequirement, ev: CandidateEvidence) => Promise<Adjudication | null>,
): Promise<CompiledTitle> {
  const facts: CompiledSubjectFact[] = [];
  const antiEvidence: Array<{ subject: string; reason: string }> = [];
  const allSources = new Set<string>();
  let adjudicatedCount = 0;

  for (const req of subjects) {
    const { fact, adjudicated } = await compileSubjectFact(req, ev, adjudicate);
    if (adjudicated) adjudicatedCount++;
    facts.push(fact);
    for (const s of fact.evidence.sources) allSources.add(s);
    if (fact.centrality === 'ABSENT') {
      antiEvidence.push({ subject: req.canonical, reason: fact.evidence.contrary[0] ?? `no evidence connects this title to ${req.label}` });
    }
  }

  // Evidence-backed tone/setting for the header (deterministic, no fabrication).
  const traits = deriveHeaderTraits(ev);

  // A title with no corroborating evidence for ANY requested subject is recorded
  // as 'insufficient' rather than dressed up as understood.
  const anyReal = facts.some((f) => f.centrality === 'CENTRAL' || f.centrality === 'MATERIAL');
  return {
    facts,
    header: {
      status: anyReal ? 'compiled' : 'insufficient',
      tone: traits.tone,
      setting: traits.setting,
      antiEvidence,
      evidenceSources: Array.from(allSources),
    },
    adjudicatedCount,
  };
}

/**
 * OBSERVABILITY (§13). A plain-text trace of WHY a candidate was accepted or
 * excluded for a subject — the founder/dev "receipt" so we never again have to
 * guess why Goodfellas showed up for boxing. Pure; renders from real signals.
 */
export function explainCandidate(input: {
  title: string;
  subject: SubjectRequirement;
  evidence: CandidateEvidence;
  compiled?: { centrality: string; confidence: number; disputed: boolean; compilerVersion: string } | null;
  hardConstraints?: Array<{ label: string; pass: boolean }>;
  tasteScore?: number | null;
  provider?: string | null;
}): string {
  const det = evaluateSubjectCentrality(input.subject, input.evidence);
  const lines: string[] = [];
  lines.push(`Candidate: ${input.title}`);
  if (input.hardConstraints?.length) {
    lines.push('hard constraints:');
    for (const c of input.hardConstraints) lines.push(`  ${c.label}: ${c.pass ? 'PASS' : 'FAIL'}`);
  }
  lines.push(`required subject: ${input.subject.label}`);
  const src = input.compiled && input.compiled.compilerVersion === COMPILER_VERSION ? 'compiled knowledge' : 'live deterministic evaluation';
  const centrality = input.compiled?.centrality ?? det.centrality;
  const confidence = input.compiled ? Math.round(input.compiled.confidence * 100) : det.confidence;
  const eligible = input.compiled
    ? input.compiled.centrality === 'CENTRAL' || (input.subject.strict === false && input.compiled.centrality === 'MATERIAL')
    : det.status === 'PASS';
  lines.push(`  centrality: ${centrality}${input.compiled?.disputed ? ' (disputed)' : ''} — ${eligible ? 'PASS' : 'FAIL'}`);
  lines.push(`  evidence: ${src}, confidence ${confidence}`);
  if (!eligible && det.contraryEvidence[0]) lines.push(`  reason excluded: ${det.contraryEvidence[0]}`);
  else if (det.supportingEvidence[0]) lines.push(`  reason: ${det.supportingEvidence[0]}`);
  if (input.tasteScore != null) lines.push(`taste score: ${input.tasteScore}${eligible ? '' : ' (never ranked — excluded before Taste DNA)'}`);
  if (input.provider) lines.push(`provider: ${input.provider}`);
  lines.push(`final: ${eligible ? 'eligible' : 'excluded'}`);
  return lines.join('\n');
}
