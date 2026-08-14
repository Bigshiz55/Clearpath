import { describe, it, expect } from 'vitest';
import { writeEvaluationArtifact, evaluatedCommit } from '../runner/artifacts';
import { join } from 'node:path';
import { normalize } from '../normalize/normalize';
import { CRITICAL_SUITE, IMPOSSIBLE_SUITE, type CriticalCase, type FailCategory } from './suite';
import { gradeCase, type CaseResult } from './grade';

/**
 * The curated critical suite, run through the REAL offline parser cascade
 * (eval/normalize → src/lib/nlu detectors + finderParse). It proves, per case,
 * exactly which parts of each request WatchVerdict understands, classifies every
 * miss by failure category, and writes a stamped report. The assertions guard
 * the parse-level constraints the detectors now own (origin / audio / runtime /
 * media-type / exclusion) — the rest of the report surfaces deeper
 * retrieval/availability/trait-translation gaps honestly (never weakened).
 */

function runCase(c: CriticalCase): CaseResult {
  // Multi-turn: refinements accumulate into one combined utterance the parser sees.
  const full = [c.prompt, ...(c.turns ?? [])].join('. ');
  const nq = normalize(full);
  return gradeCase(c, nq);
}

describe('curated critical search suite', () => {
  const results = CRITICAL_SUITE.map(runCase);
  const impossible = IMPOSSIBLE_SUITE.map(runCase);
  const all = [...results, ...impossible];

  const passed = all.filter((r) => r.pass).length;
  const catCounts = new Map<FailCategory, number>();
  for (const r of all) for (const cat of r.failCategories) catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  const sortedCats = [...catCounts.entries()].sort((a, b) => b[1] - a[1]);

  const sha = evaluatedCommit();

  it('produces the critical-suite report (written only on an explicit refresh)', () => {
    const lines: string[] = [];
    lines.push('# Search Quality — Curated Critical Suite');
    lines.push('');
    lines.push(`- Commit: \`${sha}\``);
    lines.push(`- Cases: ${all.length} (${CRITICAL_SUITE.length} curated + ${IMPOSSIBLE_SUITE.length} impossible)`);
    lines.push(`- **Passed: ${passed}/${all.length} (${Math.round((passed / all.length) * 100)}%)**`);
    lines.push('');
    lines.push('## Failure categories (most frequent first)');
    lines.push('');
    if (sortedCats.length === 0) lines.push('None — every hard constraint captured.');
    for (const [cat, n] of sortedCats) lines.push(`- ${cat}: ${n}`);
    lines.push('');
    lines.push('## Per-case results');
    lines.push('');
    for (const r of all) {
      lines.push(`### ${r.pass ? '✅' : '❌'} ${r.id}`);
      lines.push(`> ${r.prompt}`);
      for (const ch of r.checks) lines.push(`- ${ch.ok ? '✓' : '✗'} ${ch.label}${ch.ok ? '' : ` — ${ch.category} (${ch.detail})`}`);
      lines.push('');
    }
    // The report is COMPUTED every run — that is what proves it can be
    // produced. It is only WRITTEN when a refresh was asked for.
    expect(lines.length).toBeGreaterThan(0);
    writeEvaluationArtifact('critical', 'report.md', lines.join('\n'));
    writeEvaluationArtifact('critical', 'summary.json', JSON.stringify({ sha, total: all.length, passed, categories: Object.fromEntries(sortedCats) }, null, 2));

    // Narrator line for the console.
    // eslint-disable-next-line no-console
    console.log(`\nCRITICAL SUITE [${sha}] — ${passed}/${all.length} passed. Top gaps: ${sortedCats.slice(0, 4).map(([c, n]) => `${c}(${n})`).join(', ') || 'none'}\n`);
    expect(all.length).toBe(CRITICAL_SUITE.length + IMPOSSIBLE_SUITE.length);
  });

  // ── Regression guards: the parse-level constraints the detectors now own MUST
  //    be captured on every case that names them. These prove the fix + prevent
  //    regressions; they are NOT weakened to accommodate a broken parser.
  const failCatsOn = (cat: FailCategory) => all.filter((r) => r.failCategories.includes(cat)).map((r) => r.id);

  it('origin country is captured for every foreign-origin case (WRONG_COUNTRY = 0)', () => {
    expect(failCatsOn('WRONG_COUNTRY')).toEqual([]);
  });
  it('English audio / dub is captured wherever required (AUDIO_NOT_VERIFIED = 0)', () => {
    expect(failCatsOn('AUDIO_NOT_VERIFIED')).toEqual([]);
  });
  it('runtime ceilings are captured (WRONG_RUNTIME = 0)', () => {
    expect(failCatsOn('WRONG_RUNTIME')).toEqual([]);
  });
  it('media type is captured (WRONG_MEDIA_TYPE = 0)', () => {
    expect(failCatsOn('WRONG_MEDIA_TYPE')).toEqual([]);
  });
  it('named exclusions (animation, supernatural, slow-burn, violence-against-children) are captured (EXCLUSION_VIOLATION = 0)', () => {
    expect(failCatsOn('EXCLUSION_VIOLATION')).toEqual([]);
  });
  it('the two flagship cases parse their hard constraints', () => {
    const spanish = results.find((r) => r.id === 'crit-01-spanish-english-audio-christmas-story')!;
    expect(spanish.failCategories).not.toContain('WRONG_COUNTRY');
    expect(spanish.failCategories).not.toContain('AUDIO_NOT_VERIFIED');
    const hallmark = results.find((r) => r.id === 'crit-02-silence-lambs-on-hallmark')!;
    expect(hallmark.failCategories).not.toContain('WRONG_PLATFORM');
  });
});
