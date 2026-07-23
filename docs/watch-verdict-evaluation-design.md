# WatchVerdict Voice-Search Evaluation — Design

> Companion to `docs/watch-verdict-evaluation-architecture.md` (the system trace).
> This document specifies the evaluation framework itself: the contract, the
> generator, the six evaluator layers, the scorecard, the failure taxonomy, the
> optimization loop, and — importantly — the honesty boundaries.

## 1. Goals and non-goals

**Goal:** a reusable, reproducible framework that tests the *whole* voice-search
experience at scale — from a spoken/typed request to the returned results —
grading understanding, hard-constraint validity, recall, ranking, response
quality, and performance, and localizing failures to a root cause.

**Non-goals:** it is not a set of conventional unit tests, it does not rewrite
the search architecture, and it never deploys or mutates production data.

## 2. Two modes, cleanly separated

| | **Deterministic (fixture) mode** — primary | **Live-observation mode** |
| --- | --- | --- |
| Data | frozen catalog / schedule / profiles / history (`eval/fixtures`) | real TMDB + schedule |
| Determinism | 100% reproducible from a seed | best-effort; differences are observations, not code failures |
| What runs | REAL parsers + a faithful in-process pipeline reference | the real stack, budgeted |
| Grades | all six layers, hard verdicts | freshness, latency, hallucination, availability |
| Use | regression, CI, optimization | drift/health checks |

Live results are never mixed into the deterministic verdicts. Live mode enforces
concurrency, caching, retry limits, and a configurable request/cost budget
(`--max-api-calls`, `--max-cost`).

## 3. What actually runs (faithfulness)

- **Parsing (Layer A)** is graded against the **real** production parsers:
  `naiveParseQuery` (already pure) + the intent detectors extracted verbatim into
  `src/lib/nlu/detectors.ts` (a behavior-preserving refactor, frozen by
  `src/lib/nlu/detectors.test.ts`) + the real `parseRequestedCount`. The
  nondeterministic LLM parse path (`parseAskWithAI`) is deterministic-mode
  excluded and only exercised in live mode.
- **Retrieval / hard constraints / ranking (Layers B/C/D)** run the **real**
  authoritative scoring engine (`buildVerdict`) and the real service-inclusion
  logic (`includedServiceNames`) over the frozen catalog, inside
  `eval/pipeline/fixtureFinder.ts`. This is a *faithful reference of the
  `runFinder` contract* — same steps (candidate pull → exclude seen →
  CANDIDATE_CAP → per-candidate hard filter → rank by personal match → relax on
  empty; broadcast mirrors the in-progress window + dedup) — not a copy of its
  network/DB orchestration (which is `server-only` + TMDB/Supabase-bound).
- **Layer B is independent**: it re-verifies every returned title against the
  frozen fixture facts, never trusting the pipeline's own filtering. A parser
  miss upstream therefore surfaces as an independently-detected constraint
  violation.

This is the honest boundary: two tiny production extractions make the real logic
testable offline; everything graded downstream uses the real deterministic
engine; the network/DB orchestration is exercised only in live mode.

## 4. The normalized contract (Phase 2)

`eval/contract.ts` defines `NormalizedQuery` (a superset translation of the three
production parsers) and the hard-vs-soft split:

- **Hard constraints** (`HardConstraintKind`) invalidate a result: content type,
  network, platform, time window, subscription access, language, excluded
  attribute, duplicates, over-count, hallucination, previously watched/rejected.
  Checked **before** ranking.
- **Soft preferences** affect ranking only (taste DNA, genre, mood, similarity,
  actor/director, pacing, tone, household, novelty, choose-confidence).

Every generated case carries its **intended** `NormalizedQuery` and an
`ExpectedBehavior` (the hard constraints + behavioral flags). Ground truth comes
from the generator's *structure*, never the sentence.

## 5. Generator (Phase 3)

`eval/generator` composes cases from a controlled intent matrix (content types,
time expressions, counts, personalization, positive prefs, exclusions, ambiguity,
transcription noise) across weighted archetypes, then renders a natural sentence,
then optionally applies voice/transcription noise that **preserves the intended
meaning**. Seedable (`mulberry32`) → any run reproduces exactly. Modes: smoke
(~50), standard (~500), full (~5000), stress (~25k), mutation (variants of prior
failures), regression (frozen gold + confirmed failures).

## 6. Fixtures (Phase 4)

`eval/fixtures` freezes a catalog (`TitleMetadata` + independent facts), a
schedule (airings as offsets from a fixed `now`), profiles (`PersonalContext` +
subscriptions + learned dimension profile), and viewing history (watched /
dropped / rejected). Designed to hit every required scenario: exactly-5,
fewer-than-5, none, midnight-crossing, duplicate listings, similar names, reruns
vs premieres, taste-vs-network conflict, weak-DNA, previously watched/rejected,
exclusion-carrying, on-a-service-not-subscribed.

## 7. The six evaluator layers (Phase 5)

- **A — Parsing**: field-by-field accuracy (intent, content type, count, network,
  platform, window, genre, exclusions, household, personalization, availability,
  ambiguity/clarification).
- **B — Hard-constraint validity**: independent verification of every returned
  title; any violation is a major failure even for a strong personalization match.
- **C — Recall**: were known-valid candidates surfaced before ranking? Separates
  retrieval failures from ranking failures.
- **D — Ranking**: order consistency with the DNA match, nDCG, MRR for a
  fixture-forced ideal pick, plus a **separate** relevance judge
  (`eval/evaluator/judge.ts`, deterministic by default; optional structured LLM
  judge behind `EVAL_LLM_JUDGE=1`, never represented as objective truth).
- **E — Response quality**: answers the request, honest about fewer results, no
  implied-unavailable, has a next action, voice-appropriate length, clarifies when
  needed.
- **F — Performance**: parse/pipeline/total latency, external API calls (0 in
  deterministic mode).

## 8. Scorecard + critical thresholds (Phase 6)

Weighted composite: hard-constraint precision 30%, parsing 20%, recall 15%,
ranking 20%, response 10%, reliability 5%. Separately: hard-failure, hallucination,
wrong-time-window, wrong-network/platform, exclusion, duplicate, previously-*
leakage, clarification accuracy, no-result honesty, top-1/top-3 personalization,
nDCG, MRR, parse-field accuracy, p50/p95/p99 latency.

**A run fails if any critical threshold is breached, regardless of the composite.**
Initial thresholds (configurable): hallucination 0%, hard-violation <0.5%,
duplicate <0.5%, time-window <0.5%, crashes 0%, and 0 critical regression on the
regression set.

## 9. Failure taxonomy (Phase 7)

`eval/evaluator/taxonomy.ts` classifies each failure into one primary root cause
(22 categories, upstream-first: a time/entity parse miss is attributed above a
generic intent error). The forensic `failures.jsonl` record carries case id, seed,
raw query, intended vs actual normalized, profile, candidates, results, expected
behavior, scores, root cause, and a recommended fix.

## 10. Optimization loop (Phase 8) — analysis + proposal, never deploy

`eval/runner/optimize.ts`: baseline → cluster failures → rank by frequency ×
severity → propose the *smallest generalizable* fix (preferring normalization /
detectors / filtering order / date math over ranking weights) → freeze the
discovered failures into the permanent regression store → write a proposal for
human review. Applying a fix, re-running compare + holdout, and rejecting any
change with a critical regression is a **human/Skill** action gated on approval.
Config: `maximumIterations`, `minimumImprovement`, `maximumCriticalRegression`,
`maximumAllowedCost`, `stopAfterNoImprovementIterations`.

## 11. Overfitting controls (Phase 9)

Separate modules for generation, ground-truth (fixtures/gold), running (pipeline),
objective validation (layers), relevance judging (judge), failure analysis
(taxonomy), and proposal (optimize). Three dataset splits with distinct seeds:
**development** (inspectable), **regression** (frozen gold + confirmed failures,
never deleted), **holdout** (unseen, hidden from the optimizer). The generator
never grades its own queries; the judge is separate from objective validation.

## 12. Reporting (Phase 10)

Each run writes `evaluation-results/runs/<id>/`: `summary.json`, `metrics.json`,
`cases.jsonl`, `failures.jsonl`, `comparison.json`, `report.md`, and a
self-contained, filterable `report.html` (filter by status, category, archetype,
free text; sortable). A `latest.json` pointer and a committed `baseline/` support
comparison and CI.

## 13. Known honesty caveats

- Deterministic mode grades the **regex/keyword** parse path (the always-present
  fallback). With `OPENAI_API_KEY` set, production also runs the LLM parser; that
  path is gradeable only in live mode and is nondeterministic.
- The pipeline is a faithful *reference* of `runFinder`, not its network/DB code;
  live mode exercises the real stack.
- The deterministic judge scores ranking against the learned dimension profile;
  an LLM judge is optional and never treated as ground truth.
- The catalog has 15 fingerprint axes (the code's real number; docs elsewhere say
  "18" — that discrepancy is itself logged as a finding).
