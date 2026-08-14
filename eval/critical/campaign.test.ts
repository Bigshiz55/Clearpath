import { describe, it, expect } from 'vitest';
import { writeEvaluationArtifact, evaluatedCommit } from '../runner/artifacts';
import { join } from 'node:path';
import { normalize } from '../normalize/normalize';
import { generateCases, DIMENSIONS } from './generate';
import { gradeCase, type CaseResult } from './grade';
import type { FailCategory } from './suite';

/**
 * Large combinatorial search-validation campaign. Generates thousands of
 * multi-constraint prompts, runs each through the REAL offline parser, grades
 * every dimension, and writes a stamped report. The assertions gate the
 * parse-level dimensions the detectors own (origin / audio / runtime / media
 * type / platform / exclusion) at ≥98%; deeper retrieval/availability layers are
 * surfaced honestly in the report, never weakened. Size via EVAL_CASES (default
 * 2000); seed via EVAL_SEED (default 7) for reproducibility.
 */
const N = Number(process.env.EVAL_CASES ?? 2000);
const SEED = Number(process.env.EVAL_SEED ?? 7);


describe(`search validation campaign (${N} cases)`, () => {
  const cases = generateCases(N, SEED);
  const results: CaseResult[] = cases.map((c) => gradeCase(c, normalize(c.prompt)));

  const passed = results.filter((r) => r.pass).length;
  const catCounts = new Map<FailCategory, number>();
  for (const r of results) for (const cat of r.failCategories) catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  const sortedCats = [...catCounts.entries()].sort((a, b) => b[1] - a[1]);

  // Per-dimension pass rate: of the cases that NAMED a dimension, how many captured it?
  const dimRate = (cat: FailCategory) => {
    const relevant = results.filter((r) => r.checks.some((ch) => ch.category === cat));
    const clean = relevant.filter((r) => !r.failCategories.includes(cat)).length;
    return { relevant: relevant.length, clean, rate: relevant.length ? clean / relevant.length : 1 };
  };
  const dims: [string, FailCategory][] = [
    ['origin_country', 'WRONG_COUNTRY'], ['english_audio', 'AUDIO_NOT_VERIFIED'], ['runtime', 'WRONG_RUNTIME'],
    ['media_type', 'WRONG_MEDIA_TYPE'], ['platform', 'WRONG_PLATFORM'], ['exclusion', 'EXCLUSION_VIOLATION'],
    ['reference', 'REFERENCE_SIMILARITY_WEAK'],
  ];

  it('produces the campaign report (written only on an explicit refresh)', () => {
    const sha = evaluatedCommit();
    const L: string[] = [];
    L.push('# Search Validation Campaign', '');
    L.push(`- Commit \`${sha}\` · Seed ${SEED}`);
    L.push(`- **Total searches: ${N} · Passed ${passed} (${((passed / N) * 100).toFixed(1)}%) · Failed ${N - passed} (${(((N - passed) / N) * 100).toFixed(1)}%)**`);
    L.push('', '## Per-dimension pass rate (of cases naming that dimension)', '');
    for (const [label, cat] of dims) { const d = dimRate(cat); L.push(`- ${label}: ${(d.rate * 100).toFixed(1)}% (${d.clean}/${d.relevant})`); }
    L.push('', '## Failure categories', '');
    if (!sortedCats.length) L.push('None.');
    for (const [c, n] of sortedCats) L.push(`- ${c}: ${n}`);
    L.push('', '## Dimensions tested', '');
    for (const [k, v] of Object.entries(DIMENSIONS)) L.push(`- ${k}: ${(v as string[]).join(', ')}`);
    L.push('', '## Sample failures (first 15)', '');
    for (const r of results.filter((x) => !x.pass).slice(0, 15)) {
      L.push(`- ❌ ${r.prompt} → ${r.failCategories.join(', ')}`);
    }
    expect(L.length).toBeGreaterThan(0);
    writeEvaluationArtifact('campaign', 'report.md', L.join('\n'));
    writeEvaluationArtifact('campaign', 'summary.json', JSON.stringify({ sha, seed: SEED, total: N, passed, categories: Object.fromEntries(sortedCats), dims: Object.fromEntries(dims.map(([l, c]) => [l, dimRate(c)])) }, null, 2));
    // eslint-disable-next-line no-console
    console.log(`\nCAMPAIGN [${sha}] ${N} cases — ${((passed / N) * 100).toFixed(1)}% pass. Dims: ${dims.map(([l, c]) => `${l} ${(dimRate(c).rate * 100).toFixed(0)}%`).join(' · ')}\n`);
    expect(results.length).toBe(N);
  });

  // Parse-level dimension gates (≥98%) — the detectors must be reliable at scale.
  for (const [label, cat] of [['origin', 'WRONG_COUNTRY'], ['audio', 'AUDIO_NOT_VERIFIED'], ['runtime', 'WRONG_RUNTIME'], ['media type', 'WRONG_MEDIA_TYPE'], ['platform', 'WRONG_PLATFORM'], ['exclusion', 'EXCLUSION_VIOLATION']] as [string, FailCategory][]) {
    it(`${label} dimension ≥ 98% at scale`, () => {
      expect(dimRate(cat).rate).toBeGreaterThanOrEqual(0.98);
    });
  }
});
