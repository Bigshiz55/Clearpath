# WatchVerd1ct Knowledge Layer — Forensic Report

Branch: `claude/watch-verdict-app-wwbtbg` · Scope: durable compiled title
intelligence + temporal taste memory + clarification + adversarial evaluation +
dev skills. No parallel finder; deterministic constraints preserved.

---

## A. Existing architecture discovered

One search core, two front doors. `/api/finder` and `/api/ask` are thin routes
that converge on **`runFinder` (`src/lib/finder.ts`)**. Parsing is three-headed
(`askParse.ts` LLM, `finderParse.ts` regex, the flagged-off `ai/` orchestrator)
but all produce one `FinderQuery`. Overlays `augmentInternational` +
`applyRequiredSubject` run on both routes. Flow:

```
query → parse → FinderQuery → augmentInternational + applyRequiredSubject
      → runFinder → TMDB discover → hard filters (scoreCandidate)
      → subject eligibility → rank by Taste DNA → verdict
```

Subject eligibility was **`evaluateSubjectCentrality`** (pure lexeme/keyword/
overview signals) with an **ambiguous MATERIAL band** escalated per-request to a
bounded `gpt-4o-mini` **adjudicator** (`subjectAdjudicator.ts`). Personalization:
`preference_events` (append-only event log) → `deriveDna` → `rankByDna`, plus an
embedding stack. Storage: `title_dimensions` is the live interpreted-knowledge
cache; pgvector exists only as inert scaffolding (`0031_reco_engine.sql`).

## B. Root architectural weaknesses (not symptoms)

1. **Stable facts were re-derived every search.** "Is baseball central to
   Moneyball?" was recomputed — and, in the ambiguous band, re-paid as an LLM
   call — on every request. Nothing remembered the answer.
2. **Offline/keyless = precision collapse for MATERIAL titles.** With no
   `OPENAI_API_KEY`, the ambiguous band always rejected, so genuinely-central
   titles that read as MATERIAL were dropped.
3. **Derived taste state was never persisted.** The event log was temporal, but
   `deriveDna` was re-folded per request; `trait_confidence` and
   `dna_strength_history` (declared in 0023) were never written.
4. **No confidence/ambiguity signal on the deterministic path.** The AI schema
   had `ambiguities`, but the shipped path could not say "I'm not sure what you
   meant."

## C. What changed (files, schema, flow)

- **Schema:** migration `0048_title_knowledge.sql` — `title_knowledge` (header)
  + `title_subject_facts` (per-title/subject centrality oracle), modeled on
  `title_dimensions` (world-readable, service-role writes). Registered in
  `pendingMigrations.ts` + `schemaContract.ts`. **Not applied** (owner action).
- **Compiler (`src/lib/knowledge/`):** `compile.ts` (pure reconciliation, reuses
  `evaluateSubjectCentrality`), `store.ts` (safe-absent read/write), `resolve.ts`
  (ambiguous-band decision), `batch.ts` (batch compiler + `explainCandidate`).
- **Integration:** `runFinder` consults compiled facts (one batched read) before
  the LLM adjudicator; records provenance `decidedBy: knowledge|adjudicator`.
- **Temporal taste:** `preference/snapshot.ts` + `snapshotStore.ts` write
  `trait_confidence` + `dna_strength_history` at recompute boundaries (dnaQuiz,
  voiceInterview actions), appended never overwritten.
- **Clarification:** `nlu/clarify.ts` (pure, definition-driven ambiguity detector).
- **Skills:** `.claude/skills/{watchverdict-search,taste-dna,provider-data,
  voice-dna,release-governance,forensic-testing}/SKILL.md`.

## D. Knowledge compiler — how evidence becomes durable knowledge

Cheap-deterministic-first: `evaluateSubjectCentrality` settles the confident
bands with no model call; only the ambiguous MATERIAL band spends an
adjudication. `reconcile()` turns the verdict(s) into a durable fact under
explicit rules so **one inference never becomes permanent truth**:

- weak **keyword-only** evidence caps at MATERIAL, never CENTRAL;
- multiple **independent sources** (title + tags + overview) raise confidence;
- a **contradiction** between a confident deterministic verdict and the model is
  marked `disputed` with lowered confidence, never silently flipped;
- **insufficient** evidence stays UNKNOWN; a verifiable "no connection" is ABSENT.

Facts carry provenance (sources, decidedBy), a `COMPILER_VERSION` (bump ⇒
recompiled), and are idempotent on content. Batch (`compileTitle`) and
request-path compile-on-demand share the same core, so they cannot disagree.

## E. Search integration — exact insertion point

In `runFinder`'s ambiguity-band block (`src/lib/finder.ts`): after the
deterministic pass flags MATERIAL/ambiguous candidates, one batched
`readSubjectFacts(subject, borderline)` runs; each candidate goes through
`resolveAmbiguousSubject` — a **durable compiled fact resolves it with no model
call (works offline)**, otherwise the bounded adjudicator runs once and the
result is compiled-on-demand and persisted. Eligibility still gates ranking; the
hard code-guard against ineligible leakage is unchanged. No parallel finder.

## F. Temporal Taste Memory — how preference evolution works

`preference_events` remains the append-only, timestamped, provenance-rich source
of truth (voice interviews already funnel into it). The **derived** state is now
snapshotted: `snapshotDna(deriveDna(...))` → `trait_confidence` rows +
a `dna_strength_history` point, appended at each recompute (never overwritten),
best-effort/safe-absent. Confidence is a monotonic function of accumulated
evidence, so explicit high-weight signals (a post-watch "loved") dominate weak
inferred ones (a click) by construction — locked by `snapshot.test.ts`.

## G. Clarification behavior — when it asks and when it doesn't

`detectAmbiguities(raw)` fires only when a MATERIAL trigger is present AND no
disambiguator resolves it (e.g. "foreign" with no language/country cue →
non-English vs non-US; "old" with no year anchor → era). It returns confidence +
2–4 selectable interpretations and asks at most one question. Anything
self-disambiguated ("foreign … in Korean", "old … before 1970") or unambiguous
proceeds at confidence 1.0 — no search becomes an interview.

## H. Cost / performance

- **Before:** each ambiguous-band candidate cost 1 `gpt-4o-mini` call *per
  search*, re-paid on every repeat of the same query, and rejected entirely with
  no key.
- **After:** a compiled fact short-circuits with **0 LLM calls**, deterministic
  and offline. The generalization harness compiles **800 cross-domain cases with
  zero model calls**. So a mature search over understood titles trends toward
  no per-request LLM adjudication, and keyless/preview environments gain
  correct MATERIAL promotion they previously could not have.
- Reads are one batched query over the ambiguous band; writes are best-effort
  and bounded to that band. No new vector DB, no giant per-search prompt, no
  synchronous bulk compilation in a user request.

## I. Generalization proof (randomized + cross-domain)

`src/lib/knowledge/knowledgeChaos.test.ts` — seeded (mulberry32), offline,
**independent oracle**, ~30 unrelated subjects (submarine, ballet, chess,
courtroom, mountaineering, cult, journalism, beekeeping, …):

- **total:** 800 cases (300 × seed 1337, 300 × seed 90210, 200 × seed 4242)
- **passed:** 800 / **failed:** 0
- **false positives** (absent/incidental → CENTRAL): **0**
- **false negatives** (central → not eligible): **0**
- **seeds:** 1337, 90210, 4242 (a second/third unseen seed hold ⇒ not overfit);
  any failure is persisted to `evaluation-results/knowledge/failing-seeds.json`.

Representative: submarine→Das Boot CENTRAL; chess (untouched set on a shelf) not
central; courtroom→A Few Good Men CENTRAL; ballet/poker/sailing lone-tag →
never CENTRAL.

## J. Regression proof (known failure classes)

`src/lib/knowledge/knowledgeRegression.test.ts` (4) + `compile.test.ts` (9):
boxing central (Raging Bull) vs incidental (Snake Eyes); baseball ambiguous
(Moneyball) resolved by adjudication not tag; arbitrary subjects
(submarine/chess/courtroom) with no per-noun code; keyword≠centrality across
ballet/poker/sailing; contradiction→disputed; insufficient→UNKNOWN.

## K. Gates (actual commands + exit codes)

| gate | command | exit |
|---|---|---|
| typecheck | `npm run typecheck` | **0** |
| lint | `npm run lint` | **0** |
| unit | `npx vitest run` | **0** — 3207 passed / 24 skipped / **0 failed** (267 files) |
| build | `npm run build` | **0** |
| migrations | `tsx scripts/checkMigrationsRegistered.ts` | **0** |
| schema | `tsx scripts/checkSchemaContract.ts` | **0** |
| search routing | `playwright -c playwright.searchrouting.config.ts` | **1** — 20/21; the one failure is a live TMDB title-resolution lookup hitting the intentional `harness.invalid` Supabase host (sandbox/network limitation), on a title-routing path the Knowledge Layer does not touch |

New tests added: 34 (compile 9, resolve 6, batch 5, chaos 2/800 cases,
regression 4, snapshot 3, clarify 5).

## L. Remaining weaknesses (critical)

The three code-side items flagged in the first pass are now DONE and tested:
- **Clarification is wired end-to-end** into the real `/api/ask` conversational
  flow (`kind:'clarify'` + `clarifyOptions`), state-aware so it never re-asks a
  resolved ambiguity, with selectable option chips in `AskTheJudge` that re-file
  the case with the answer appended (resolving via the normal parser).
- **The store warm process is implemented**: `warm.ts` (pure, bounded,
  idempotent, version-gated) + `warmStore.runKnowledgeWarmJob` +
  `/api/cron/knowledge-warm` (CRON_SECRET-gated, dormant without TMDB).
- **Compiled tone is consumed in ranking** via a bounded (±4), reward-only,
  eligibility-subordinate nudge applied only to already-eligible survivors.

What genuinely remains:
1. **Live proof pending.** All evidence is offline/unit. Real promotion of a
   compiled MATERIAL fact, the warm cron writing rows, and the tone nudge
   reordering live results need migration 0048 applied + `TMDB_API_KEY` +
   (for tone) `AI_DISCOVERY_MODE=anthropic`; none are verifiable in this sandbox.
2. **`setting` and `anti_evidence` header fields** are compiled and stored but
   only `tone` is consumed in ranking so far; setting/anti-evidence remain
   provenance, not yet signal.
3. **Mobile result cards stay single-column-of-rows (approved design #70), not
   literal 2-across tiles.** The card is a horizontal row (poster + facts +
   synopsis) that already shows 3–4 informative titles per phone screen;
   converting to ~170px 2-across tiles regresses the action row and synopsis
   (documented in `globals.css`), so the shipped design was preserved, not
   flipped. Passes no-3-across / no-overflow.
4. The searchrouting live test cannot run keyless in-sandbox (env, not code).

## M. Production status

**COMPLETE — OFFLINE VERIFIED, LIVE PROOF REMAINS.**

The architecture is implemented, integrated through the one shared pipeline, and
green on every offline gate (typecheck, lint, 3207 unit tests, build,
migrations, schema) with a seeded cross-domain generalization proof (800/800, 0
false positives). Live verification (apply migration 0048 via the owner-gated
runner, warm the store, confirm a compiled MATERIAL fact promotes on the
canonical URL with `TMDB_API_KEY` present) is the remaining step and is an owner
action per this repo's migration governance.

### Exact owner action to go live
```
# Apply the Knowledge Layer schema (owner-gated; never auto-applied):
npm run migrate            # or: POST /api/admin/migrate with MIGRATE_SECRET
# Then a compiled fact promotes the ambiguous band deterministically; the batch
# compiler (compileTitle) can pre-warm facts via a founder/cron pass.
```
