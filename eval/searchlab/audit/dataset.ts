/**
 * Expanded identity & resolution AUDIT dataset — a substantially larger,
 * human-reviewed set than the initial calibration sample, targeting the title
 * IDENTITY layer (resolution matching + canonical/franchise identity + the
 * similarity gate's abstain behaviour) rather than only seed→candidate similarity.
 *
 * Every case carries an explicit human judgment (`expected`) and the metadata the
 * review requires. Cases exercise PURE functions only (titleMatches / canonicalKey
 * / franchiseAssessment / qualify), so the audit is fully deterministic and offline
 * — no TMDB/network. The live seed-resolution step (searchTitles → matches[0]) is
 * out of scope here because it needs TMDB; its deterministic core, `titleMatches`,
 * IS audited directly.
 *
 * Guiding principle (matches the brief): be conservative about FALSE POSITIVES. An
 * honest "no confident match" (review) is preferable to presenting the wrong title.
 */
import type { SeedTitle } from '@/lib/search/titleDna';

export type AuditCategory =
  | 'exact_match' | 'remake' | 'reboot' | 'sequel' | 'prequel' | 'franchise_collection'
  | 'tv_vs_movie' | 'punctuation' | 'subtitle' | 'alternate_title' | 'international_title'
  | 'close_but_wrong' | 'title_with_year' | 'one_word' | 'obscure' | 'tmdb_conflict'
  | 'no_confident_match';

/** accept = confidently the intended/related title; reject = confidently NOT;
 *  review = genuinely ambiguous, the honest answer is "no confident close match". */
export type Decision = 'accept' | 'reject' | 'review';

export interface ResolutionCase {
  kind: 'resolution';
  id: string;
  category: AuditCategory;
  query: string;          // what the user typed
  candidate: string;      // a TMDB result title under test
  expectedCanonical: string; // the canonical result a human expects
  expected: Decision;
  note?: string;
}
export interface IdentityCase {
  kind: 'identity';
  id: string;
  category: AuditCategory;
  query: string;
  seed: SeedTitle;
  candidate: SeedTitle;
  expectedCanonical: string;
  expectedRelation: 'same_canonical' | 'canonical_duplicate' | 'franchise' | 'similar' | 'unknown';
  expected: Decision;
  note?: string;
}
export interface SimilarityCase {
  kind: 'similarity';
  id: string;
  category: AuditCategory;
  query: string;
  seed: SeedTitle;
  candidate: SeedTitle & { personalScore?: number };
  expectedCanonical: string;
  expected: Decision;
  note?: string;
}
export type AuditCase = ResolutionCase | IdentityCase | SimilarityCase;

// Compact SeedTitle builder.
let auto = 5000;
function T(o: Partial<SeedTitle> & { title: string }): SeedTitle {
  return {
    canonicalId: `${o.mediaType ?? 'movie'}:${o.title}:${o.year ?? ''}`,
    tmdbId: o.tmdbId ?? auto++, title: o.title, year: o.year ?? 2000, mediaType: o.mediaType ?? 'movie',
    genres: o.genres ?? [], keywords: o.keywords ?? [], dims: o.dims ?? {}, collectionId: o.collectionId ?? null,
    dimsConfidence: o.dimsConfidence ?? 0.9,
  };
}

const R = (id: string, category: AuditCategory, query: string, candidate: string, expected: Decision, expectedCanonical: string, note?: string): ResolutionCase =>
  ({ kind: 'resolution', id, category, query, candidate, expected, expectedCanonical, note });
const I = (id: string, category: AuditCategory, query: string, seed: SeedTitle, candidate: SeedTitle, rel: IdentityCase['expectedRelation'], expected: Decision, expectedCanonical: string, note?: string): IdentityCase =>
  ({ kind: 'identity', id, category, query, seed, candidate, expectedRelation: rel, expected, expectedCanonical, note });
const S = (id: string, category: AuditCategory, query: string, seed: SeedTitle, candidate: SeedTitle & { personalScore?: number }, expected: Decision, expectedCanonical: string, note?: string): SimilarityCase =>
  ({ kind: 'similarity', id, category, query, seed, candidate, expected, expectedCanonical, note });

export const AUDIT_CASES: AuditCase[] = [
  // ── exact matches ─────────────────────────────────────────────────────────
  R('exact-inception', 'exact_match', 'Inception', 'Inception', 'accept', 'Inception (2010)'),
  R('exact-thematrix', 'exact_match', 'The Matrix', 'The Matrix', 'accept', 'The Matrix (1999)'),
  R('exact-case', 'exact_match', 'the godfather', 'The Godfather', 'accept', 'The Godfather (1972)'),
  R('exact-parasite', 'exact_match', 'Parasite', 'Parasite', 'accept', 'Parasite (2019)'),

  // ── punctuation / spacing differences ──────────────────────────────────────
  R('punct-spiderman', 'punctuation', 'Spiderman', 'Spider-Man', 'accept', 'Spider-Man (2002)', 'hyphen + spacing'),
  R('punct-wall-e', 'punctuation', 'Wall E', 'WALL·E', 'accept', 'WALL·E (2008)', 'interpunct'),
  R('punct-ferris', 'punctuation', "Ferris Buellers Day Off", "Ferris Bueller's Day Off", 'accept', "Ferris Bueller's Day Off (1986)", 'apostrophe'),
  R('punct-catch22', 'punctuation', 'Catch 22', 'Catch-22', 'accept', 'Catch-22', 'hyphen vs space'),

  // ── subtitles ──────────────────────────────────────────────────────────────
  R('sub-madmax', 'subtitle', 'Mad Max', 'Mad Max: Fury Road', 'accept', 'Mad Max (franchise/title-prefix)', 'query is a leading token run'),
  R('sub-star-wars', 'subtitle', 'Star Wars', 'Star Wars: The Force Awakens', 'accept', 'Star Wars (prefix)'),
  R('sub-fury-road', 'subtitle', 'Fury Road', 'Mad Max: Fury Road', 'accept', 'Mad Max: Fury Road', 'trailing token run'),
  R('sub-lotr', 'subtitle', 'The Lord of the Rings', 'The Lord of the Rings: The Two Towers', 'accept', 'LOTR (prefix)'),

  // ── international / alternate titles ───────────────────────────────────────
  R('intl-amelie', 'international_title', 'Amelie', 'Amélie', 'accept', 'Amélie (2001)', 'diacritic fold'),
  R('intl-amelie-accent', 'international_title', 'Amélie', 'Amelie', 'accept', 'Amélie (2001)', 'accented query'),
  R('intl-ytu', 'international_title', 'Y Tu Mama Tambien', 'Y Tu Mamá También', 'accept', 'Y Tu Mamá También (2001)', 'diacritics'),
  R('alt-theheadhunters', 'alternate_title', 'Jo Nesbo Headhunters', 'Headhunters', 'accept', 'Headhunters (2011)', 'author-prefixed alt phrasing (token window)'),
  R('intl-lacasa', 'international_title', 'La Casa de Papel', 'La Casa de Papel', 'accept', 'La Casa de Papel (Money Heist)'),

  // ── one-word / short titles ────────────────────────────────────────────────
  R('one-up', 'one_word', 'Up', 'Up', 'review', 'Up (2009) — too short to resolve confidently by title alone', 'len<3 guard: abstain'),
  R('one-it', 'one_word', 'It', 'It', 'review', 'It (2017) — too short; abstain', 'len<3 guard'),
  R('one-her', 'one_word', 'Her', 'Her', 'accept', 'Her (2013)', 'exactly 3 chars, exact'),
  R('one-cars', 'one_word', 'Cars', 'Cars', 'accept', 'Cars (2006)'),
  R('one-drive', 'one_word', 'Drive', 'Drive', 'accept', 'Drive (2011)'),

  // ── close but WRONG (must NOT match) — the dangerous false positives ────────
  R('wrong-saw-warsaw', 'close_but_wrong', 'Saw', 'Warsaw', 'reject', 'no match — "saw" is a mid-word substring of "warsaw"'),
  R('wrong-ted-wanted', 'close_but_wrong', 'Ted', 'Wanted', 'reject', 'no match — "ted" inside "wanted"'),
  R('wrong-her-butcher', 'close_but_wrong', 'Her', 'The Butcher', 'reject', 'no match — "her" inside "butcher"'),
  R('wrong-ring-ringer', 'close_but_wrong', 'The Ring', 'The Ringer', 'reject', 'no match — different work, sub-word'),
  R('wrong-up-wildup', 'close_but_wrong', 'Up', 'Wild Up', 'reject', 'no match — too short + not a title'),
  R('wrong-cars-carsington', 'close_but_wrong', 'Cars', 'Carsington Water', 'reject', 'no match — "cars" mid-word'),
  R('wrong-alien-nation', 'close_but_wrong', 'Alien', 'Alien Nation', 'accept', 'Alien Nation starts with "Alien" (token prefix) — resolves to that title record', 'documents token-prefix behaviour; matches[0] disambiguates in prod'),

  // ── titles with years ──────────────────────────────────────────────────────
  I('year-blade-runner', 'title_with_year', 'Blade Runner 1982',
    T({ title: 'Blade Runner', year: 1982, tmdbId: 78 }),
    T({ title: 'Blade Runner', year: 1982, tmdbId: 78 }),
    'same_canonical', 'accept', 'Blade Runner (1982)'),
  I('year-blade-2049', 'title_with_year', 'Blade Runner 2049',
    T({ title: 'Blade Runner', year: 1982, tmdbId: 78, collectionId: null }),
    T({ title: 'Blade Runner 2049', year: 2017, tmdbId: 335984, collectionId: null }),
    'franchise', 'review', 'Blade Runner 2049 — genuine sequel; inferable from title but no collection id → held, cannot filter', 'ground-truth franchise, inferred only'),
  I('year-conflict-crash', 'title_with_year', 'Crash',
    T({ title: 'Crash', year: 1996, tmdbId: 861, collectionId: null }),
    T({ title: 'Crash', year: 2004, tmdbId: 1640, collectionId: null }),
    'unknown', 'review', 'two unrelated films titled Crash (1996 vs 2004) — no metadata to establish relation → honest unknown', 'year separates the canonical keys; relation genuinely unknown'),

  // ── sequels / prequels / franchise collections (known collection id) ───────
  I('seq-rocky2', 'sequel', 'Rocky II',
    T({ title: 'Rocky', year: 1976, tmdbId: 1366, collectionId: 1575 }),
    T({ title: 'Rocky II', year: 1979, tmdbId: 1367, collectionId: 1575 }),
    'franchise', 'accept', 'Rocky II — same collection (Rocky Collection 1575)'),
  I('seq-godfather2', 'sequel', 'The Godfather Part II',
    T({ title: 'The Godfather', year: 1972, tmdbId: 238, collectionId: 230 }),
    T({ title: 'The Godfather Part II', year: 1974, tmdbId: 240, collectionId: 230 }),
    'franchise', 'accept', 'Godfather Part II — same collection 230'),
  I('pre-batman-begins', 'prequel', 'Batman Begins',
    T({ title: 'The Dark Knight', year: 2008, tmdbId: 155, collectionId: 263 }),
    T({ title: 'Batman Begins', year: 2005, tmdbId: 272, collectionId: 263 }),
    'franchise', 'accept', 'Batman Begins — same Dark Knight collection 263'),
  I('fr-toystory', 'franchise_collection', 'Toy Story 3',
    T({ title: 'Toy Story', year: 1995, tmdbId: 862, collectionId: 10 }),
    T({ title: 'Toy Story 3', year: 2010, tmdbId: 10193, collectionId: 10 }),
    'franchise', 'accept', 'Toy Story 3 — same collection 10'),
  I('fr-inferred-rocky', 'franchise_collection', 'Rocky II (no collection id)',
    T({ title: 'Rocky', year: 1976, tmdbId: 1366, collectionId: null }),
    T({ title: 'Rocky II', year: 1979, tmdbId: 1367, collectionId: null }),
    'franchise', 'review', 'Rocky II — INFERRED only (no collection id); cannot filter on it', 'inferred identity → hold'),

  // ── remakes / reboots (different works, usually different/absent collection) ─
  I('remake-italianjob', 'remake', 'The Italian Job (2003)',
    T({ title: 'The Italian Job', year: 1969, tmdbId: 5185, collectionId: null }),
    T({ title: 'The Italian Job', year: 2003, tmdbId: 9251, collectionId: null }),
    'unknown', 'review', 'remake — same title, different year, no shared collection → cannot confirm relation'),
  I('remake-total-recall', 'remake', 'Total Recall (2012)',
    T({ title: 'Total Recall', year: 1990, tmdbId: 861, collectionId: 880 }),
    T({ title: 'Total Recall', year: 2012, tmdbId: 64682, collectionId: 999 }),
    'similar', 'reject', 'remake with DIFFERENT collection ids → provably distinct works'),
  I('reboot-spiderman', 'reboot', 'The Amazing Spider-Man',
    T({ title: 'Spider-Man', year: 2002, tmdbId: 557, collectionId: 556 }),
    T({ title: 'The Amazing Spider-Man', year: 2012, tmdbId: 1930, collectionId: 573436 }),
    'similar', 'reject', 'reboot in a different collection → distinct'),

  // ── TV vs movie with the same title ────────────────────────────────────────
  I('tvm-fargo', 'tv_vs_movie', 'Fargo',
    T({ title: 'Fargo', year: 1996, tmdbId: 275, mediaType: 'movie' }),
    T({ title: 'Fargo', year: 2014, tmdbId: 60622, mediaType: 'tv' }),
    'unknown', 'review', 'Fargo film (1996) vs Fargo series (2014) — NOT collapsed (different canonical keys); relation not assertable without metadata', 'the key check: not same_canonical / not duplicate'),
  I('tvm-watchmen', 'tv_vs_movie', 'Watchmen',
    T({ title: 'Watchmen', year: 2009, tmdbId: 13183, mediaType: 'movie' }),
    T({ title: 'Watchmen', year: 2019, tmdbId: 90644, mediaType: 'tv' }),
    'unknown', 'review', 'film vs HBO series — not collapsed; relation unknown without metadata'),

  // ── TMDB identity conflicts (same media, same title, DIFFERENT work) ────────
  I('conflict-office', 'tmdb_conflict', 'The Office',
    T({ title: 'The Office', year: 2005, tmdbId: 2316, mediaType: 'tv', collectionId: null }),
    T({ title: 'The Office', year: 2001, tmdbId: 2996, mediaType: 'tv', collectionId: null }),
    'similar', 'review', 'Office US vs UK — genuinely DISTINCT works; the TV canonical key (no year) collapses them to canonical_duplicate. This is the one known residual: the over-collapse is the SAFE direction (exclusion, never surfacing wrong content) but the relation label is wrong', 'documented residual: conservative over-collapse'),
  I('conflict-collections', 'tmdb_conflict', 'Same title, different franchises',
    T({ title: 'The Mummy', year: 1999, tmdbId: 564, collectionId: 1733 }),
    T({ title: 'The Mummy', year: 1999, tmdbId: 999564, collectionId: 8091 }),
    'similar', 'reject', 'same title+year but DIFFERENT known collection ids → distinct works (D4 fix)'),

  // ── similarity: close-but-wrong recommendations (must be rejected/held) ─────
  S('sim-rocky-edward', 'close_but_wrong', 'like Rocky → Edward Scissorhands',
    T({ title: 'Rocky', year: 1976, tmdbId: 1366, genres: ['Drama', 'Sport'], keywords: ['boxing', 'underdog', 'training'], dims: { realism: 88, character: 72, emotion: 80 }, collectionId: 1575 }),
    { ...T({ title: 'Edward Scissorhands', year: 1990, genres: ['Fantasy', 'Drama'], keywords: ['gothic', 'outsider'], dims: { realism: 12, character: 70, emotion: 82 } }), personalScore: 99 },
    'reject', 'Edward Scissorhands — grounded↔fantastical contradiction; personalization must not rescue'),
  S('sim-jaws-nemo', 'close_but_wrong', 'like Jaws → Finding Nemo',
    T({ title: 'Jaws', year: 1975, tmdbId: 578, genres: ['Thriller', 'Horror', 'Adventure'], keywords: ['shark', 'survival', 'ocean'], dims: { realism: 78, suspense: 92, violence: 62 } }),
    { ...T({ title: 'Finding Nemo', year: 2003, genres: ['Animation', 'Family', 'Comedy'], keywords: ['ocean', 'fish', 'family'], dims: { realism: 15, humor: 70, warmth: 88 } }), personalScore: 90 },
    'reject', 'Finding Nemo — shares "ocean" only; realism contradiction'),
  S('sim-godfather-good', 'exact_match', 'like The Godfather → Goodfellas (genuine)',
    T({ title: 'The Godfather', year: 1972, tmdbId: 238, genres: ['Crime', 'Drama'], keywords: ['mafia', 'organized_crime', 'family'], dims: { realism: 82, darkness: 70, character: 78 } }),
    { ...T({ title: 'Goodfellas', year: 1990, genres: ['Crime', 'Drama'], keywords: ['mafia', 'organized_crime'], dims: { realism: 84, darkness: 68, character: 76 } }), personalScore: 55 },
    'accept', 'Goodfellas — genuine crime/mafia match'),

  // ── obscure titles (still resolve on an exact/token match) ──────────────────
  R('obs-tetsuo', 'obscure', 'Tetsuo The Iron Man', 'Tetsuo: The Iron Man', 'accept', 'Tetsuo: The Iron Man (1989)', 'obscure but exact-fold'),
  R('obs-hausu', 'obscure', 'Hausu', 'House', 'reject', 'Hausu (1977) alt title — NOT the same string as "House"; no confident token match', 'documents an alternate-title FN limit'),
  R('obs-koyaanisqatsi', 'obscure', 'Koyaanisqatsi', 'Koyaanisqatsi', 'accept', 'Koyaanisqatsi (1982)'),

  // ── explicit no-confident-match (abstain is the correct behaviour) ─────────
  S('nomatch-rocky-lala', 'no_confident_match', 'like Rocky → La La Land',
    T({ title: 'Rocky', year: 1976, tmdbId: 1366, genres: ['Drama', 'Sport'], keywords: ['boxing', 'underdog'], dims: { realism: 88 } }),
    { ...T({ title: 'La La Land', year: 2016, genres: ['Romance', 'Music'], keywords: ['musical'], dims: { realism: 40, romance: 88 } }), personalScore: 80 },
    'review', 'no defining shared anchor → honest no-close-match, not a padded result'),
  R('nomatch-gibberish', 'no_confident_match', 'zzzqqx', 'The Matrix', 'reject', 'gibberish query → no match'),
];
