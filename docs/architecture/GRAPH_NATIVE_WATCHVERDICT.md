# Graph-Native WatchVerdict

One connected intelligence system: every important fact, preference, score,
recommendation, availability claim, and user action carries **what it means,
where it came from, when it was observed, how sure we are, how long it may
matter, and what decisions it influenced**. This document is the domain
model, the phase plan, and the honest record of what is built versus mapped.

## Philosophy

- **The graph is execution evidence, not a story.** Decisions execute
  against connected evidence and the outcome is recorded into the same
  graph the explanation reads. No post-hoc storytelling: if a route didn't
  compute it, the graph doesn't claim it.
- **Graph-native ≠ graph database.** The model owns semantics; storage is
  the existing Postgres/Supabase (jsonb-first for run subgraphs, relational
  projections when they earn their keep). No new infrastructure.
- **Persistence is part of meaning.** "I hate slow movies" (durable) and
  "something fast tonight" (request_only) must never be confusable. The
  production defect where "a boxing movie" became a fabricated loved-title
  rating was exactly this confusion.
- **Absence of evidence is not evidence of absence.** `unknown` is a state
  (`EvidenceState`), never a default of "no"/"not available"/"not gory".

## Phase 0 — forensic truth-ownership map

### Single owners already established (the P0 closure line, PRs #86–#96)
| Question | One owner | Since |
|---|---|---|
| Is this utterance a request? | interpreter clause layer via `clauseLayerSaysRequest` (`src/lib/nlu/requestDecision.ts`), consumed by `canonicalRequestRoute` AND the search destination | #94, #96 |
| What may write to the taste file? | `tasteEvidenceText` (durable clauses + named-title reactions; never companions, never request nouns; seeded titles must be literally named) | #94, #96 |
| How does English rule something out? | `NEGATOR_WORDS` (one declaration; NEGATORS, negatedSpans, MEDIA_NEGATOR_BEHIND compose) | #92 |
| What is the score? | the canonical scoring contract (`src/lib/scoring/*`), all surfaces wired | #86 |
| What does the score look like? | `Verd1ctBadge` — title page, TV guide, cards, QuickLook, Ask cards | #95 |
| Which work does a framed name mean? | `chooseFramedReading` on cumulative audience | #90 |
| Is a skipped gate a pass? | No — deployed jobs conclude SKIPPED on production events | #91 |

### Duplicate/isolated truth — status after the phase 3–10 execution (2026-08-21)
- **Two recommendation engines** → **CLOSED for recommendation kinds
  (Phase 7 fold, 2026-08-21)**: `/api/finder` now holds the same
  `canonicalOwnsLanguage` fence as `/api/ask` — a recommendation-shaped
  text is interpreted by `interpret()` and executed through
  `resolveCanonicalExecution`, the identical builder, with every legacy
  whole-utterance reader (`parseAskWithAI`, `naiveParseQuery`,
  `extractReference`, `resolvePerson`, `requestedCreditRole`,
  `applyRequiredSubject`, `augmentInternational`) fenced to the legacy
  arm. Parity is BY CONSTRUCTION and pinned
  (`src/app/api/finder/finderOwnership.test.ts`,
  `src/lib/arch/semanticOwnership.test.ts`). The legacy arm survives for
  the kinds the canonical layer does not execute (title lookups, bare
  statements, similar-to references) — named in the Phase 7 remainder.
- **Client-parse trust** → **CLOSED (Phase 7, 2026-08-21)**: on BOTH
  routes the sentence outranks the browser's parse of it — `body.query`
  stands alone only when no text travels (chip-removal turns, the Vintage
  one-tap), and the finder's `overrides` list (sliders the user touched —
  actions, not parses) is the one sanctioned client voice over a
  text-derived field. `AskTheJudge` no longer ships its parse beside the
  text; `coerceClientQuery` is ONE module
  (`src/lib/finderQueryBoundary.ts`), not two private copies.
- **The airing branch drops the subject** ("AMC boxing movies tonight"
  reaches the guide without `boxing`). → **CLOSED, PR #104** — the airing
  exit re-reads the canonical interpreter's wanted subjects, carries the
  first as `?q=`, and the guide filters by it; the run records
  `requires_subject` and INV-1 accepts a routing run's hand-off via its
  `routed_to` edge (the URL carries the term).
- **Ask tiles show `dna.score` (AlgorithmScore) while WatchCall shows
  `dna.canonical.score`; `matchScore` (the ordering) is displayed nowhere.**
  → **CLOSED, PR #102** — every label surface reads `canonical.score`
  (one-label-one-number pinned by `oneVerdictLabel.test.ts`).
- **User preference evidence is scattered** (dimension_signals sums, quiz
  ratings, FOR/AGAINST, Showdown, saves) with no evidence traceability
  behind derived Taste DNA. → **CLOSED, PR #103** — one provenance-carrying
  read model (`src/lib/preference/readModel.ts`) over the six stores, the
  founder evidence inspector (`/growth-os/evidence`), and a cache-bust
  chokepoint at the write path.
- **Availability/title facts carry implicit provenance** (table-name-level
  only). → **CLOSED for availability/airings, PR #104** (source +
  observed-at on watchmode rows, TVmaze airings and ingested guide rows;
  cards prefer the real per-row `retrieved_at`); **title knowledge joined
  in PR #107** (the deployed 0048 layer reconciled into main, read behind
  `readTitleKnowledge` with safe-absent semantics).
- **Orphan NL parser**: `/api/recommendations` POST + `lib/recFeedback.ts`
  (no callers). → **CLOSED, PR #106** — route deleted, parser reduced to
  the filter types its callers actually use, orphan-surface regression pins
  added (`src/lib/arch/orphanSurfaces.test.ts`).
- SearchResultRow prints a raw score number (neither badge). →
  **CLOSED, PR #102** — it wears `Verd1ctBadge` like every other card.

## Phase 1 — the vocabulary (`src/lib/graph/types.ts`) — BUILT

- `EvidenceSource`: user_statement · user_action · inference · classifier ·
  deterministic_rule · external:tmdb · external:tvmaze · imported · calculated
- `Persistence`: durable · session · request_only
- `EvidenceState`: confirmed · contradicted · unknown · stale
- `Provenance { source, observedAt, confidence?, runId? }`,
  `Validity { validFrom?, validUntil? }`
- `NodeRef` constructors (canonical identity: `title:movie:1366`, one title
  one ref), closed `EdgePredicate` set (classified_as, routed_to,
  requires_*, excludes_*, satisfies, violates, rejected, scored, returned,
  wrote_taste, seeded_title, acknowledged)
- `DecisionRun { id, entryPoint, rawText, intent{kind, persistence}, edges, createdAt }`

## Phase 2 — decision provenance — BUILT

- **Migration `0049_decision_runs`** (originally authored as
  0047_decision_runs; re-issued after the three-way 0047 collision — see
  "Schema reality" below): one row per user-triggered decision;
  jsonb edges; RLS owner-only select/insert, immutable (no update/delete),
  service_role for retention ops; index (user_id, created_at desc).
  Rollback provided. Additive; a pre-migration deploy degrades to a no-op
  store (same contract as analytics_events).
- **`/api/ask`** persists a run at the search exit: constraint edges from
  the executed query, per-candidate satisfies/REJECTED edges from the
  finder's own diagnostics (with provenance: deterministic_rule vs
  classifier by `decidedBy`, confidence carried), returned+scored edges.
  `requestId` is the run id. Fire-and-forget; never blocks a response.
- **`/api/build-case`** persists a run at every exit (request / taste /
  airing / platform), recording the classification, destination, and the
  writes ACTUALLY performed with the durable-clause text that justified
  them. `caseId` is the run id, shared with the analytics rows.
- **Founder inspector** (`/growth-os/decisions`, admin-gated + RLS-scoped):
  list + per-run view — raw input, classification, persistence, hard
  requirements, eligibility verdicts with reasons and provenance, results
  with scores, writes with their justification, the full edge list, and the
  invariant suite executed live over the stored run.

## Graph invariants (`src/lib/graph/invariants.ts`) — BUILT (first five)

- **INV-1** a hard required constraint is satisfied by every returned
  result or the run declares an explicit empty/clarify state. Each
  requirement kind has its own honest proof shape: subject → per-candidate
  `satisfies` evidence; media → the candidate's canonical identity; count →
  result-set cardinality (shortfall honest, overrun violation);
  genre/runtime gain per-candidate fact edges in Phase 4 and are not
  falsely claimed until then.
- **INV-2** writes never derive from request-only language: a write edge in
  a request_only run is lawful only with attached durable-clause evidence.
  The old production behavior ("a boxing movie" seeding a 9/10) is formally
  a violation — pinned as a test.
- **INV-6** the raw utterance survives to the end of the run.
- **INV-8** a rejected candidate is never returned.
- **INV-10** unknown evidence is never fully-confident.
- **INV-4** availability claims carry source + observed-at — BUILT with
  Slice A (PR #104): `available_on`/`airs_on` edges without
  `provenance.source` + `observedAt` are violations.
- **INV-7** every "because" claim maps to execution evidence — BUILT with
  Phase 10 (PR #107): a `detail.because` on a returned edge requires an
  evidence-bearing edge (satisfies/scored/available_on/airs_on/rejected)
  for the same subject in the same run.
- **INV-9** group evidence never leaks into durable individual taste —
  BUILT with Phase 8 (PR #105): court/verdict/subscriptions runs must
  carry zero `wrote_taste`/`seeded_title` edges.
- INV-3 (personalized score requires personal evidence) and INV-5 (one
  identity owns cross-surface score state) are NOT YET BUILT — their
  behavior exists (canonical trace, one badge) but no invariant enforces
  it over stored runs. Tracked in BACKLOG.

## The boxing litmus — PROVEN (route level)

`src/lib/graph/boxingLitmus.test.ts` + `buildCase.test.ts` run the REAL
routes (world mocked at its boundary):

- **"a boxing movie"** → run: `classified_as request`, `persistence
  request_only`, `requires_subject boxing` connected from raw text to every
  returned candidate, the GoodFellas-class candidate carries a `rejected`
  edge with its stated reason (ineligible, not merely low-ranked), zero
  write edges. All invariants hold.
- **"I love boxing movies"** → run: `classified_as taste`, `persistence
  durable`, `wrote_taste` edges present, no routing, no candidates.

Two utterances, two visibly different graph paths.

## Temporal validity, contradictions, confidence

`Validity` and `EvidenceState` are in the vocabulary now; consumers arrive
with availability (Phase 6) and content evidence (Phase 4), where sources
can disagree and staleness matters. Contradictions are retained as opposing
edges with their own provenance — decision policies choose, they never
overwrite.

## Privacy & retention

Decision runs carry the user's own phrasing. They are owner-scoped by RLS
(no cross-user read), immutable, and prunable — nothing derives durable
state from them, so deletion costs only inspectability. Intended policy:
90-day retention via a service-role cleanup (ops cron; not yet scheduled —
tracked in BACKLOG). Group sessions (Phase 8) will scope evidence to
participants; imported evidence stays marked `imported`.

## Performance & cost

One fire-and-forget insert per decision; no reads in any hot path; the
inspector reads are founder-only. No new AI calls anywhere in the spine —
model-derived evidence is only ever RECORDED as `classifier` provenance
where routes already used one.

## Phase plan — status of record (2026-08-21, PRs #102–#107)

- **0 map ✅** (+ the forensic reconciliation matrix of this execution:
  doc vs repo vs production, two schema-drift discoveries below).
- **1 vocabulary ✅** · **2 decision provenance + inspector ✅**.
- **3 user evidence unification ✅** (PR #103) — one read model over the
  six stores, `/growth-os/evidence`, DNA cache bust at the write path.
- **4 content evidence — PARTIAL** (PR #107) — the production-deployed
  knowledge layer (compile/resolve/store + migration 0048, byte-identical
  to what the DB applied) is reconciled into main with its 15 tests and
  read by the title-evidence inspector. NOT yet wired into finder
  eligibility (a search-surface change; queued with its own corpus gate).
- **5 scoring trace ✅** (PR #102) — one label, one number, all surfaces.
- **6 availability & live TV ✅ (Slice A)** (PR #104) — source/observed-at
  on watchmode + TVmaze + ingested rows, INV-4, airing subject carried.
- **7 cross-surface consolidation — PARTIAL** — done: airing subject
  (PR #104), orphan-parser deletion (PR #106), and the 2026-08-21 fold:
  `/api/finder` holds the canonical fence (recommendation kinds execute
  through `resolveCanonicalExecution`, parity with /api/ask by
  construction), client-parse trust is dead on both routes, and
  `coerceClientQuery` is one boundary module. **TASK #36 additions:** the
  LLM parse is fenced off /api/ask's canonical path too (zero OpenAI
  calls on a canonical-served sentence — fetch-spy proven); the airing
  arm's genre/media siblings read canonical fields (media IS the
  canonical reading; detectGenre reads the isolated request clause); and
  two defects in the OWNER's own vocabulary were repaired — NEGATOR_WORDS
  gained the renunciation phrases the legacy parser knew (`tired of`,
  `sick of`, `never`, `rather not`… — "a thriller but never horror" no
  longer executes horror as WANTED), and parseCount reads nlu/count's
  exported table instead of a private copy that stopped at ten. The
  destination cascade is DOCUMENTED as routing-not-meaning: it picks a
  door from vocabulary but always delivers the sentence byte-identical to
  the one owner (transport invariant pinned in semanticOwnership.test.ts).
  **Remaining second readers, named** (each live, each fenced-by-gate or
  queued): `applyTurn`'s conversational interpreter (multi-turn state is
  a genuinely separate, corpus-pinned domain — retained, documented);
  `HISTORY_ASK` (history queries, a non-recommendation domain);
  `classifySearch` as the title/similar-to MODE GATE on both routes;
  `routeAsk`'s comparative reader; `askJudgeTitle`'s internal raw-text
  mechanics (fenced by `canonicalClaimsSpan` — title lookup after
  canonical title intent, per the ownership rules); the similar_to arm's
  reference readers; both routes' LEGACY arms for kinds canonical does
  not execute; build-case's `wantsFind` routing regex and the double
  `parseClauses` run (same single definition twice — cost, not
  divergence); and `classifySearchIntent`'s private request vocabulary
  deciding order in the cascade (routing only; meaning untouched). The
  vocabulary-duplication audit (13 axes, full table in the session
  record) is queued in BACKLOG — genre-id TV gap, provider recognition
  splits, media-noun copies, origin coverage.
- **8 Slices B+C — PARTIAL** (PR #105) — Verdict Room, docket verdict and
  Subscription Check record decision runs (session/request_only) under
  INV-9; court runs record only when the host is authenticated, and
  durable court **results** persistence still needs its SECURITY DEFINER
  RPC migration (queued).
- **9 evidence inspectors ✅** (PRs #103 + #107) — `/growth-os/evidence`
  (user) and `/growth-os/title-evidence` (title), both provenance-first
  with named absence.
- **10 graph-powered why — PARTIAL** (PR #107) — `groundedWhy` derives
  reasons only from a run's own edges (INV-7 enforced); LIVE in the
  founder run inspector. The user-facing title-page "Why this VERD1CT"
  does not read run evidence yet (queued).

## Schema reality — reconciled (2026-08-21, post-environment-repair)

- **The environment blocker is CLOSED.** The owner repaired
  `SUPABASE_DB_URL`; `/api/version` now reads the ledger through the direct
  channel (`migrationLedgerStatus: cli_ledger`, no `ledgerChannels`).
- **Two identity systems, never conflated.** The Supabase CLI ledger
  (`supabase_migrations.schema_migrations`) keys rows by TIMESTAMP version
  with a name beside it; this repo's runner ledger
  (`public.schema_migrations`) keys rows by filename. Production's CLI
  ledger holds three rows: `20260808180259 0047_voice_interviews`,
  `20260809172616 0048_title_knowledge`, `20260812164511
  0047_watchlist_provenance` — the number 0047 is applied TWICE there, from
  files this repository never carried. `/api/version` reports each system
  in its own identity (`appliedDatabaseMigration` + `appliedMigrationName`
  + `cliLedger`/`runnerLedger`), and checksummed runner rows are
  first-class evidence (`runner_ledger` status) — the `reconciled` flag is
  no longer the only path to a repo-named answer.
- **decision_runs was re-issued as `0049_decision_runs`.** The original
  0047_decision_runs identity was retired without ever being applied
  anywhere (three-way 0047 collision). Forensic review before first
  application fixed two inherited defects: the `entry_point` check
  constraint predated Phase 8 (court/verdict/subscriptions inserts would
  have violated it — now pinned to `ENTRY_POINTS` by
  `src/lib/migrationSequence.test.ts`), and the bare `create policy`
  statements were not idempotent (proven by `scripts/proveMigration.ts`
  double-apply; now guarded like 0048's). `public.decision_runs` does NOT
  exist in production yet; recording degrades to a no-op by contract until
  the owner's next migrate call applies 0049.
- `0048_title_knowledge.sql` in this repo remains pinned byte-identical
  (sha256 in `src/lib/graph/phase910.test.ts`) to the file production
  applied; its tables exist in production.
- **The app ledger is born hardened.** `LEDGER_DDL` now enables RLS and
  revokes anon/authenticated on `public.schema_migrations` on every migrate
  call — 0046's `if exists` guard was order-dependent and production's
  ledger table sat REST-exposed (a forged ledger row can suppress or halt
  migrations). Self-heals existing deployments on the next run.
