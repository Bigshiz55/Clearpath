/**
 * Audit harness — PURE. Scores every audit case through BOTH the legacy ("before")
 * and the fixed ("after") identity/resolution logic and produces per-case records
 * plus aggregate metrics. No I/O; deterministic.
 *
 * `accepts` = the system would surface/link the candidate as the intended-or-related
 * title to the user (the user-facing action). Being conservative about false
 * positives means: an accept when the human expected reject/review is the dangerous
 * error we most want to drive to zero.
 */
import { titleMatches, normTitle } from '@/lib/search/titleMatch';
import { franchiseAssessment } from '@/lib/search/titleDna';
import { qualify } from '@/lib/search/seedSimilarity';
import { legacyTitleMatches, legacyFranchiseAssessment } from './legacy';
import type { AuditCase } from './dataset';

export interface CaseRecord {
  id: string;
  category: string;
  query: string;
  expectedCanonical: string;
  expected: string;               // accept | reject | review
  // system outputs
  actualRelation: string | null;  // identity cases
  actualIdentity: string | null;
  gateReason: string | null;      // similarity cases
  accepts: boolean;
  abstains: boolean;
  excludes: boolean;
  matchConfidence: number;        // 0..1
  band: 'low' | 'mid' | 'high';
  decision: string;               // accept | reject | review | exclude
  // judgment
  correct: boolean;
  relationCorrect: boolean | null; // identity only
  falsePositive: boolean;         // dangerous: surfaced/linked a wrong title
  falseNegative: boolean;         // missed a genuine match
  thresholdCalibrated: boolean;   // confidence band matches the expected decision
}

const bandOf = (c: number): CaseRecord['band'] => (c >= 0.7 ? 'high' : c >= 0.35 ? 'mid' : 'low');

function scoreCase(tc: AuditCase, mode: 'legacy' | 'fixed'): CaseRecord {
  let accepts = false, abstains = false, excludes = false, conf = 0;
  let actualRelation: string | null = null, actualIdentity: string | null = null, gateReason: string | null = null, decision = 'reject';
  let relationCorrect: boolean | null = null;

  if (tc.kind === 'resolution') {
    const matched = mode === 'fixed' ? titleMatches(tc.query, tc.candidate) : legacyTitleMatches(tc.query, tc.candidate);
    const tooShort = normTitle(tc.query).length < 3;
    accepts = matched;
    abstains = !matched && tooShort;
    if (matched) { conf = normTitle(tc.query) === normTitle(tc.candidate) ? 0.98 : 0.72; decision = 'accept'; }
    else { conf = tooShort ? 0.3 : 0.05; decision = tooShort ? 'review' : 'reject'; }
  } else if (tc.kind === 'identity') {
    const a = mode === 'fixed' ? franchiseAssessment(tc.seed, tc.candidate) : legacyFranchiseAssessment(tc.seed, tc.candidate);
    actualRelation = a.relation; actualIdentity = a.identity;
    relationCorrect = a.relation === tc.expectedRelation;
    if (a.relation === 'same_canonical') { accepts = true; conf = 0.98; decision = 'accept'; }
    else if (a.relation === 'franchise' && a.identity === 'known') { accepts = true; conf = 0.85; decision = 'accept'; }
    else if (a.relation === 'franchise' && a.identity === 'inferred') { abstains = true; conf = 0.5; decision = 'review'; }
    else if (a.relation === 'canonical_duplicate') { excludes = true; conf = 0.8; decision = 'exclude'; }
    else if (a.relation === 'similar') { conf = 0.2; decision = 'reject'; }
    else { abstains = true; conf = 0.3; decision = 'review'; } // unknown
  } else {
    // similarity
    const d = qualify(tc.seed, tc.candidate); // gate unchanged by these fixes → same for both modes
    gateReason = d.reason;
    accepts = d.passed;
    const hardContra = d.reason === 'hard_contradiction_grounded_vs_fantastical' || d.reason === 'contradiction_outweighs_similarity';
    if (d.passed) { conf = Math.max(0.6, Math.min(0.95, d.assessment.sharedAnchorScore)); decision = 'accept'; }
    else if (hardContra) { conf = 0.05; decision = 'reject'; }
    else { abstains = true; conf = Math.min(0.34, d.assessment.sharedAnchorScore); decision = 'review'; }
  }

  const expectAccept = tc.expected === 'accept';
  const correct = expectAccept ? accepts : !accepts;
  const falsePositive = accepts && !expectAccept;      // dangerous: wrong title surfaced/linked
  const falseNegative = !accepts && expectAccept;       // missed a genuine match
  const band = bandOf(conf);
  const thresholdCalibrated =
    (tc.expected === 'accept' && band === 'high') ||
    (tc.expected === 'reject' && band === 'low') ||
    (tc.expected === 'review' && (band === 'mid' || band === 'low'));

  return {
    id: tc.id, category: tc.category, query: tc.query, expectedCanonical: tc.expectedCanonical, expected: tc.expected,
    actualRelation, actualIdentity, gateReason, accepts, abstains, excludes,
    matchConfidence: Math.round(conf * 100) / 100, band, decision,
    correct, relationCorrect, falsePositive, falseNegative, thresholdCalibrated,
  };
}

export interface AuditMetrics {
  n: number;
  tp: number; fp: number; fn: number; tn: number;
  precision: number; recall: number; falsePositiveRate: number; falseNegativeRate: number;
  accuracy: number;
  dangerousFalsePositives: number;
  noMatchAccuracy: number;      // close_but_wrong + no_confident_match
  exactTitleAccuracy: number;   // exact_match
  franchiseIdentityAccuracy: number; // relation === expected, identity cases
  byCategory: Record<string, { correct: number; total: number; fp: number; fn: number }>;
  confidenceByBand: Record<string, { correct: number; total: number; accepts: number }>;
}

export function metricsFor(records: CaseRecord[]): AuditMetrics {
  let tp = 0, fp = 0, fn = 0, tn = 0, correct = 0, dangerous = 0;
  const byCategory: AuditMetrics['byCategory'] = {};
  const confidenceByBand: AuditMetrics['confidenceByBand'] = { low: { correct: 0, total: 0, accepts: 0 }, mid: { correct: 0, total: 0, accepts: 0 }, high: { correct: 0, total: 0, accepts: 0 } };
  let idTotal = 0, idRelCorrect = 0;
  let noMatchTotal = 0, noMatchCorrect = 0, exactTotal = 0, exactCorrect = 0;

  for (const r of records) {
    if (r.correct) correct++;
    const expectAccept = r.expected === 'accept';
    if (expectAccept && r.accepts) tp++;
    else if (!expectAccept && r.accepts) { fp++; dangerous++; }
    else if (expectAccept && !r.accepts) fn++;
    else tn++;

    const cat = (byCategory[r.category] ??= { correct: 0, total: 0, fp: 0, fn: 0 });
    cat.total++; if (r.correct) cat.correct++; if (r.falsePositive) cat.fp++; if (r.falseNegative) cat.fn++;

    const band = confidenceByBand[r.band]!;
    band.total++; if (r.correct) band.correct++; if (r.accepts) band.accepts++;

    if (r.relationCorrect !== null) { idTotal++; if (r.relationCorrect) idRelCorrect++; }
    if (r.category === 'close_but_wrong' || r.category === 'no_confident_match') { noMatchTotal++; if (r.correct) noMatchCorrect++; }
    if (r.category === 'exact_match') { exactTotal++; if (r.correct) exactCorrect++; }
  }
  const rr = (x: number) => Math.round(x * 1000) / 1000;
  return {
    n: records.length, tp, fp, fn, tn,
    precision: rr(tp + fp === 0 ? 1 : tp / (tp + fp)),
    recall: rr(tp + fn === 0 ? 1 : tp / (tp + fn)),
    falsePositiveRate: rr(fp + tn === 0 ? 0 : fp / (fp + tn)),
    falseNegativeRate: rr(fn + tp === 0 ? 0 : fn / (fn + tp)),
    accuracy: rr(correct / records.length),
    dangerousFalsePositives: dangerous,
    noMatchAccuracy: rr(noMatchTotal === 0 ? 1 : noMatchCorrect / noMatchTotal),
    exactTitleAccuracy: rr(exactTotal === 0 ? 1 : exactCorrect / exactTotal),
    franchiseIdentityAccuracy: rr(idTotal === 0 ? 1 : idRelCorrect / idTotal),
    byCategory, confidenceByBand,
  };
}

export function runAudit(cases: AuditCase[]): { legacy: { records: CaseRecord[]; metrics: AuditMetrics }; fixed: { records: CaseRecord[]; metrics: AuditMetrics } } {
  const legacy = cases.map((c) => scoreCase(c, 'legacy'));
  const fixed = cases.map((c) => scoreCase(c, 'fixed'));
  return { legacy: { records: legacy, metrics: metricsFor(legacy) }, fixed: { records: fixed, metrics: metricsFor(fixed) } };
}
