/**
 * `npm run eval:watchverdict analyze` — run the current mode and print a failure
 * analysis (clusters + representative cases + recommended fixes) without writing
 * a proposal or freezing regression cases. Read-only insight.
 */
import { test } from 'vitest';
import { runEval, summarize } from './run';
import { clusterFailures } from './optimize';

test('watch-verdict failure analysis', () => {
  const r = runEval();
  const clusters = clusterFailures(r.results);
  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      summarize(r),
      '',
      'Failure clusters:',
      ...(clusters.length
        ? clusters.map((c, i) => `  ${i + 1}. ${c.category} ×${c.count} (impact ${c.impactScore.toFixed(1)}) — ${c.recommendedFix}`)
        : ['  none 🎉']),
      '',
      'Representative failures:',
      ...r.results
        .filter((x) => !x.passed)
        .slice(0, 12)
        .map((x) => `  [${x.primaryCategory ?? '—'}] ${x.case.id}: "${x.case.rawQuery}"`),
      '',
    ].join('\n'),
  );
});
