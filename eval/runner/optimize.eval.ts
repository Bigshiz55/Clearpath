/**
 * `npm run eval:watchverdict:optimize` — runs the analysis + proposal half of
 * the controlled optimization loop. NEVER edits code, NEVER deploys.
 */
import { test } from 'vitest';
import { runOptimize, DEFAULT_OPTIMIZE_CONFIG } from './optimize';

test('watch-verdict optimization proposal', () => {
  const report = runOptimize(DEFAULT_OPTIMIZE_CONFIG);
  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      `Optimization analysis — baseline composite ${(report.baselineComposite * 100).toFixed(1)}%`,
      `Froze ${report.frozenRegressionCases} new regression case(s).`,
      'Top clusters:',
      ...report.clusters.slice(0, 8).map((c, i) => `  ${i + 1}. ${c.category} ×${c.count} (impact ${c.impactScore.toFixed(1)})${c.requiresProductDecision ? ' ⚠️ product decision' : ''}`),
      `Proposal: ${report.proposalPath}`,
      `Stop: ${report.stopReason}`,
      '',
    ].join('\n'),
  );
});
