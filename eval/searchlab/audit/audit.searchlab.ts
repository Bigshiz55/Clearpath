/**
 * Identity & resolution AUDIT runner. Scores the expanded audit set through the
 * legacy ("before") and fixed ("after") logic, writes reviewable artifacts under
 * search-lab-results/audit/, and asserts the safety property: the FIXED logic must
 * (a) have zero dangerous false positives, and (b) never be worse than legacy on
 * dangerous false positives, false negatives, accuracy, or franchise identity.
 *
 * Run: npm run search-lab:audit
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AUDIT_CASES } from './dataset';
import { runAudit } from './harness';

const OUT = path.join(process.cwd(), 'search-lab-results', 'audit');

describe('Search Lab — identity & resolution audit', () => {
  it('scores before/after and holds the false-positive safety property', () => {
    fs.mkdirSync(OUT, { recursive: true });
    const { legacy, fixed } = runAudit(AUDIT_CASES);

    // composition
    const byCat: Record<string, number> = {};
    for (const c of AUDIT_CASES) byCat[c.category] = (byCat[c.category] ?? 0) + 1;
    const composition = { total: AUDIT_CASES.length, byCategory: byCat, byKind: countKind(AUDIT_CASES) };
    fs.writeFileSync(path.join(OUT, 'composition.json'), JSON.stringify(composition, null, 2));

    // per-case records (fixed) + legacy for diffing
    fs.writeFileSync(path.join(OUT, 'cases-fixed.jsonl'), fixed.records.map((r) => JSON.stringify(r)).join('\n') + '\n');
    fs.writeFileSync(path.join(OUT, 'cases-legacy.jsonl'), legacy.records.map((r) => JSON.stringify(r)).join('\n') + '\n');

    // metrics before/after
    const metrics = { legacy: legacy.metrics, fixed: fixed.metrics };
    fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2));

    // cases whose behaviour CHANGED between legacy and fixed
    const changed = AUDIT_CASES.map((c, i) => ({ c, l: legacy.records[i]!, f: fixed.records[i]! }))
      .filter(({ l, f }) => l.accepts !== f.accepts || l.decision !== f.decision || l.actualRelation !== f.actualRelation)
      .map(({ c, l, f }) => ({ id: c.id, category: c.category, query: c.query, expected: c.expected,
        before: { accepts: l.accepts, decision: l.decision, relation: l.actualRelation, fp: l.falsePositive, fn: l.falseNegative },
        after: { accepts: f.accepts, decision: f.decision, relation: f.actualRelation, fp: f.falsePositive, fn: f.falseNegative } }));
    fs.writeFileSync(path.join(OUT, 'before-after-diff.json'), JSON.stringify(changed, null, 2));

    // human-readable report
    const m = (x: typeof fixed.metrics) =>
      `acc=${x.accuracy} prec=${x.precision} rec=${x.recall} FPR=${x.falsePositiveRate} FNR=${x.falseNegativeRate} dangerousFP=${x.dangerousFalsePositives} noMatchAcc=${x.noMatchAccuracy} exactAcc=${x.exactTitleAccuracy} franchiseIdAcc=${x.franchiseIdentityAccuracy}`;
    const lines = [
      '# Search Lab — Identity & Resolution Audit', '',
      `Cases: **${AUDIT_CASES.length}** across ${Object.keys(byCat).length} categories.`, '',
      '## Metrics — before (legacy) vs after (fixed)', '',
      `- legacy: ${m(legacy.metrics)}`,
      `- fixed:  ${m(fixed.metrics)}`, '',
      '## Confidence calibration by band (fixed)', '',
      ...(['high', 'mid', 'low'] as const).map((b) => {
        const v = fixed.metrics.confidenceByBand[b]!;
        return `- ${b}: ${v.total ? Math.round((v.correct / v.total) * 100) : 100}% correct (${v.correct}/${v.total}), accepts=${v.accepts}`;
      }), '',
      '## Behaviour changes (before → after)', '',
      ...changed.map((c) => `- \`${c.id}\` (${c.category}) "${c.query}" expected=${c.expected}: accepts ${c.before.accepts}→${c.after.accepts}` +
        (c.before.fp && !c.after.fp ? ' · fixed a FALSE POSITIVE' : '') +
        (c.before.fn && !c.after.fn ? ' · fixed a FALSE NEGATIVE' : '') +
        (c.before.relation !== c.after.relation ? ` · relation ${c.before.relation}→${c.after.relation}` : '')),
      '',
      '## Residual (fixed) — cases still not fully accepted where a human might expect nuance', '',
      ...fixed.records.filter((r) => !r.correct).map((r) => `- \`${r.id}\` (${r.category}) expected=${r.expected} decision=${r.decision} relation=${r.actualRelation ?? '-'} — ${r.expectedCanonical}`),
      '',
    ];
    fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n') + '\n');

    // ── SAFETY ASSERTIONS ──
    // 1. Fixed logic surfaces ZERO wrong titles (no dangerous false positives).
    expect(fixed.metrics.dangerousFalsePositives, 'fixed: zero dangerous false positives').toBe(0);
    // 2. Fixed is never worse than legacy on the axes that matter.
    expect(fixed.metrics.dangerousFalsePositives, 'FP not worse').toBeLessThanOrEqual(legacy.metrics.dangerousFalsePositives);
    expect(fixed.metrics.fn, 'FN not worse').toBeLessThanOrEqual(legacy.metrics.fn);
    expect(fixed.metrics.accuracy, 'accuracy not worse').toBeGreaterThanOrEqual(legacy.metrics.accuracy);
    expect(fixed.metrics.franchiseIdentityAccuracy, 'franchise identity not worse').toBeGreaterThanOrEqual(legacy.metrics.franchiseIdentityAccuracy);
    // 3. The fixes must MEASURABLY improve something (else they are churn).
    const improved = fixed.metrics.dangerousFalsePositives < legacy.metrics.dangerousFalsePositives
      || fixed.metrics.fn < legacy.metrics.fn
      || fixed.metrics.franchiseIdentityAccuracy > legacy.metrics.franchiseIdentityAccuracy;
    expect(improved, 'fixes produce a measurable improvement').toBe(true);
  });
});

function countKind(cases: typeof AUDIT_CASES): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cases) out[c.kind] = (out[c.kind] ?? 0) + 1;
  return out;
}
