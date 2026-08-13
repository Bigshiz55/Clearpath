import { describe, it, expect } from 'vitest';
import { writeEvaluationArtifact, evaluatedCommit } from '../runner/artifacts';
import { join } from 'node:path';
import { classifySearch } from '@/lib/nlu/searchMode';
import { isExactTitle, titleMatchTier } from '@/lib/nlu/titleNormalize';

/**
 * TITLE + PROVIDER SEARCH REGRESSION MATRIX. Thousands of deterministic
 * combinations that prove, at parse level, the architecture that fixes
 * "Gone on BritBox" → "Gone Girl":
 *   • a title-plus-provider query classifies as EXACT_TITLE (never similarity)
 *   • the requested title is extracted cleanly (provider + verbs stripped)
 *   • the provider is extracted and is a HARD filter (soft only when softened)
 *   • an exact one-word title is NEVER an exact match for a longer title
 * A "like X" query classifies as SIMILAR_TO. Seeded (EVAL_SEED, default 7);
 * size via EVAL_CASES (default 3000). No I/O beyond writing the report.
 */
const N = Number(process.env.EVAL_CASES ?? 3000);
const SEED = Number(process.env.EVAL_SEED ?? 7);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(arr: T[], r: () => number): T => arr[Math.floor(r() * arr.length)]!;

const ONE_WORD = ['Gone', 'You', 'From', 'Them', 'Dark', 'Bodies', 'Inside', 'Vigil', 'Ghosts', 'Yellowjackets', 'Severance'];
const MULTI = ['Gone Girl', 'Breaking Bad', 'Better Call Saul', 'The Last Stand', 'Peaky Blinders'];
const PROVIDERS = [
  { phrase: 'BritBox', name: 'BritBox' }, { phrase: 'Netflix', name: 'Netflix' }, { phrase: 'Prime', name: 'Prime Video' },
  { phrase: 'Hulu', name: 'Hulu' }, { phrase: 'Max', name: 'Max' }, { phrase: 'Peacock', name: 'Peacock' },
  { phrase: 'Paramount+', name: 'Paramount+' }, { phrase: 'Apple TV+', name: 'Apple TV+' }, { phrase: 'Disney+', name: 'Disney+' },
  { phrase: 'Hallmark', name: 'Hallmark' }, { phrase: 'Acorn TV', name: 'Acorn TV' }, { phrase: 'Brit Box', name: 'BritBox' },
];
const PREPS = ['on', 'from', 'available on', 'streaming on'];
const VERBS = ['', 'Find ', 'Show me ', 'Is ', 'Watch ', 'I want to watch ', 'Where can I watch '];

interface Case { prompt: string; title: string; provider: string; mode: 'exact_title' | 'similar_to' }

function generate(n: number, seed: number): Case[] {
  const r = mulberry32(seed);
  const out: Case[] = [];
  for (let i = 0; i < n; i++) {
    const title = pick(r() < 0.6 ? ONE_WORD : MULTI, r);
    const prov = pick(PROVIDERS, r);
    const prep = pick(PREPS, r);
    const verb = pick(VERBS, r);
    const similar = r() < 0.25;
    const q = similar
      ? `${verb}shows like ${title} ${prep} ${prov.phrase}`.trim()
      : `${verb}${title} ${prep} ${prov.phrase}`.replace(/\?$/, '').trim() + (verb.startsWith('Is') ? '?' : '');
    out.push({ prompt: q, title, provider: prov.name, mode: similar ? 'similar_to' : 'exact_title' });
  }
  return out;
}


describe(`search matrix (${N} cases)`, () => {
  const cases = generate(N, SEED);
  interface Res { prompt: string; ok: boolean; fails: string[] }
  const results: Res[] = cases.map((c) => {
    const cl = classifySearch(c.prompt);
    const fails: string[] = [];
    if (cl.mode !== c.mode) fails.push(`mode ${cl.mode}≠${c.mode}`);
    if (!cl.requiredProvider || cl.requiredProvider.name !== c.provider) fails.push(`provider ${cl.requiredProvider?.name}≠${c.provider}`);
    if (c.mode === 'exact_title') {
      if (!cl.requestedTitle || !isExactTitle(cl.requestedTitle, c.title)) fails.push(`title "${cl.requestedTitle}"≠"${c.title}"`);
      if (cl.providerStrength !== 'hard') fails.push('provider not hard');
      // Anti-substitution invariant: a one-word title must not be exact-equal to title+word.
      if (isExactTitle(c.title, `${c.title} Girl`)) fails.push('substitution: exact-matched a longer title');
    } else {
      if (!cl.reference) fails.push('similar: no reference');
    }
    return { prompt: c.prompt, ok: fails.length === 0, fails };
  });

  const passed = results.filter((r) => r.ok).length;

  it('produces the matrix report (written only on an explicit refresh)', () => {
    const sha = evaluatedCommit();
    const L = ['# Title+Provider Search Matrix', '', `- Commit \`${sha}\` · Seed ${SEED} · **${passed}/${N} (${((passed / N) * 100).toFixed(1)}%)**`, ''];
    L.push('## Sample failures (first 20)', '');
    for (const r of results.filter((x) => !x.ok).slice(0, 20)) L.push(`- ❌ \`${r.prompt}\` → ${r.fails.join('; ')}`);
    if (passed === N) L.push('None — every case classified, extracted and guarded correctly.');
    expect(L.length).toBeGreaterThan(0);
    writeEvaluationArtifact('search-matrix', 'report.md', L.join('\n'));
    // eslint-disable-next-line no-console
    console.log(`\nSEARCH MATRIX [${sha}] ${N} cases — ${((passed / N) * 100).toFixed(1)}% pass\n`);
    expect(results.length).toBe(N);
  });

  it('classifies mode + extracts title/provider at ≥ 99.5%', () => {
    expect(passed / N).toBeGreaterThanOrEqual(0.995);
  });

  it('NEVER exact-matches a one-word title to a longer title (anti-substitution)', () => {
    for (const t of ONE_WORD) {
      expect(isExactTitle(t, `${t} Girl`), t).toBe(false);
      expect(titleMatchTier(t, `${t} Girl`)).not.toBe('exact');
    }
  });
});
