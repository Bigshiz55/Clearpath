/**
 * FREEZE THE CORPUS.
 *
 * Builds the 1,000 tests, asserts every invariant the audit brief requires,
 * and writes the frozen file. Nothing is executed against the system until
 * this file exists — that is the whole point of a frozen corpus: the tests
 * cannot be quietly reshaped later to fit whatever the system happened to do.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildCorpus, CATEGORIES, SEED, type FrozenTest } from './corpus';

const tests = buildCorpus();

function fail(msg: string): never {
  console.error(`INVARIANT FAILED: ${msg}`);
  process.exit(1);
}

// --- exactly 1000, exactly 20 categories of exactly 50 ---
if (tests.length !== 1000) fail(`length ${tests.length}`);
const byCat = new Map<string, FrozenTest[]>();
for (const t of tests) {
  if (!byCat.has(t.category)) byCat.set(t.category, []);
  byCat.get(t.category)!.push(t);
}
if (byCat.size !== 20) fail(`${byCat.size} categories, expected 20`);
for (const c of CATEGORIES) {
  const n = byCat.get(c.name)?.length ?? 0;
  if (n !== 50) fail(`category ${c.name} has ${n}, expected 50`);
}

// --- ids are 1..1000, unique ---
const ids = new Set(tests.map((t) => t.id));
if (ids.size !== 1000) fail('duplicate ids');
if (Math.min(...ids) !== 1 || Math.max(...ids) !== 1000) fail('ids not 1..1000');

// --- >= 350 conversational / incomplete / ambiguous ---
const CONVERSATIONAL = new Set([
  'partial_and_autocomplete',
  'simple_nl_recommendations',
  'similarity_requests',
  'date_runtime_rating_constraints',
  'mood_genre_tone_occasion',
  'negative_constraints',
  'service_and_availability',
  'group_and_conflicting_tastes',
  'history_dna_and_saved',
  'long_messy_conversational',
  'ambiguous_needs_clarification',
]);
const conv = tests.filter((t) => CONVERSATIONAL.has(t.category)).length;
if (conv < 350) fail(`only ${conv} conversational/incomplete/ambiguous, need >= 350`);

// --- >= 100 multi-turn ---
const multi = tests.filter((t) => t.multi_turn).length;
if (multi < 100) fail(`only ${multi} multi-turn, need >= 100`);
for (const t of tests) {
  if (t.multi_turn && t.query_or_turns.length < 2) fail(`test ${t.id} multi_turn with < 2 turns`);
  if (!t.multi_turn && t.query_or_turns.length !== 1) fail(`test ${t.id} single-turn with ${t.query_or_turns.length} turns`);
}

// --- every unclear request carries one of the four classifications ---
const BEHAVIOURS = new Set([
  'safe_normalization',
  'clarification_required',
  'enough_information',
  'impossible_or_contradictory',
]);
const unclassified = tests.filter((t) => t.expected_handling !== null && !BEHAVIOURS.has(t.expected_handling));
if (unclassified.length) fail(`bad expected_handling on ids ${unclassified.slice(0, 5).map((t) => t.id).join(',')}`);
const needClass = tests.filter((t) => CONVERSATIONAL.has(t.category) || t.category === 'malformed_and_extreme');
const missing = needClass.filter((t) => t.expected_handling === null);
if (missing.length) fail(`${missing.length} unclear requests without a classification`);

// --- the mandatory Rocky test and its variants ---
const rocky = tests.filter((t) => t.reference_titles.some((r) => /^Rocky/i.test(r)) || /\brocky\b/i.test(t.query_or_turns.join(' ')));
if (rocky.length < 17) fail(`only ${rocky.length} Rocky cases, need the main test + 16 variants`);
const rockyMain = tests.find((t) => t.query_or_turns.length === 1 && (t.query_or_turns[0] ?? '').trim().toLowerCase() === 'rocky');
if (!rockyMain) fail('the mandatory bare "Rocky" test is missing');

// --- named difficult titles all present ---
const NAMED = [
  'CSI: NY', 'Cinderella Man', 'Rocky', 'Creed', 'Show Me a Hero', 'Anything Goes',
  'Everything Everywhere All at Once', 'The Lord of the Rings', 'It', 'You', 'Her',
  'Us', 'Up', 'Go', 'Crash', 'The Office', 'Ghosts', 'The Killing', 'Criminal Minds',
  'Dexter', 'Mindhunter', 'Sherlock', 'Mystery 101', 'Aurora Teagarden',
  'Hannah Swensen', 'Murder She Baked', 'Signed Sealed Delivered', 'The Wrong',
  'Flowers in the Attic',
];
// Compared with punctuation stripped, so "Murder, She Baked" in the corpus
// satisfies "Murder She Baked" in the brief — the requirement is the title,
// not the comma.
const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const haystack = flat(JSON.stringify(tests));
const absent = NAMED.filter((n) => !haystack.includes(flat(n)));
if (absent.length) fail(`named difficult titles absent: ${absent.join(' | ')}`);

// --- not 1000 cosmetic variations of a handful of titles ---
const distinctRefs = new Set(tests.flatMap((t) => t.reference_titles.map((r) => r.toLowerCase())));
if (distinctRefs.size < 80) fail(`only ${distinctRefs.size} distinct reference titles`);
const distinctQueries = new Set(tests.map((t) => t.query_or_turns.join(' ␟ ').toLowerCase()));
if (distinctQueries.size < 950) fail(`only ${distinctQueries.size} distinct query bodies of 1000`);

// --- every test states what is and is not acceptable ---
for (const t of tests) {
  if (!t.acceptable_behavior.length) fail(`test ${t.id} has no acceptable_behavior`);
  if (!t.unacceptable_behavior.length) fail(`test ${t.id} has no unacceptable_behavior`);
  if (!t.query_or_turns.every((q) => typeof q === 'string')) fail(`test ${t.id} has a non-string turn`);
}

const payload = { seed: SEED, generated_by: 'scripts/searchAudit/corpus.ts', count: tests.length, categories: CATEGORIES.map((c) => c.name), tests };
const json = JSON.stringify(payload, null, 2);
const sha = createHash('sha256').update(json).digest('hex');

mkdirSync('artifacts/search-audit', { recursive: true });
writeFileSync('artifacts/search-audit/search-corpus-1000.json', json);
writeFileSync('artifacts/search-audit/search-corpus-1000.sha256', `${sha}  search-corpus-1000.json\n`);

const strict: Record<string, number> = {};
for (const t of tests) strict[t.strictness] = (strict[t.strictness] ?? 0) + 1;
const intents: Record<string, number> = {};
for (const t of tests) intents[t.intended_intent] = (intents[t.intended_intent] ?? 0) + 1;

console.log('FROZEN artifacts/search-audit/search-corpus-1000.json');
console.log(`  sha256                 ${sha}`);
console.log(`  seed                   ${SEED}`);
console.log(`  tests                  ${tests.length} across ${byCat.size} categories x 50`);
console.log(`  conversational/unclear ${conv} (>= 350)`);
console.log(`  multi-turn             ${multi} (>= 100)`);
console.log(`  Rocky cases            ${rocky.length} (main + >= 16 variants)`);
console.log(`  distinct ref titles    ${distinctRefs.size}`);
console.log(`  distinct query bodies  ${distinctQueries.size}`);
console.log(`  strictness             ${JSON.stringify(strict)}`);
console.log(`  intents                ${JSON.stringify(intents)}`);
