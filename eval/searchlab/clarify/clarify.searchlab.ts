/**
 * Multilingual Clarification Engine benchmark. Runs the curated adversarial cases
 * (exact expectations) + thousands of generated ambiguous queries, computes the
 * spec's per-locale metrics, writes a report, and ASSERTS that no SHIPPED locale
 * regresses vs the English baseline and no untranslated strings ship.
 *
 * Run: npm run search-lab:clarify   (scale via SEARCHLAB_CLARIFY_N, default 1500)
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateClarifyCases, ADVERSARIAL } from './generator';
import { evaluateCase, aggregateByLocale, regressionFlags } from './metrics';

const N = Number(process.env.SEARCHLAB_CLARIFY_N ?? 1500);
const OUT = path.join(process.cwd(), 'search-lab-results', 'clarify');

describe('Search Lab — multilingual clarification benchmark', () => {
  it('meets per-locale quality with no regression vs English and no untranslated strings', () => {
    fs.mkdirSync(OUT, { recursive: true });
    const cases = [...ADVERSARIAL, ...generateClarifyCases(N)];
    const results = cases.map(evaluateCase);
    const byLoc = aggregateByLocale(results);
    const flags = regressionFlags(byLoc);

    // adversarial exactness (report card for the spec's hand-picked cases)
    const adv = ADVERSARIAL.map((c) => { const r = evaluateCase(c); return { id: c.id, locale: c.appLocale, expect: c.expectIntent, ambiguous: c.ambiguous, top1: r.top1, top3: r.top3, clarified: r.clarified || r.missedClar === false && r.ambiguous, action: r.actualIntent, entity: r.entityResolved, localeMatch: r.localeMatch }; });

    fs.writeFileSync(path.join(OUT, 'by-locale.json'), JSON.stringify(byLoc, null, 2));
    fs.writeFileSync(path.join(OUT, 'adversarial.json'), JSON.stringify(adv, null, 2));
    fs.writeFileSync(path.join(OUT, 'regression-flags.json'), JSON.stringify(flags, null, 2));

    const lines = [
      '# Search Lab — Multilingual Clarification Benchmark', '',
      `Cases: ${cases.length} (${ADVERSARIAL.length} curated adversarial + ${N} generated).`, '',
      '## Metrics by locale', '',
      '| locale | n | intent | top3 | entityRes | clarPrec | clarRecall | unnecClar | noResult | recovery | langMismatch | untransl | avgConf |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
      ...Object.entries(byLoc).map(([l, m]) =>
        `| ${l} | ${m.n} | ${m.intentAccuracy} | ${m.top3Accuracy} | ${m.entityResolution} | ${m.clarificationPrecision} | ${m.clarificationRecall} | ${m.unnecessaryClarRate} | ${m.noResultRate} | ${m.recoverySuccessRate} | ${m.languageMismatchRate} | ${m.untranslatedRate} | ${m.avgConfidence} |`),
      '',
      `## Regression vs English baseline: **${flags.length === 0 ? 'NONE' : flags.length + ' flags'}**`, '',
      ...flags.map((f) => `- [${f.locale}] ${f.issue}: ${f.detail}`),
      '',
      '## Adversarial cases', '',
      ...adv.map((a) => `- ${a.top1 ? '✅' : '❌'} \`${a.id}\` [${a.locale}] expect ${a.expect} → ${a.action ?? 'could_not_identify'}${a.entity === false ? ' · TITLE UNRESOLVED' : ''}${a.localeMatch ? '' : ' · LOCALE MISMATCH'}`),
      '',
    ];
    fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n') + '\n');

    // ── HARD gates ──
    // No shipped locale regresses vs English.
    expect(flags, `regression flags: ${JSON.stringify(flags)}`).toHaveLength(0);
    // Response language always matches the selected app locale.
    for (const [loc, m] of Object.entries(byLoc)) expect(m.languageMismatchRate, `${loc} language mismatch`).toBe(0);
    // Every case recovers (never a bare dead end).
    for (const [loc, m] of Object.entries(byLoc)) expect(m.recoverySuccessRate, `${loc} recovery`).toBe(1);
    // Adversarial: an UNAMBIGUOUS case must classify to its expected intent (top-1).
    // A genuinely AMBIGUOUS case (airing verbs that split live-TV vs upcoming) need
    // only carry the expected reading in its top-3 — the honest behaviour is to
    // surface both and clarify, not to force one.
    for (const a of adv) {
      if (a.ambiguous) expect(a.top3, `adversarial ${a.id} intent in top3`).toBe(true);
      else expect(a.top1, `adversarial ${a.id} intent top1`).toBe(true);
      if (a.entity !== null) expect(a.entity, `adversarial ${a.id} title`).toBe(true);
      expect(a.localeMatch, `adversarial ${a.id} locale`).toBe(true);
    }
  });
});
