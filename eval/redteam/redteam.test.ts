import { describe, it, expect } from 'vitest';
import { evaluateSubjectCentrality, type SubjectRequirement } from '@/lib/nlu/semanticEligibility';
import { generateCase, type GeneratedCase } from './generator';

/**
 * SEMANTIC RED-TEAM AUDIT.
 *
 * A seeded generator produces natural-language requests and controlled
 * candidate pools with GROUND-TRUTH labels authored independently of the
 * production evaluator. For every case we run the real evaluator over the pool
 * and an INDEPENDENT judge grades the result against ground truth — precision
 * (no incidental/absent decoy is eligible) and recall (every central title is
 * eligible). This is the automated proof the Snake-Eyes class of failure is
 * generally rejected, not a boxing patch.
 *
 * Scale is controlled by REDTEAM_CASES (default 300 in standard runs); the
 * full release audit sets it far higher. The seed is printed for reproduction:
 *   REDTEAM_SEED=<n> REDTEAM_CASES=<n> npx vitest run eval/redteam/redteam.test.ts
 */

interface Verdict {
  caseId: string;
  seed: number;
  request: string;
  passed: boolean;
  falsePositives: string[]; // decoys the evaluator wrongly made eligible
  falseNegatives: string[]; // central titles the evaluator wrongly rejected
}

function judge(gc: GeneratedCase): Verdict {
  const req: SubjectRequirement = {
    canonical: gc.subject.canonical,
    label: gc.subject.label,
    lexemes: gc.subject.lexemes,
    strict: !gc.allowSubstantial,
    allowSubstantial: gc.allowSubstantial,
  };
  const eligible = new Set<string>();
  for (const cand of gc.pool) {
    const v = evaluateSubjectCentrality(req, {
      title: cand.title,
      overview: cand.overview,
      genres: cand.genres,
      keywords: cand.keywords,
    });
    if (v.status === 'PASS') eligible.add(cand.title);
  }
  const falsePositives = [...eligible].filter((t) => !gc.eligibleTruth.has(t));
  const falseNegatives = [...gc.eligibleTruth].filter((t) => !eligible.has(t));
  return {
    caseId: gc.caseId,
    seed: gc.seed,
    request: gc.request,
    passed: falsePositives.length === 0 && falseNegatives.length === 0,
    falsePositives,
    falseNegatives,
  };
}

function runAudit(seed: number, cases: number) {
  const results: Verdict[] = [];
  for (let i = 0; i < cases; i++) results.push(judge(generateCase(seed, i)));
  const failed = results.filter((r) => !r.passed);
  // Decoy leaks (false positives) are the critical, zero-tolerance failure.
  const decoyLeaks = results.filter((r) => r.falsePositives.length > 0);
  return { results, failed, decoyLeaks, passRate: (results.length - failed.length) / results.length };
}

const SEED = Number(process.env.REDTEAM_SEED ?? '1337');
const CASES = Number(process.env.REDTEAM_CASES ?? '300');

describe('semantic red-team — seeded audit', () => {
  it(`ZERO incidental/absent decoys are ever ranked as eligible (seed ${SEED}, ${CASES} cases)`, () => {
    const { decoyLeaks, passRate, results } = runAudit(SEED, CASES);
    if (decoyLeaks.length > 0) {
      const ex = decoyLeaks.slice(0, 5).map((r) => `  ${r.caseId} "${r.request}" leaked: ${r.falsePositives.join(', ')}`);
      // eslint-disable-next-line no-console
      console.error(`DECOY LEAKS (${decoyLeaks.length}):\n${ex.join('\n')}\nReproduce: REDTEAM_SEED=${SEED} REDTEAM_CASES=${CASES} npx vitest run eval/redteam/redteam.test.ts`);
    }
    // eslint-disable-next-line no-console
    console.log(`RED-TEAM seed=${SEED} cases=${results.length} passRate=${(passRate * 100).toFixed(2)}% decoyLeaks=${decoyLeaks.length}`);
    expect(decoyLeaks.length).toBe(0); // hard invariant: no incidental decoy is eligible
  });

  it(`overall precision/recall against the independent oracle is 100% (seed ${SEED})`, () => {
    const { failed, results } = runAudit(SEED, CASES);
    if (failed.length > 0) {
      const ex = failed.slice(0, 8).map((r) => `  ${r.caseId} "${r.request}" FP=[${r.falsePositives}] FN=[${r.falseNegatives}]`);
      // eslint-disable-next-line no-console
      console.error(`FAILURES (${failed.length}/${results.length}):\n${ex.join('\n')}`);
    }
    expect(failed.length).toBe(0);
  });

  it('a second, unseen seed also holds (reproducibility + no seed-specific tuning)', () => {
    const { decoyLeaks, failed } = runAudit(SEED + 99991, Math.min(CASES, 300));
    expect(decoyLeaks.length).toBe(0);
    expect(failed.length).toBe(0);
  });
});
