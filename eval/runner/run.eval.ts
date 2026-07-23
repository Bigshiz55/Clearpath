/**
 * Vitest entry that RUNS an evaluation (not a unit test). Driven by EVAL_* env
 * vars set by the npm scripts. Writes reports and logs a summary. Only asserts
 * pass/fail when EVAL_ASSERT=1 (CI / regression gate) so report-only runs never
 * fail the process.
 */
import { test, expect } from 'vitest';
import { runEval, summarize } from './run';
import { saveBaseline } from './compare';

test('watch-verdict evaluation', () => {
  const r = runEval();
  if (r.options.live) {
    // Honesty: live-observation mode (real TMDB/schedule, budgeted) is a
    // documented capability but not exercised offline. No external calls were
    // made; this run used the deterministic fixture pipeline. Wire a real
    // adapter in eval/pipeline before trusting live numbers.
    // eslint-disable-next-line no-console
    console.log('[live] NOTE: live-observation adapter not active — ran deterministic fixtures, 0 external API calls.');
  }
  // eslint-disable-next-line no-console
  console.log('\n' + summarize(r) + '\n');

  if (process.env.EVAL_SAVE_BASELINE === '1') {
    const dir = saveBaseline(r.options.outDir, r.runDir);
    // eslint-disable-next-line no-console
    console.log(`baseline saved → ${dir}`);
  }

  const assertMode = process.env.EVAL_ASSERT;
  if (assertMode === 'thresholds') {
    // Absolute gate: every critical threshold must be met (used when the app is
    // believed clean). Fails on ANY hard violation.
    expect(
      r.scorecard.passed,
      `Critical thresholds breached: ${r.scorecard.breaches.map((b) => `${b.metric}=${(b.value * 100).toFixed(2)}%`).join(', ')}`,
    ).toBe(true);
  } else if (assertMode === '1' || assertMode === 'regression') {
    // Regression gate (CI default): do NOT fail on pre-existing known bugs; fail
    // only on a NEW critical regression vs the committed baseline, and always on
    // a crash. This is what protects PRs without blocking on the known backlog.
    expect(r.scorecard.metrics.crashRate, 'a case crashed the pipeline').toBe(0);
    if (r.comparison) {
      expect(
        r.comparison.criticalRegressions.length,
        `New critical regressions vs baseline: ${r.comparison.criticalRegressions.join(', ')}`,
      ).toBe(0);
    }
  }
});
