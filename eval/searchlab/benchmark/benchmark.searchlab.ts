/**
 * Automated retrieval BENCHMARK. Generates thousands of natural-language queries,
 * runs them through the pipeline offline, evaluates retrieval quality, writes a
 * regression report, and ASSERTS the predefined quality targets. If any target is
 * unmet the suite fails — so a regression can't ship.
 *
 * Scale via SEARCHLAB_BENCH_N (default 2000). Seed via SEARCHLAB_BENCH_SEED.
 * Run: npm run search-lab:benchmark
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateQueries } from './generator';
import { evaluateQueries } from './metrics';
import { checkTargets, TARGETS } from './targets';

const N = Number(process.env.SEARCHLAB_BENCH_N ?? 2000);
const SEED = Number(process.env.SEARCHLAB_BENCH_SEED ?? 1234);
const OUT = path.join(process.cwd(), 'search-lab-results', 'benchmark');

describe('Search Lab — retrieval benchmark', () => {
  it(`generates ${N} NL queries, evaluates, and meets quality targets`, async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const queries = generateQueries(N, SEED);
    expect(queries.length).toBe(N);

    const { evals, metrics } = await evaluateQueries(queries);
    const { checks, allPass } = checkTargets(metrics);

    // artifacts
    fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({ seed: SEED, n: N, metrics, targets: TARGETS, checks }, null, 2));
    fs.writeFileSync(path.join(OUT, 'failures.jsonl'), metrics.failures.map((f) => JSON.stringify(f)).join('\n') + '\n');
    fs.writeFileSync(path.join(OUT, 'sample-queries.jsonl'),
      queries.slice(0, 40).map((q, i) => JSON.stringify({ ...q, actualIntent: evals[i]!.actualIntent, expansions: evals[i]!.expansions, topConfidence: evals[i]!.topConfidence })).join('\n') + '\n');

    const lines = [
      '# Search Lab — Retrieval Benchmark', '',
      `Seed ${SEED} · ${N} generated NL queries.`, '',
      '## Quality targets', '',
      '| metric | target | actual | pass |',
      '|---|---|---|---|',
      ...checks.map((c) => `| ${c.key} | ${c.target} | ${c.actual} | ${c.pass ? '✅' : '❌'} |`),
      '',
      `Overall: **${allPass ? 'PASS — meets all targets' : 'FAIL — a target is unmet'}**`, '',
      '## Additional metrics', '',
      `- confident-result rate: ${metrics.confidentRate}`,
      `- resolution (confident): ${metrics.resolutionRecall} · resolution (confident+lead): ${metrics.resolutionOrLeadRecall}`,
      `- mean/median expansions: ${metrics.meanExpansions} / ${metrics.medianExpansions}`, '',
      '## By intent', '',
      '| intent | n | intent-acc | title-resolved |',
      '|---|---|---|---|',
      ...Object.entries(metrics.byIntent).map(([k, v]) =>
        `| ${k} | ${v.total} | ${(v.intentCorrect / v.total).toFixed(2)} | ${v.titleAnchored ? (v.resolved / v.titleAnchored).toFixed(2) : '—'} |`),
      '',
      `## Sample failures (${metrics.failures.length})`, '',
      ...metrics.failures.slice(0, 20).map((f) => `- [${f.reason}] "${f.text}"`),
      '',
    ];
    fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n') + '\n');

    // ── HARD gates: the product promise and its safety net ──
    expect(metrics.neverDeadEndRate, 'NEVER dead-end').toBe(1);
    expect(metrics.recoveryCompleteness, 'recovery always complete').toBe(1);
    // ── quality floors ──
    for (const c of checks) expect(c.pass, `${c.key} ${c.actual} >= ${c.target}`).toBe(true);
    expect(allPass).toBe(true);
  });
});
