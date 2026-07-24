/** Deterministic objective validators + metrics for a ranked seed-similarity result. */
import { canonicalKey } from '@/lib/search/titleDna';
import type { RankedResult } from './types';
import type { GoldCase } from './cases';
import type { SeedFixture } from './fixtures';

export interface CaseGrade {
  caseId: string;
  split: 'dev' | 'holdout';
  intent: string;
  returned: number;
  requested: number;
  critical: {
    seedLeak: string[]; // canonical ids that should have been excluded but appear
    duplicate: string[]; // duplicate canonical ids in the result
    contradictionLeak: string[]; // mustFail titles that appear
    hallucination: string[]; // returned ids not present in the candidate pool
  };
  recall: {
    mustQualifyMissing: string[]; // genuine matches that failed to appear
  };
  franchiseTop5: number;
  franchiseCapViolated: boolean;
  pass: boolean; // no critical failures AND franchise cap respected
}

export function gradeCase(gc: GoldCase, fx: SeedFixture, result: RankedResult): CaseGrade {
  const poolById = new Map(fx.candidates.map((c) => [c.canonicalId, c]));
  const itemIds = result.items.map((i) => i.canonicalId);

  // seed leak: any excludedCanonical appears in items
  const seedLeak = gc.expect.excludedCanonical.filter((id) => itemIds.includes(id));

  // duplicate canonical works in the result
  const seenKey = new Map<string, number>();
  const duplicate: string[] = [];
  for (const it of result.items) {
    const c = poolById.get(it.canonicalId);
    const key = c ? canonicalKey(c) : it.canonicalId;
    seenKey.set(key, (seenKey.get(key) ?? 0) + 1);
    if (seenKey.get(key) === 2) duplicate.push(it.canonicalId);
  }

  const contradictionLeak = gc.expect.mustFail.filter((id) => itemIds.includes(id));
  const hallucination = itemIds.filter((id) => !poolById.has(id) && id !== fx.seed.canonicalId);
  const mustQualifyMissing = gc.expect.mustQualify.filter((id) => !itemIds.includes(id));

  const seedCollection = fx.seed.collectionId ?? null;
  const franchiseTop5 = result.items.slice(0, 5).filter((it) => {
    const c = poolById.get(it.canonicalId);
    return seedCollection != null && c?.collectionId === seedCollection && c.canonicalId !== fx.seed.canonicalId;
  }).length;
  const franchiseCapViolated = franchiseTop5 > gc.expect.maxFranchiseTop5;

  const critical = { seedLeak, duplicate, contradictionLeak, hallucination };
  const noCritical = seedLeak.length === 0 && duplicate.length === 0 && contradictionLeak.length === 0 && hallucination.length === 0;

  return {
    caseId: gc.id,
    split: gc.split,
    intent: gc.intent,
    returned: result.items.length,
    requested: gc.requestedCount,
    critical,
    recall: { mustQualifyMissing },
    franchiseTop5,
    franchiseCapViolated,
    pass: noCritical && !franchiseCapViolated,
  };
}

export interface SuiteSummary {
  label: string;
  total: number;
  passed: number;
  failed: number;
  criticalCounts: { seedLeak: number; duplicate: number; contradictionLeak: number; hallucination: number };
  franchiseViolations: number;
  recallMisses: number;
  bySplit: Record<string, { total: number; passed: number }>;
}

export function summarize(label: string, grades: CaseGrade[]): SuiteSummary {
  const s: SuiteSummary = {
    label, total: grades.length, passed: 0, failed: 0,
    criticalCounts: { seedLeak: 0, duplicate: 0, contradictionLeak: 0, hallucination: 0 },
    franchiseViolations: 0, recallMisses: 0, bySplit: {},
  };
  for (const g of grades) {
    if (g.pass) s.passed++; else s.failed++;
    s.criticalCounts.seedLeak += g.critical.seedLeak.length;
    s.criticalCounts.duplicate += g.critical.duplicate.length;
    s.criticalCounts.contradictionLeak += g.critical.contradictionLeak.length;
    s.criticalCounts.hallucination += g.critical.hallucination.length;
    if (g.franchiseCapViolated) s.franchiseViolations++;
    s.recallMisses += g.recall.mustQualifyMissing.length;
    const split = (s.bySplit[g.split] ??= { total: 0, passed: 0 });
    split.total++;
    if (g.pass) split.passed++;
  }
  return s;
}
