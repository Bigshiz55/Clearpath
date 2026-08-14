import { describe, it, expect } from 'vitest';
import { writeEvaluationArtifact, evaluatedCommit } from '../runner/artifacts';
import { join } from 'node:path';
import { normalize } from '../normalize/normalize';
import type { NormalizedQuery } from '../contract';

/**
 * INDEPENDENT ADVERSARIAL SEMANTIC SUITE.
 *
 * Deliberately authored SEPARATELY from the combinatorial generator: every
 * prompt AND its expected outcome are hand-written here, and the oracle
 * (`must` / `mustNot` predicates) is inline — it shares no code with the
 * generator's expectation-derivation, so the generator cannot "grade itself".
 *
 * Each case is a difficult category the product must not silently mishandle:
 * contradictions, impossible combinations, ambiguous provider names,
 * misspellings, same-name titles, movie/TV ambiguity, country-vs-language,
 * original-language-vs-audio, provider-vs-network, similarity+hard-constraints,
 * negative constraints, and zero-truthful-match requests.
 *
 * `mustNot` rules are as important as `must`: they assert the engine does NOT
 * fabricate a constraint the wording never justified (e.g. reading "English"
 * as a British origin, or inventing a platform for the ambiguous word
 * "Paramount"). A silent, honest "no constraint" beats a confident wrong one.
 *
 * Runs the REAL parser translation offline (no secrets). Live availability /
 * title resolution are a separate, key-gated layer and are NOT asserted here.
 */

type Rule = { label: string; ok: (q: NormalizedQuery) => boolean };
interface AdvCase {
  id: string;
  category: string;
  prompt: string;
  must: Rule[];
  mustNot: Rule[];
  /** A documented weakness we assert the SAFE fallback for, not full resolution. */
  note?: string;
}

const has = (arr: string[], v: string) => arr.map((x) => x.toLowerCase()).includes(v.toLowerCase());
const platIds = (q: NormalizedQuery) => q.platforms.map((p) => p.id);

const CASES: AdvCase[] = [
  // ── Contradictory requests ────────────────────────────────────────────────
  {
    id: 'adv-contradiction-years', category: 'contradiction',
    prompt: 'A 2026 movie from 1985.',
    must: [{ label: 'flags a date contradiction', ok: (q) => q.ambiguities.some((a) => /date|year/i.test(a)) }],
    mustNot: [],
  },
  {
    id: 'adv-contradiction-audio', category: 'contradiction',
    prompt: 'English audio required, but original-language audio only.',
    must: [{ label: 'flags an audio contradiction', ok: (q) => q.ambiguities.some((a) => /audio/i.test(a)) }],
    mustNot: [],
  },
  // ── Impossible combinations ───────────────────────────────────────────────
  {
    id: 'adv-impossible-hallmark-violence', category: 'impossible',
    prompt: 'A Hallmark movie exactly as violent as The Silence of the Lambs.',
    must: [
      { label: 'flags the catalog contradiction', ok: (q) => q.ambiguities.some((a) => /catalog|violen/i.test(a)) },
      { label: 'still captures the Hallmark network', ok: (q) => has(q.networks, 'hallmark') },
    ],
    mustNot: [],
  },
  // ── Ambiguous provider names (SAFE fallback: never fabricate a wrong one) ──
  {
    id: 'adv-ambiguous-paramount', category: 'ambiguous_provider',
    prompt: 'A Paramount movie.',
    note: 'Bare "Paramount" is the studio OR Paramount+. Conservative detector returns no platform rather than a wrong one.',
    must: [{ label: 'commits to movie', ok: (q) => has(q.contentTypes, 'movie') }],
    mustNot: [
      { label: 'does not invent Netflix/Prime/Hulu/Max/Disney', ok: (q) => !platIds(q).some((id) => [8, 9, 15, 1899, 337].includes(id)) },
    ],
  },
  {
    id: 'adv-ambiguous-apple', category: 'ambiguous_provider',
    prompt: 'An Apple show.',
    note: 'Bare "Apple" (the company) must not silently become a platform filter without an "on"/"TV+" cue.',
    must: [{ label: 'treats it as tv', ok: (q) => has(q.contentTypes, 'tv') }],
    mustNot: [
      { label: 'does not fabricate an unrelated platform', ok: (q) => !platIds(q).some((id) => [8, 9, 15, 1899, 337].includes(id)) },
    ],
  },
  {
    id: 'adv-ambiguous-apple-explicit', category: 'ambiguous_provider',
    prompt: 'A sci-fi show on Apple TV+.',
    must: [{ label: 'resolves Apple TV+ when explicit', ok: (q) => has(platIds(q).map(String), '350') }],
    mustNot: [],
  },
  // ── Misspellings ──────────────────────────────────────────────────────────
  {
    id: 'adv-misspell-netflix', category: 'misspelling',
    prompt: 'A Korean thriler on Netflx under two hours.',
    must: [
      { label: 'resolves misspelled Netflix', ok: (q) => has(platIds(q).map(String), '8') },
      { label: 'keeps Korean origin', ok: (q) => has(q.originCountries, 'KR') },
      { label: 'keeps the 2-hour runtime cap', ok: (q) => q.runtimeMaxMinutes === 120 },
    ],
    mustNot: [],
  },
  // ── Multiple titles with the same name (SAFE: no fabricated constraints) ──
  {
    id: 'adv-samename-fargo', category: 'same_name_title',
    prompt: 'Fargo.',
    note: 'Fargo is a 1996 film AND a TV series. Offline the bare title resolves nothing; live disambiguation + a clarifying prompt are the retrieval layer’s job. Assert only that nothing false is invented.',
    must: [],
    mustNot: [
      { label: 'does not fabricate an origin', ok: (q) => q.originCountries.length === 0 },
      { label: 'does not fabricate a platform/network', ok: (q) => q.platforms.length === 0 && q.networks.length === 0 },
    ],
  },
  // ── Movie vs TV ambiguity (explicit negation must be honored) ─────────────
  {
    id: 'adv-movie-not-series', category: 'movie_tv_ambiguity',
    prompt: 'Show me Fargo the movie, not the series.',
    must: [
      { label: 'keeps movie', ok: (q) => has(q.contentTypes, 'movie') },
      { label: 'drops the ruled-out series', ok: (q) => !has(q.contentTypes, 'tv') },
    ],
    mustNot: [],
  },
  // ── Country vs language confusion ─────────────────────────────────────────
  {
    id: 'adv-english-is-language', category: 'country_vs_language',
    prompt: 'An English movie.',
    note: '"English" is a LANGUAGE cue, not necessarily British ORIGIN — must not force GB origin.',
    must: [{ label: 'commits to movie', ok: (q) => has(q.contentTypes, 'movie') }],
    mustNot: [
      { label: 'does not force a GB origin from the word "English"', ok: (q) => !has(q.originCountries, 'GB') },
    ],
  },
  {
    id: 'adv-british-is-origin', category: 'country_vs_language',
    prompt: 'A recent British detective series without supernatural elements.',
    must: [
      { label: 'reads British as GB origin', ok: (q) => has(q.originCountries, 'GB') },
      { label: 'keeps the supernatural exclusion', ok: (q) => has(q.excludedAttributes, 'supernatural') },
    ],
    mustNot: [],
  },
  // ── Original language vs available audio ─────────────────────────────────
  {
    id: 'adv-origlang-vs-audio', category: 'origlang_vs_audio',
    prompt: 'A movie in Spanish with English audio.',
    must: [
      { label: 'original language / origin is Spanish', ok: (q) => has(q.originCountries, 'ES') || has(q.originalLanguages, 'es') },
      { label: 'English audio is a hard requirement', ok: (q) => q.englishAudioRequired === true },
    ],
    mustNot: [],
  },
  // ── Provider vs production network ────────────────────────────────────────
  {
    id: 'adv-network-hbo', category: 'provider_vs_network',
    prompt: 'An HBO show.',
    must: [
      { label: 'recognizes HBO as a network', ok: (q) => has(q.networks, 'hbo') },
      { label: 'commits to tv', ok: (q) => has(q.contentTypes, 'tv') },
    ],
    mustNot: [],
  },
  {
    id: 'adv-platform-hulu', category: 'provider_vs_network',
    prompt: 'A movie on Hulu.',
    must: [{ label: 'resolves the Hulu platform', ok: (q) => has(platIds(q).map(String), '15') }],
    mustNot: [],
  },
  // ── Similarity + hard constraints ─────────────────────────────────────────
  {
    id: 'adv-similar-plus-hard', category: 'similarity_plus_hard',
    prompt: 'A movie like Rocky on Prime, not animated.',
    must: [
      { label: 'intent is similar_to', ok: (q) => q.normalizedIntent === 'similar_to' },
      { label: 'keeps the Prime platform', ok: (q) => has(platIds(q).map(String), '9') },
      { label: 'keeps the no-animation exclusion', ok: (q) => has(q.excludedAttributes, 'animation') },
    ],
    mustNot: [],
  },
  // ── Negative constraints ──────────────────────────────────────────────────
  {
    id: 'adv-negatives-stack', category: 'negative_constraints',
    prompt: 'A recent thriller, no animation, not slow, no supernatural.',
    must: [
      { label: 'excludes animation', ok: (q) => has(q.excludedAttributes, 'animation') },
      { label: 'excludes slow burn', ok: (q) => has(q.excludedAttributes, 'slow_burn') },
      { label: 'excludes supernatural', ok: (q) => has(q.excludedAttributes, 'supernatural') },
    ],
    mustNot: [],
  },
  // ── Requests where zero truthful matches exist ───────────────────────────
  {
    id: 'adv-zero-match', category: 'zero_match',
    prompt: 'A live-action documentary about real unicorns filmed on Mars.',
    note: 'Impossible-to-satisfy at the CATALOG level; an honest no-match must come from the (live) retrieval layer, never a fabricated title. Offline: assert nothing false is minted.',
    must: [{ label: 'recognizes documentary type', ok: (q) => has(q.contentTypes, 'documentary') }],
    mustNot: [
      { label: 'invents no reference title', ok: (q) => q.watchTitle === null },
      { label: 'invents no origin/platform/network', ok: (q) => q.originCountries.length === 0 && q.platforms.length === 0 && q.networks.length === 0 },
    ],
  },
];

interface AdvResult { id: string; category: string; prompt: string; pass: boolean; failures: string[]; note?: string }


describe('independent adversarial semantic suite', () => {
  const results: AdvResult[] = CASES.map((c) => {
    const q = normalize(c.prompt);
    const failures: string[] = [];
    for (const r of c.must) if (!r.ok(q)) failures.push(`MUST ${r.label}`);
    for (const r of c.mustNot) if (!r.ok(q)) failures.push(`MUST NOT ${r.label}`);
    return { id: c.id, category: c.category, prompt: c.prompt, pass: failures.length === 0, failures, note: c.note };
  });

  it('produces the adversarial report (written only on an explicit refresh)', () => {
    const sha = evaluatedCommit();
    const passed = results.filter((r) => r.pass).length;
    const L: string[] = ['# Independent Adversarial Semantic Suite', ''];
    L.push(`- Commit \`${sha}\` · ${passed}/${results.length} passed`);
    L.push('- Expectations hand-authored here; oracle shares no code with the generator.', '');
    const byCat = new Map<string, AdvResult[]>();
    for (const r of results) { const a = byCat.get(r.category) ?? []; a.push(r); byCat.set(r.category, a); }
    for (const [cat, rs] of byCat) {
      L.push(`## ${cat}`, '');
      for (const r of rs) {
        L.push(`- ${r.pass ? '✅' : '❌'} \`${r.prompt}\`${r.failures.length ? ` — ${r.failures.join('; ')}` : ''}`);
        if (r.note) L.push(`  - _${r.note}_`);
      }
      L.push('');
    }
    expect(L.length).toBeGreaterThan(0);
    writeEvaluationArtifact('adversarial', 'report.md', L.join('\n'));
    writeEvaluationArtifact('adversarial', 'summary.json', JSON.stringify({ sha, total: results.length, passed, results }, null, 2));
    expect(results.length).toBe(CASES.length);
  });

  // Each case is its own assertion so a regression names the exact prompt.
  for (const c of CASES) {
    it(`[${c.category}] ${c.prompt}`, () => {
      const q = normalize(c.prompt);
      for (const r of c.must) expect(r.ok(q), `MUST ${r.label}`).toBe(true);
      for (const r of c.mustNot) expect(r.ok(q), `MUST NOT ${r.label}`).toBe(true);
    });
  }
});
