/**
 * FROZEN SEARCH-INTENT ADVERSARIAL CORPUS — v1 (2026-08-06).
 *
 * Versioning rule: APPEND-ONLY. Never edit or delete a case to make a run
 * pass. The corpus is generated from fixed vocabularies, so it is fully
 * deterministic; the meta test at the bottom proves the size (≥1,000 cases).
 *
 * What it defends:
 *  1. A bare genre/subject/provider/network word is a BROWSE, never a title.
 *  2. A title that merely CONTAINS such a word is still a title.
 *  3. The exact-title protect list (You/Her/It/Us/…) never loses to routing.
 *  4. Sentences go to the Judge; misspelled providers never fake an intent.
 *  5. Junk never produces a lexical intent.
 */
import { describe, it, expect } from 'vitest';
import { lexicalIntent, resolveSearchDestination, type CatalogResult } from '@/lib/search/searchIntent';
import { GENRE_WORDS, SUBJECT_TERMS } from '@/lib/finderParse';

interface Case {
  q: string;
  kind: 'genre' | 'subject' | 'provider' | 'network' | 'not-lexical';
  /** For not-lexical cases: the destination reason we additionally require. */
  reason?: string;
  results?: CatalogResult[];
}

const cases: Case[] = [];

// ── 1. Bare genre words: canonical + aliases × phrasings ────────────────────
const GENRE_TERMS = Object.keys(GENRE_WORDS);
const phrasings = (w: string) => [
  w,
  w.toUpperCase(),
  w.charAt(0).toUpperCase() + w.slice(1),
  `${w} `,
  ` ${w}`,
  `${w}.`,
];
for (const g of GENRE_TERMS) {
  for (const p of phrasings(g)) cases.push({ q: p, kind: 'genre' });
  // real plural forms (words already plural, like the alias "docs", stay as-is)
  if (!g.endsWith('s')) cases.push({ q: g.endsWith('y') ? `${g.slice(0, -1)}ies` : `${g}s`, kind: 'genre' });
}

// ── 2. Bare subject words ───────────────────────────────────────────────────
for (const s of SUBJECT_TERMS) {
  for (const p of phrasings(s).slice(0, 4)) cases.push({ q: p, kind: 'subject' });
}

// ── 3. Providers and networks (canonical + aliases) ─────────────────────────
const PROVIDERS = [
  'netflx',
  'netflix', 'hulu', 'peacock', 'paramount+', 'paramount plus', 'max', 'hbo max',
  'disney+', 'disney plus', 'apple tv+', 'britbox', 'acorn tv', 'acorn', 'tubi',
  'prime video', 'amazon prime',
];
const NETWORKS = ['hallmark', 'hallmark channel', 'lifetime', 'lifetime movie network', 'lmn', 'hbo', 'amc', 'fx', 'tnt'];
for (const p of PROVIDERS) for (const v of phrasings(p).slice(0, 4)) cases.push({ q: v, kind: 'provider' });
for (const n of NETWORKS) for (const v of phrasings(n).slice(0, 4)) cases.push({ q: v, kind: 'network' });

// ── 4. Exact-title protect list — these words are NOT vocabulary, and an
//      exact catalog match must win the routing. ────────────────────────────
const PROTECT: [string, CatalogResult][] = [
  ['You', { id: 1, mediaType: 'tv', title: 'You' }],
  ['Her', { id: 2, mediaType: 'movie', title: 'Her' }],
  ['It', { id: 3, mediaType: 'movie', title: 'It' }],
  ['Us', { id: 4, mediaType: 'movie', title: 'Us' }],
  ['Them', { id: 5, mediaType: 'tv', title: 'Them' }],
  ['Show Me a Hero', { id: 6, mediaType: 'tv', title: 'Show Me a Hero' }],
  ['CSI: NY', { id: 7, mediaType: 'tv', title: 'CSI: NY' }],
  ['Cinderella Man', { id: 8, mediaType: 'movie', title: 'Cinderella Man' }],
  ['Heat', { id: 9, mediaType: 'movie', title: 'Heat' }],
  ['Crash', { id: 10, mediaType: 'movie', title: 'Crash' }],
  ['The Wire', { id: 11, mediaType: 'tv', title: 'The Wire' }],
  ['Se7en', { id: 12, mediaType: 'movie', title: 'Se7en' }],
];
for (const [q, r] of PROTECT) cases.push({ q, kind: 'not-lexical', reason: 'exact-title', results: [r] });

// ── 5. Titles that merely CONTAIN a vocabulary word stay titles ─────────────
const SUFFIXES = ['Story', 'Night', 'Squad', 'City', 'Family', 'Games', 'Scene', 'Boys'];
const CONTAIN_WORDS = ['Crime', 'Comedy', 'Horror', 'Action', 'Boxing', 'Mystery'];
for (const w of CONTAIN_WORDS) {
  for (const s of SUFFIXES) {
    const title = `${w} ${s}`;
    cases.push({
      q: title,
      kind: 'not-lexical',
      reason: 'exact-title',
      results: [{ id: 100, mediaType: 'movie', title }],
    });
  }
}

// ── 6. Sentences go to the Judge, not to a lexical browse ───────────────────
const SENTENCES = [
  'British detective shows',
  'crime shows from the 90s',
  'funny movies on Hulu',
  'boxing movies after 2020',
  'best horror on Netflix',
  'something like Fargo but funnier',
  'comedies under 90 minutes',
  'shows my whole family can watch',
  'true crime documentaries from the last 2 years',
  'movies with Tom Hanks on Peacock',
];
for (const s of SENTENCES) cases.push({ q: s, kind: 'not-lexical', reason: 'ask' });
// Generated sentence templates over every genre term — each must go to the
// Judge deliberately, whatever the vocabulary word is.
for (const g of GENRE_TERMS) {
  cases.push({ q: `${g} shows from the 90s`, kind: 'not-lexical', reason: 'ask' });
  cases.push({ q: `best ${g} on Netflix`, kind: 'not-lexical', reason: 'ask' });
  cases.push({ q: `${g} movies under 2 hours`, kind: 'not-lexical', reason: 'ask' });
}
// Subject-led sentences too.
for (const s of SUBJECT_TERMS) {
  cases.push({ q: `${s} movies under 2 hours`, kind: 'not-lexical', reason: 'ask' });
  cases.push({ q: `three ${s} movies`, kind: 'not-lexical', reason: 'ask' });
  cases.push({ q: `${s} shows worth watching`, kind: 'not-lexical', reason: 'ask' });
}
// 'The <Word> <Suffix>' title forms stay titles as well.
for (const w of CONTAIN_WORDS) {
  for (const s of SUFFIXES) {
    const title = `The ${w} ${s}`;
    cases.push({ q: title, kind: 'not-lexical', reason: 'exact-title', results: [{ id: 101, mediaType: 'tv', title }] });
  }
}

// ── 7. Misspelled providers never fake an intent (repair handles them) ──────
// 'Netflx' is a CURATED alias in the ontology (deliberate misspelling
// support) and correctly resolves as a provider — listed above, not here.
const MISSPELLED = ['Hulo', 'Peacok', 'Paramout Plus', 'Dinsey+', 'Acron TV'];
for (const m of MISSPELLED) cases.push({ q: m, kind: 'not-lexical' });

// ── 8. Junk and hostile input ───────────────────────────────────────────────
const JUNK = ['🎄', '🎄🎄🎄', '???', '!!!', '   ', '<script>alert(1)</script>', '​​', 'a'.repeat(200), '....', '@#$%'];
for (const j of JUNK) cases.push({ q: j, kind: 'not-lexical' });

// ── Execution ───────────────────────────────────────────────────────────────
describe('frozen intent corpus v1', () => {
  const byKind = new Map<string, Case[]>();
  for (const c of cases) {
    const arr = byKind.get(c.kind) ?? [];
    arr.push(c);
    byKind.set(c.kind, arr);
  }

  for (const [kind, group] of byKind) {
    it(`${kind}: all ${group.length} cases classify and route correctly`, () => {
      const failures: string[] = [];
      for (const c of group) {
        const lex = lexicalIntent(c.q);
        if (c.kind === 'not-lexical') {
          if (lex != null) {
            failures.push(`${JSON.stringify(c.q)} → unexpected lexical ${lex.kind}`);
            continue;
          }
          if (c.reason) {
            const d = resolveSearchDestination(c.q, c.results ?? []);
            if (d?.reason !== c.reason) failures.push(`${JSON.stringify(c.q)} → ${d?.reason ?? 'null'}, wanted ${c.reason}`);
          }
        } else {
          if (lex?.kind !== c.kind) {
            failures.push(`${JSON.stringify(c.q)} → ${lex?.kind ?? 'null'}, wanted ${c.kind}`);
            continue;
          }
          const d = resolveSearchDestination(c.q, []);
          if (d?.reason !== c.kind) failures.push(`${JSON.stringify(c.q)} destination → ${d?.reason ?? 'null'}`);
        }
      }
      expect(failures, failures.slice(0, 12).join('\n')).toEqual([]);
    });
  }

  it('meta: the corpus holds at least 1,000 cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(1000);
  });
});
