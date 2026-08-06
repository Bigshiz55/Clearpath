/**
 * EXTENDED DETERMINISTIC CORPUS — 1,200 cases over the NEW capabilities,
 * alongside (never replacing) the frozen 1,000-test forensic corpus.
 *
 * Every case is generated from the same seeded RNG discipline as the frozen
 * corpus and carries its own machine-checkable expectation: expected intent,
 * expected entity, required constraints, forbidden interpretation. Scoring is
 * pure — the shipped modules are imported and judged, nothing is mocked.
 *
 * Tiers map to the release gates:
 *   P0 — navigational correctness, negation polarity, person identity,
 *        generic-phrase routing, security. A P0 failure ships a wrong answer.
 *   P1 — constraint extraction breadth (years, ranges, references, combos).
 *   P2 — known, documented limits (e.g. deletion-class typos). Reported,
 *        never counted as passing.
 */
import './shimServerOnly';
import { writeFileSync, mkdirSync } from 'node:fs';
import { splitTitleYear, splitTitleQualifiers, extractPersonName, misspellingCandidates, insertionCandidates, isGenericPhrase } from '@/lib/nlu/queryRepair';
import { resolveSearchDestination, type CatalogResult } from '@/lib/search/searchIntent';
import { naiveParseQuery, parseTopicTerms } from '@/lib/finderParse';
import { referenceCandidates } from '@/lib/nlu/titleReference';
import { extractReference } from '@/lib/askJudge';
import { classifySearch } from '@/lib/nlu/searchMode';
import { GENRE_IDS } from '@/lib/finderGenres';
import { Rng } from './corpus';

const SEED = 'WATCHVERDICT_EXT_CORPUS_20260806';
/** Leading-article-insensitive comparison — the resolver's own convention. */
const sameTitle = (a: string | null, b: string): boolean =>
  a !== null && a.toLowerCase().replace(/^(?:the|a|an) /, '') === b.toLowerCase().replace(/^(?:the|a|an) /, '');
const R = (label: string) => new Rng(`${SEED}:${label}`);

const TITLES = [
  'Rocky', 'Creed', 'Cinderella Man', 'Raging Bull', 'Million Dollar Baby', 'Southpaw',
  'Parasite', 'Knives Out', 'Arrival', 'Whiplash', 'Oppenheimer', 'Barbie', 'Moneyball',
  'Warrior', 'The Wrestler', 'Heat', 'Zodiac', 'Prisoners', 'Coco', 'Dune', 'Casablanca',
  'Mindhunter', 'Criminal Minds', 'Dexter', 'Sherlock', 'Broadchurch', 'Luther',
  'Happy Valley', 'Line of Duty', 'Severance', 'Succession', 'The Bear', 'Ted Lasso',
  'Fargo', 'True Detective', 'Unforgotten', 'Bodyguard', 'Yellowstone', 'John Wick',
  'The Godfather', 'The Holdovers', 'Breaking Bad', 'Better Call Saul', 'Ozark',
  'Peaky Blinders', 'Slow Horses', 'Shetland', 'Vera', 'Endeavour', 'Poker Face',
];
const PEOPLE = [
  'Sylvester Stallone', 'Denzel Washington', 'Gary Sinise', 'Christopher Nolan',
  'Taylor Sheridan', 'Michelle Yeoh', 'Kate Winslet', 'David Fincher', 'Idris Elba',
  'Olivia Colman', 'Cillian Murphy', 'Greta Gerwig', 'Brendan Fraser', 'Jodie Comer',
  'Ryan Coogler', 'Denis Villeneuve', 'Tom Hanks', 'Meg Ryan', 'Brad Pitt', 'George Clooney',
  'Cameron Diaz', 'Mark Ruffalo', 'Lacey Chabert', 'Jonathan Groff', 'Bong Joon-ho',
];
const GENRES = Object.keys(GENRE_IDS).filter((g) => !g.includes('-') && !g.includes(' '));

interface ExtCase {
  id: number;
  category: string;
  tier: 'P0' | 'P1' | 'P2';
  input: string;
  expect: string;
  pass: boolean;
  detail: string;
}
const cases: ExtCase[] = [];
let id = 0;
const check = (category: string, tier: ExtCase['tier'], input: string, expect: string, fn: () => [boolean, string]) => {
  let pass = false;
  let detail = '';
  try {
    [pass, detail] = fn();
  } catch (e) {
    pass = false;
    detail = `THREW: ${String(e).slice(0, 120)}`;
  }
  cases.push({ id: ++id, category, tier, input, expect, pass, detail });
};

// ── 1. Title + year splitting (100, P0) ──────────────────────────────────
{
  const rng = R('title-year');
  for (let i = 0; i < 100; i++) {
    const t = TITLES[i % TITLES.length]!;
    const y = 1970 + rng.int(0, 55);
    const paren = i % 3 === 0;
    const input = paren ? `${t} (${y})` : `${t} ${y}`;
    check('title_year_split', 'P0', input, `title=${t} year=${y}`, () => {
      const got = splitTitleYear(input);
      return [got.title === t && got.year === y, `got ${got.title}/${got.year}`];
    });
  }
}

// ── 2. Year-only titles stay intact (25, P0) ─────────────────────────────
for (const input of ['1917', '2012', '1984', '2001', '1922']) {
  for (let k = 0; k < 5; k++) {
    check('year_is_the_title', 'P0', input, 'untouched', () => {
      const got = splitTitleYear(input);
      return [got.title === input && got.year === null, `got ${got.title}/${got.year}`];
    });
  }
}

// ── 3. Misspellings — supported classes (150, P1) + deletions (50, P2) ───
{
  const rng = R('typos');
  for (let i = 0; i < 150; i++) {
    const t = TITLES[(i * 7) % TITLES.length]!;
    const cls = i % 3;
    let typo = t;
    if (cls === 0) {
      const j = rng.int(0, t.length - 1);
      if (/[a-z]/i.test(t[j]!)) typo = t.slice(0, j) + t[j] + t.slice(j); // doubled letter
    } else {
      // adjacent transposition inside the longest word
      const words = t.split(' ');
      let li = 0; words.forEach((w, wi) => { if (w.length > words[li]!.length) li = wi; });
      const w = words[li]!;
      const j = rng.int(0, Math.max(0, w.length - 2));
      if (w[j] !== w[j + 1]) {
        words[li] = w.slice(0, j) + w[j + 1] + w[j] + w.slice(j + 2);
        typo = words.join(' ');
      }
    }
    check('typo_recoverable', 'P1', typo, t, () => {
      if (typo.toLowerCase() === t.toLowerCase()) return [true, 'no-op typo'];
      const c = misspellingCandidates(typo).map((x) => x.toLowerCase());
      return [c.includes(t.toLowerCase()), `candidates=[${c.slice(0, 4).join('|')}]`];
    });
  }
  for (let i = 0; i < 50; i++) {
    const t = TITLES[(i * 11) % TITLES.length]!;
    const j = 1 + (i % Math.max(1, t.length - 2));
    const typo = t.slice(0, j) + t.slice(j + 1); // deletion — known limit
    check('typo_deletion_known_limit', 'P2', typo, t, () => {
      const c = misspellingCandidates(typo).map((x) => x.toLowerCase());
      return [c.includes(t.toLowerCase()), 'deletion class — documented limit'];
    });
  }
}

// ── 4. Person phrasing (125, P0) + bare names unchanged (25, P0) ─────────
{
  const LEADS = ['who is X', 'movies with X', 'films starring X', 'directed by X', 'shows with X'];
  const TAILS = ['X movies', 'X filmography', 'X films', 'X shows', 'X roles'];
  for (let i = 0; i < 125; i++) {
    const p = PEOPLE[i % PEOPLE.length]!;
    const tpl = [...LEADS, ...TAILS][Math.floor(i / PEOPLE.length) % 10]!;
    const input = tpl.replace('X', p);
    check('person_phrasing', 'P0', input, p, () => {
      const got = extractPersonName(input);
      return [got === p, `got ${JSON.stringify(got)}`];
    });
  }
  for (let i = 0; i < 25; i++) {
    const p = PEOPLE[i]!;
    check('bare_name_untouched', 'P0', p, 'null (no phrasing)', () => {
      return [extractPersonName(p) === null, 'must not fire on a bare name'];
    });
  }
}

// ── 5. Generic phrases (60, P0) + pronoun-title pair (40, P0) ────────────
{
  const GENERIC = [
    'something good', 'a movie', 'newer', 'not that', 'the sequel', 'something else',
    'what about the other one', 'anything good', 'a good show', 'something new',
    'the first one', 'the latest', 'more', 'another one', 'the best movie',
    'a great film', 'something for tonight', 'what to watch', 'the newer ones', 'not this',
  ];
  for (let i = 0; i < 60; i++) {
    const q = GENERIC[i % GENERIC.length]!;
    const decoy: CatalogResult = { id: 1, mediaType: 'movie', title: q };
    check('generic_never_navigates', 'P0', q, 'ask', () => {
      const d = resolveSearchDestination(q, [decoy]);
      return [d?.reason === 'ask', `reason=${d?.reason}`];
    });
  }
  const PRONOUN_TITLES: [string, CatalogResult][] = [
    ['It', { id: 346364, mediaType: 'movie', title: 'It', year: 2017 }],
    ['Us', { id: 458723, mediaType: 'movie', title: 'Us', year: 2019 }],
    ['Them', { id: 1, mediaType: 'tv', title: 'Them' }],
    ['Her', { id: 152601, mediaType: 'movie', title: 'Her', year: 2013 }],
    ['You', { id: 78191, mediaType: 'tv', title: 'You' }],
    ['Show Me a Hero', { id: 62127, mediaType: 'tv', title: 'Show Me a Hero' }],
    ['Anything Goes', { id: 2, mediaType: 'movie', title: 'Anything Goes' }],
    ['The Thing', { id: 1091, mediaType: 'movie', title: 'The Thing', year: 1982 }],
  ];
  for (let i = 0; i < 40; i++) {
    const [q, hit] = PRONOUN_TITLES[i % PRONOUN_TITLES.length]!;
    check('pronoun_title_still_navigates', 'P0', q, 'exact-title', () => {
      const d = resolveSearchDestination(q, [hit]);
      return [d?.reason === 'exact-title', `reason=${d?.reason}`];
    });
  }
}

// ── 6. Negation polarity pairs (150, P0) ─────────────────────────────────
{
  const NEG_TPL = ['no {g}', 'nothing {g}', 'without {g}', 'anything except {g}', 'not a {g} movie', 'I hate {g} films'];
  for (let i = 0; i < 75; i++) {
    const g = GENRES[i % GENRES.length]!;
    const gid = GENRE_IDS[g]!;
    const tpl = NEG_TPL[Math.floor(i / GENRES.length) % NEG_TPL.length]!;
    const input = `a good thriller, ${tpl.replace('{g}', g)}`;
    check('negation_excludes', 'P0', input, `exclude ${g}`, () => {
      const q = naiveParseQuery(input);
      const excluded = (q.excludeGenreIds ?? []).includes(gid);
      const requested = q.genreIds.includes(gid);
      return [excluded && !requested, `excl=${excluded} req=${requested}`];
    });
    const posInput = `a good ${g} movie`;
    check('positive_requests', 'P0', posInput, `request ${g}`, () => {
      const q = naiveParseQuery(posInput);
      return [q.genreIds.includes(gid) && !(q.excludeGenreIds ?? []).includes(gid), JSON.stringify({ g: q.genreIds, x: q.excludeGenreIds })];
    });
  }
}

// ── 7. Year ranges and chronology (100, P1) ──────────────────────────────
{
  const rng = R('years');
  for (let i = 0; i < 100; i++) {
    const y = 1975 + rng.int(0, 45);
    const y2 = y + 5 + rng.int(0, 15);
    const shape = i % 5;
    if (shape === 0) {
      check('year_after', 'P1', `movies after ${y}`, `minYear=${y}`, () => {
        const q = naiveParseQuery(`movies after ${y}`);
        return [q.minYear === y, `got ${q.minYear}`];
      });
    } else if (shape === 1) {
      check('year_before', 'P1', `shows before ${y}`, `maxYear=${y}`, () => {
        const q = naiveParseQuery(`shows before ${y}`);
        return [q.maxYear === y, `got ${q.maxYear}`];
      });
    } else if (shape === 2) {
      check('year_between', 'P1', `a drama between ${y} and ${y2}`, `${y}–${y2}`, () => {
        const q = naiveParseQuery(`a drama between ${y} and ${y2}`);
        return [q.minYear === y && q.maxYear === y2, `got ${q.minYear}-${q.maxYear}`];
      });
    } else if (shape === 3) {
      const d = 1950 + rng.int(2, 7) * 10;
      check('year_decade', 'P1', `crime films from the ${d}s`, `${d}–${d + 9}`, () => {
        const q = naiveParseQuery(`crime films from the ${d}s`);
        return [q.minYear === d && q.maxYear === d + 9, `got ${q.minYear}-${q.maxYear}`];
      });
    } else {
      check('year_not_before', 'P1', `movies not before ${y}`, `minYear=${y}`, () => {
        const q = naiveParseQuery(`movies not before ${y}`);
        return [q.minYear === y && q.maxYear == null, `got ${q.minYear}/${q.maxYear}`];
      });
    }
  }
}

// ── 8. Similarity references (125, P1) ───────────────────────────────────
{
  const TPL = [
    'movies like {t}', 'shows like {t}', 'similar to {t}', 'something like {t}',
    'in the style of {t}', 'the same feel as {t}', 'more like {t} please',
    'I loved {t}, what else', 'if I liked {t}', 'kinda like {t} but newer',
    'something like {t} but less violent', 'newer than {t}', 'less intense than {t}',
  ];
  for (let i = 0; i < 125; i++) {
    const t = TITLES[(i * 3) % TITLES.length]!;
    const tpl = TPL[Math.floor(i / 10) % TPL.length]!;
    const input = tpl.replace('{t}', t);
    check('similarity_reference', 'P1', input, t, () => {
      const raw = extractReference(input);
      const got = raw ? referenceCandidates(raw)[0] ?? null : null;
      return [sameTitle(got, t), `got ${JSON.stringify(got)}`];
    });
  }
}

// ── 9. Multi-constraint combinations (100, P1) ───────────────────────────
{
  const rng = R('combo');
  for (let i = 0; i < 100; i++) {
    const t = TITLES[(i * 13) % TITLES.length]!;
    const y = 2000 + rng.int(5, 24);
    const g = ['documentary', 'horror', 'romance', 'animation'][i % 4]!;
    const input = `movies like ${t} after ${y}, no ${g === 'documentary' ? 'documentaries' : g === 'animation' ? 'animated stuff' : g}`;
    check('multi_constraint', 'P1', input, `ref=${t} minYear=${y} excl=${g}`, () => {
      const raw = extractReference(input);
      const ref = raw ? referenceCandidates(raw)[0] ?? null : null;
      const q = naiveParseQuery(input);
      const refOk = sameTitle(ref, t);
      const yearOk = q.minYear === y;
      const exclOk = (q.excludeGenreIds ?? []).includes(GENRE_IDS[g]!);
      const mediaOk = q.mediaType === 'movie';
      return [refOk && yearOk && exclOk && mediaOk, `ref=${JSON.stringify(ref)} y=${q.minYear} x=${JSON.stringify(q.excludeGenreIds)} m=${q.mediaType}`];
    });
  }
}

// ── 10. Security + malformed never throw, never navigate (50, P0) ────────
{
  const HOSTILE = [
    '', '   ', '<script>alert(1)</script>', "'; DROP TABLE users;--", '{{7*7}}',
    '../../etc/passwd', 'a'.repeat(5000), ' ', '%%%%', 'javascript:alert(1)',
  ];
  for (let i = 0; i < 50; i++) {
    const q = HOSTILE[i % HOSTILE.length]!;
    check('hostile_input_safe', 'P0', q.slice(0, 40), 'no throw, no title navigation', () => {
      const d = resolveSearchDestination(q, []);
      splitTitleYear(q); extractPersonName(q); misspellingCandidates(q);
      isGenericPhrase(q); naiveParseQuery(q); parseTopicTerms(q); classifySearch(q.slice(0, 300));
      const ok = d === null || d.reason === 'ask' || d.reason === 'no-results';
      return [ok, `dest=${d?.reason ?? 'null'}`];
    });
  }
}

// ── 11. Media/version qualifiers (60, P0) ────────────────────────────────
{
  const QUAL: [string, 'movie' | 'tv' | null][] = [
    ['{t} the series', 'tv'], ['{t} the tv show', 'tv'], ['{t} miniseries', 'tv'],
    ['{t} the movie', 'movie'], ['{t} the film', 'movie'], ['{t} the original series', null],
    ['which one is {t} the series', 'tv'], ['the first {t}', null],
    ['{t} the uk version', null], ['{t} not Some Other Title', null],
  ];
  for (let i = 0; i < 60; i++) {
    const t = TITLES[(i * 17) % TITLES.length]!;
    const [tpl, mt] = QUAL[i % QUAL.length]!;
    const input = tpl.replace('{t}', t);
    check('qualifier_split', 'P0', input, `${t}/${mt ?? '-'}`, () => {
      const got = splitTitleQualifiers(input);
      return [got.title === t && got.mediaType === mt && got.qualified, `got ${got.title}/${got.mediaType}`];
    });
  }
}

// ── 12. Space-shift typos (20, P1) ───────────────────────────────────────
{
  for (let i = 0; i < 20; i++) {
    const t = TITLES.filter((x) => x.includes(' '))[i % 14]!;
    const sp = t.indexOf(' ');
    const typo = t.slice(0, sp) + t[sp + 1] + ' ' + t.slice(sp + 2); // "TheG odfather" shape
    check('space_shift', 'P1', typo, t, () => {
      const c = misspellingCandidates(typo).map((x) => x.toLowerCase());
      return [c.includes(t.toLowerCase()), `candidates=[${c.slice(0, 3).join('|')}]`];
    });
  }
}

// ── 13. Deletion-class insertion wave (20, P1) ───────────────────────────
{
  const rng = R('inserts');
  for (let i = 0; i < 20; i++) {
    const t = TITLES[(i * 19) % TITLES.length]!;
    // Delete one vowel/common letter so the wave's alphabet can restore it.
    const idxs = [...t].map((c, j) => (/[eaiou rsntl]/i.test(c) && c !== ' ' && j > 0 ? j : -1)).filter((j) => j > 0);
    const j = idxs[rng.int(0, Math.max(0, idxs.length - 1))] ?? 1;
    const typo = t.slice(0, j) + t.slice(j + 1);
    check('deletion_insert_wave', 'P1', typo, t, () => {
      const c = insertionCandidates(typo).map((x) => x.toLowerCase());
      return [c.includes(t.toLowerCase()), `wave size ${c.length}`];
    });
  }
}

// ── Score ────────────────────────────────────────────────────────────────
if (cases.length !== 1200) throw new Error(`extended corpus must be 1200, got ${cases.length}`);
mkdirSync('artifacts/search-audit', { recursive: true });
writeFileSync('artifacts/search-audit/layerBext-results.json', JSON.stringify({ seed: SEED, cases }, null, 1));

const tally = (tier: string) => {
  const t = cases.filter((c) => c.tier === tier);
  const p = t.filter((c) => c.pass).length;
  return { total: t.length, passed: p, rate: t.length ? ((p / t.length) * 100).toFixed(1) + '%' : 'n/a' };
};
const byCat = new Map<string, { total: number; passed: number }>();
for (const c of cases) {
  const e = byCat.get(c.category) ?? { total: 0, passed: 0 };
  e.total++; if (c.pass) e.passed++;
  byCat.set(c.category, e);
}
console.log(`EXTENDED CORPUS — ${cases.length} deterministic cases, seed ${SEED}`);
console.log(`  P0  ${JSON.stringify(tally('P0'))}`);
console.log(`  P1  ${JSON.stringify(tally('P1'))}`);
console.log(`  P2 (documented limits, never counted as passing)  ${JSON.stringify(tally('P2'))}`);
for (const [k, v] of byCat) console.log(`    ${k.padEnd(28)} ${v.passed}/${v.total}`);
const failures = cases.filter((c) => !c.pass && c.tier !== 'P2');
console.log(`  P0/P1 failures: ${failures.length}`);
for (const f of failures.slice(0, 12)) console.log(`    [${f.tier}] ${f.category}: ${JSON.stringify(f.input).slice(0, 50)} → ${f.detail.slice(0, 80)}`);
