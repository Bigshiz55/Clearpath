---
name: watchverdict-search
description: >-
  Development guidance for changing WatchVerdict's search / discovery pipeline —
  the shared runFinder core, query parsing, subject eligibility, and the
  compiled Knowledge Layer. Use when editing anything under src/lib/finder*,
  src/lib/nlu/*, src/lib/knowledge/*, src/lib/ai/* or the /api/finder and
  /api/ask routes, or when a search returns wrong/irrelevant results.
---

# watchverdict-search — changing the search pipeline

## Golden rules (do not violate)
1. **One shared pipeline.** Both `/api/finder` and `/api/ask` converge on
   `runFinder` (`src/lib/finder.ts`). Never build a parallel finder or a
   noun-specific search path.
2. **Never solve an isolated noun.** No bespoke keyword list for "boxing", no
   hardcoded title list. Every semantic fix must generalize across unrelated
   subjects (submarine, ballet, chess, courtroom, heist…). If your fix only
   helps one subject, it is wrong.
3. **Keyword presence ≠ subject centrality.** A TMDB tag or a word in the
   overview is candidate RECALL, never proof. Centrality is decided by
   `evaluateSubjectCentrality` (`src/lib/nlu/semanticEligibility.ts`) and the
   compiled Knowledge Layer, not string matching.
4. **Eligibility gates BEFORE ranking.** Taste DNA never ranks a title the
   subject gate rejected. The hard code-guard in `runFinder` throws if an
   ineligible title reaches the ranked set — keep it.
5. **Preserve deterministic hard constraints** (year, language, audio, provider,
   runtime, negation). They are enforced in `scoreCandidate` and at discover
   time; do not weaken them to widen results.
6. **Reject on uncertainty.** For a hard subject, an ambiguous candidate stays
   ineligible unless a compiled fact or an adjudication PROMOTES it. Never
   approve a Snake-Eyes result to fill a shortfall.

## The flow (know it before you touch it)
`query → parse (askParse / naiveParse / ai orchestrator) → FinderQuery →
augmentInternational + applyRequiredSubject → runFinder → TMDB discover →
hard filters (scoreCandidate) → subject eligibility (deterministic → Knowledge
Layer → bounded adjudicator) → rank by Taste DNA → verdict`.

## The Knowledge Layer (compiled subject intelligence)
- `src/lib/knowledge/`: `compile.ts` (pure reconciliation), `store.ts`
  (safe-absent read/write), `resolve.ts` (ambiguous-band decision), `batch.ts`
  (batch compiler + `explainCandidate` observability).
- Compiled facts are consulted BEFORE the per-request LLM adjudicator, so a
  title we already understand is never re-adjudicated (works offline).
- Reconciliation rules are load-bearing: weak keyword-only never earns CENTRAL;
  independent sources raise confidence; contradiction marks DISPUTED;
  insufficient evidence stays UNKNOWN. Bump `COMPILER_VERSION` when you change
  the rules so stale facts are recompiled.

## Step 1 — Reproduce and show root cause FIRST
Write a failing test at the smallest layer (parser, `evaluateSubjectCentrality`,
or `resolveAmbiguousSubject`) that reproduces the bad result. Explain WHY it
happens before changing code.

## Step 2 — Fix at the general layer
Change the shared mechanism, not a special case. Prefer the pure, unit-tested
modules over route code.

## Step 3 — Prove generalization
Run `src/lib/knowledge/knowledgeChaos.test.ts` (randomized cross-domain) and the
red-team (`eval/redteam`). A fix that passes your one case but regresses the
random corpus is rejected.

## Step 4 — Gates
`npm run typecheck && npm run lint && npx vitest run && npm run build`, plus
`npx playwright test -c playwright.searchrouting.config.ts`. For any search-
surface change also run the frozen corpus (`scripts/searchAudit/`) and compare
against baseline SHA `68a5a93` — report the PASS→FAIL / FAIL→PASS delta.

## Notes
- The frozen corpus, its oracle, and its seed are evidence — never edit them to
  make a regression pass (see release-governance skill).
- No LLM in a listing/grid path. The bounded adjudicator (ambiguous band only)
  and the compiled-knowledge reuse are the sanctioned request-path touches.
