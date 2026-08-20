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

### Duplicate/isolated truth still open (audit, 2026-08-20)
- **Two recommendation engines**: `/api/ask` (canonical `interpret` +
  `resolveCanonicalExecution`) vs `/api/finder` (`parseAskWithAI` +
  `naiveParseQuery` + `applyRequiredSubject`). Reachable for the same
  sentence via build-case's platform branch. → Phase 7 consolidation.
- **`/api/ask`'s legacy arm trusts the client's `naiveParseQuery`** for
  non-recommendation kinds (`body.query` precedence). → Phase 7.
- **The airing branch drops the subject** ("AMC boxing movies tonight"
  reaches the guide without `boxing`). → Phase 6/7.
- **Ask tiles show `dna.score` (AlgorithmScore) while WatchCall shows
  `dna.canonical.score`; `matchScore` (the ordering) is displayed nowhere.**
  → Phase 5 scoring-trace consumers.
- **User preference evidence is scattered** (dimension_signals sums, quiz
  ratings, FOR/AGAINST, Showdown, saves) with no evidence traceability
  behind derived Taste DNA. → Phase 3.
- **Availability/title facts carry implicit provenance** (table-name-level
  only). → Phases 4/6.
- **Orphan NL parser**: `/api/recommendations` POST + `lib/recFeedback.ts`
  (no callers). → delete in Phase 7.
- SearchResultRow prints a raw score number (neither badge). → Phase 5.

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

- **Migration `0047_decision_runs`**: one row per user-triggered decision;
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
- INV-3 (personalized score requires personal evidence), INV-4
  (availability claims carry source+timestamp), INV-5 (one identity owns
  cross-surface score state), INV-7 (every "because" claim maps to
  execution evidence), INV-9 (group evidence never leaks into durable
  individual taste) land with their phases (5, 6, 30, 10, 8 respectively).

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

## Phase plan (each deployable)

0 map ✅ · 1 vocabulary ✅ · 2 decision provenance + inspector ✅ ·
3 user evidence unification → Taste DNA as a derived view ·
4 content evidence (title facts with per-source provenance, disagreement
retained) · 5 scoring trace (one canonical trace; surfaces read it; fixes
the AlgorithmScore/WatchCall divergence) · 6 availability & live TV
(observed_at/validity on offers and airings; canonical title resolution) ·
7 cross-surface consolidation (finder folds into the canonical
interpreter; legacy arm stops trusting client parses; airing branch keeps
the subject; orphan parser deleted) · 8 Docket / Verdict Room /
Subscription Check as graph objects · 9 title/user evidence inspectors ·
10 graph-powered "Why this VERD1CT" from run evidence.
