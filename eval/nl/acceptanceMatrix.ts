/**
 * THE NATURAL-LANGUAGE ACCEPTANCE MATRIX, RUN THROUGH THE REAL MODULES.
 *
 * ── WHAT THIS PROVES, AND WHAT IT DOES NOT ────────────────────────────────
 * Every reading below comes from the shipped canonical front door — `interpret`,
 * `intentToQuery`, `canonicalClaimsSpan`, `isBareStatement`, `readAnchorSpan` —
 * imported, never reimplemented, and never mocked. No expected answer is
 * hand-authored: what is printed is what those functions actually return for
 * these sentences, so a regression in any of them shows up here as a changed
 * line rather than a passing assertion about a fiction.
 *
 * It does NOT prove retrieval. Candidate counts, the titles that come back,
 * whether a user's fingerprint was on file and whether the ranking moved all
 * require a signed-in session against a deployment, and `/api/ask` returns
 * "Not signed in." to everyone else — correctly. Those four columns are named
 * BLOCKED here rather than estimated, and `eval/preview/taste-dna-proof.mjs`
 * fills them in against an exact-head deployment with the preview-only login.
 *
 * Being explicit about the seam is the point. A matrix that quietly printed a
 * plausible candidate count would be worth less than one that says where its
 * evidence stops.
 *
 * PURE. No network, no database, no clock beyond the injected one.
 */
import '../../scripts/searchAudit/shimServerOnly';
import { interpret } from '@/lib/interpret/interpret';
import { intentToQuery } from '@/lib/ask/canonicalExecution';
import { canonicalClaimsSpan } from '@/lib/ask/titleSpanOwnership';
import { isBareStatement, acknowledgeStatement } from '@/lib/ask/statementBoundary';
import { readAnchorSpan } from '@/lib/critic/anchorSpan';
import { splitTitleQualifiers } from '@/lib/nlu/queryRepair';

/** The sentences the closure order names, plus the controls they need. */
const MATRIX: Array<{ q: string; note: string }> = [
  { q: 'I liked Rocky a few weeks ago. I’m looking for another boxing movie.', note: 'taste + request across clauses' },
  { q: 'Give me 3 Sylvester Stallone movies.', note: 'person + explicit count' },
  { q: 'I had a beef burrito for dinner and I want a smart thriller.', note: 'irrelevant background + request' },
  { q: 'Something better for me than Furious.', note: 'comparative, personal axis' },
  { q: 'Taken', note: 'bare ambiguous title' },
  { q: 'the Taken movie', note: 'explicit medium cue' },
  { q: 'Taken 2008', note: 'explicit year cue' },
  { q: 'I liked the first one but not the sequel', note: 'anaphora, no title stated' },
  { q: 'something like that but less dumb', note: 'anaphora + vetoed tone' },
  { q: 'another one, but not so long', note: 'anaphora + vetoed length' },
  { q: 'my wife hated it but I liked it', note: 'third-party opinion, not the user’s taste' },
  { q: 'three more', note: 'bare continuation' },
  { q: 'one more', note: 'bare continuation, singular' },
  { q: 'anything except horror', note: 'bare exclusion' },
  { q: 'I love slow burns but I hate gore.', note: 'cross-clause positive + negative' },
  { q: 'My wife likes comedies.', note: 'third-party statement, must not search' },
  // Controls: a real qualifier in each shape must still bind.
  { q: 'another courtroom drama', note: 'CONTROL — a real topical qualifier' },
  { q: 'movies and shows about chess', note: 'CONTROL — a coordinator is not a topic' },
];

const NOW = Date.UTC(2026, 7, 19);
const j = (v: unknown) => JSON.stringify(v);

for (const { q, note } of MATRIX) {
  const intent = interpret(q);
  const mapped = intentToQuery(intent, { now: NOW }) as unknown as {
    query: { genreIds: number[]; excludeGenreIds?: number[]; mediaType: string; pace?: number | null };
    pending: { requiredSubjects: string[]; requiredPeople: { spokenAs: string }[] };
    requestedCount: number | null;
  };
  /* TITLE OWNERSHIP, the way the route asks it: the legacy extractor proposes a
     span and the canonical reading is asked whether it already owns every
     identity-bearing word in it. */
  const legacySpan = splitTitleQualifiers(q).title;
  const owned = canonicalClaimsSpan(intent, legacySpan);
  /* A comparative anchor is a TitleReference with a comparing relation — the
     interpreter records every named title in one place and distinguishes them
     by how the sentence used it. */
  const anchor = intent.titles.find((t) => t.relation === 'similar' || t.relation === 'betterThan');
  const anchorSpan = anchor ? readAnchorSpan(anchor.span) : null;

  console.log(`\n« ${q} »`);
  console.log(`   note            ${note}`);
  console.log(`   INTERPRETATION  kind=${intent.kind} media=${intent.media} requestedCount=${intent.requestedCount ?? 'null'}`);
  console.log(`   subjects        ${j(intent.subjects.map((s) => [s.span, s.wanted]))}`);
  console.log(`   genres          ${j(intent.genres.map((g) => [g.span, g.wanted, g.holder]))}`);
  console.log(`   tones           ${j(intent.tones.map((t) => [t.term, t.wanted]))}`);
  console.log(`   people          ${j(intent.people.map((p) => [p.span, p.relation, p.role]))}`);
  console.log(`   titles          ${j(intent.titles.map((t) => [t.span, t.relation]))}${anchorSpan ? ` → anchor span ${j(anchorSpan)}` : ''}`);
  console.log(`   background      ${j(intent.background.map((b) => b.text ?? b))}`);
  console.log(`   TITLE OWNERSHIP legacy span ${j(legacySpan)} · canonical claims it: ${owned ? 'YES — no title lookup' : 'no'}`);
  console.log(`   STATEMENT GATE  ${isBareStatement(intent) ? `bare statement → "${acknowledgeStatement(intent)}"` : 'carries a request'}`);
  console.log(`   CONSTRAINTS     genreIds=${j(mapped.query.genreIds)} exclude=${j(mapped.query.excludeGenreIds ?? [])} media=${mapped.query.mediaType} pace=${mapped.query.pace ?? 'null'} limit=${mapped.requestedCount ?? 'default'}`);
  console.log(`   strict subjects ${j(mapped.pending.requiredSubjects)}`);
  console.log(`   required people ${j(mapped.pending.requiredPeople.map((p) => p.spokenAs ?? p))}`);
  console.log(`   candidates / top results / evidence availability / ranking moved / explanation: BLOCKED — needs an authenticated deployment (see eval/preview/taste-dna-proof.mjs)`);
}

console.log(`\n${MATRIX.length} sentences read through the shipped canonical modules. Retrieval columns are BLOCKED, not estimated.`);
