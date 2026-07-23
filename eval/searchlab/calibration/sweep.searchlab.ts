/**
 * Calibration sweep runner — Decision 2.
 *
 * Sweeps the seed-similarity thresholds over a grid, reports metrics ACROSS the
 * whole range (not one point), selects the best config on the CALIBRATION split
 * only, then evaluates the frozen CAL_HOLDOUT split EXACTLY ONCE with that
 * already-selected config. Writes reviewable artifacts under
 * search-lab-results/calibration/.
 *
 * Run: npm run search-lab:calibrate
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CALIBRATION, CAL_HOLDOUT, seedInventory } from './dataset';
import { sweep, selectBest, evaluate, metricRanges } from './sweep';
import { THRESHOLDS_V1_PROVISIONAL } from '@/lib/search/thresholds';

const OUT = path.join(process.cwd(), 'search-lab-results', 'calibration');

describe('Search Lab — threshold calibration sweep', () => {
  it('sweeps on CALIBRATION, selects, then scores HOLDOUT once', () => {
    fs.mkdirSync(OUT, { recursive: true });

    // ── composition (human-review record) ──
    const composition = {
      calibration: { pairs: CALIBRATION.length, ...seedInventory(CALIBRATION) },
      holdout: { pairs: CAL_HOLDOUT.length, ...seedInventory(CAL_HOLDOUT) },
      note: 'Development/calibration set is tuned against; holdout is frozen and scored once. Thresholds stay v1-provisional until a larger fully human-audited set is reviewed.',
    };
    fs.writeFileSync(path.join(OUT, 'composition.json'), JSON.stringify(composition, null, 2));

    // ── sweep on CALIBRATION ONLY ──
    const points = sweep(CALIBRATION, THRESHOLDS_V1_PROVISIONAL);
    fs.writeFileSync(
      path.join(OUT, 'sweep-grid.jsonl'),
      points.map((p) => JSON.stringify({ thresholds: p.thresholds, metrics: p.metrics })).join('\n') + '\n',
    );
    const ranges = metricRanges(points);
    fs.writeFileSync(path.join(OUT, 'metric-ranges.json'), JSON.stringify(ranges, null, 2));

    // ── selection (CALIBRATION only) ──
    const { chosen, rationale, consideredEligible } = selectBest(points, THRESHOLDS_V1_PROVISIONAL);

    // ── provisional reference on both splits (comparison) ──
    const provCal = evaluate(CALIBRATION, THRESHOLDS_V1_PROVISIONAL).metrics;
    const selCal = evaluate(CALIBRATION, chosen.thresholds).metrics;

    // ── HOLDOUT scored ONCE with the frozen selection (never used to choose) ──
    const holdoutSelected = evaluate(CAL_HOLDOUT, chosen.thresholds);
    const holdoutProvisional = evaluate(CAL_HOLDOUT, THRESHOLDS_V1_PROVISIONAL).metrics;

    const selection = {
      selectedThresholds: { ...chosen.thresholds, version: 'v1-calibrated-candidate' },
      rationale,
      consideredEligible,
      calibration: { provisional: provCal, selected: selCal },
      holdout: { provisional: holdoutProvisional, selected: holdoutSelected.metrics },
    };
    fs.writeFileSync(path.join(OUT, 'selected.json'), JSON.stringify(selection, null, 2));
    fs.writeFileSync(
      path.join(OUT, 'holdout-outcomes.jsonl'),
      holdoutSelected.outcomes.map((o) => JSON.stringify(o)).join('\n') + '\n',
    );

    // ── human-readable report ──
    const fmt = (m: typeof selCal) =>
      `precision=${m.precision} recall=${m.recall} F1=${m.f1} falseQual=${m.falseQualificationRate} noResult=${m.noResultRate} critContra=${m.criticalContradictionRate} (TP${m.tp}/FP${m.fp}/FN${m.fn}/TN${m.tn})`;
    const lines = [
      '# Search Lab — Threshold Calibration Sweep', '',
      `Grid points swept: **${points.length}** · eligible (0 critical leaks & 0 over-filtering): **${consideredEligible}**`, '',
      '## Metric ranges across the full grid (CALIBRATION)', '',
      ...Object.entries(ranges).map(([k, v]) => `- ${k}: ${v.min} … ${v.max}`), '',
      '## Selected configuration', '',
      '```json', JSON.stringify(chosen.thresholds, null, 2), '```', '',
      rationale, '',
      '## CALIBRATION split', '',
      `- provisional: ${fmt(provCal)}`,
      `- selected:    ${fmt(selCal)}`, '',
      '## HOLDOUT split (scored ONCE with the frozen selection)', '',
      `- provisional: ${fmt(holdoutProvisional)}`,
      `- selected:    ${fmt(holdoutSelected.metrics)}`, '',
      '## Composition', '',
      `- CALIBRATION: ${CALIBRATION.length} pairs · ${composition.calibration.seeds} distinct seeds`,
      `- HOLDOUT: ${CAL_HOLDOUT.length} pairs · ${composition.holdout.seeds} distinct seeds`,
      `- calibration by category: ${JSON.stringify(composition.calibration.byCategory)}`,
      `- calibration by bucket: ${JSON.stringify(composition.calibration.byBucket)}`, '',
    ];
    fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n') + '\n');

    // ── assertions (the sweep itself must hold to its discipline) ──
    // The one safety property that is never traded away: no contradiction leaks.
    expect(selCal.criticalContradictionRate, 'selected: no contradiction leaks (calibration)').toBe(0);
    // The selected config must be at least as good as provisional on calibration F1.
    expect(selCal.f1, 'selected F1 >= provisional F1 (calibration)').toBeGreaterThanOrEqual(provCal.f1);
    // Holdout is only REPORTED — assert it was scored, not that it was tuned, and
    // that the safety property generalizes (no contradiction leak on unseen data).
    expect(holdoutSelected.metrics.n, 'holdout scored').toBe(CAL_HOLDOUT.length);
    expect(holdoutSelected.metrics.criticalContradictionRate, 'holdout: no contradiction leaks').toBe(0);
  });
});
