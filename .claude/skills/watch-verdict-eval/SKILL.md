---
name: watch-verdict-eval
description: >-
  Run the WatchVerdict Voice-Search Evaluation & Optimization framework. Use when
  the user wants to evaluate, benchmark, regression-test, or improve the voice
  search / parsing / ranking pipeline, or asks to run "the eval", check for
  search regressions, or propose search-quality fixes. Args: smoke | standard |
  full | stress | regression | live | analyze | optimize | compare | baseline.
---

# WatchVerdict Voice-Search Eval

You are driving the evaluation framework in `eval/` (design: `docs/watch-verdict-evaluation-design.md`, architecture: `docs/watch-verdict-evaluation-architecture.md`). It generates synthetic voice searches, runs them through the **real** parsers + a faithful deterministic pipeline, grades six layers, and reports where WatchVerdict fails — all offline and reproducible.

## Golden rules (do not violate)
1. **Never deploy.** This skill never pushes to production, never runs `next build && deploy`, never touches Vercel/Supabase dashboards.
2. **Never weaken a test to make it pass.** A red run that reflects a real bug is a correct result. Report it.
3. **Never delete failed cases after a fix.** Confirmed failures become permanent regression cases (`eval/gold/regression.json`).
4. **Ask before any code change.** Analysis and reports are safe to run unprompted; editing `src/**` to apply a proposed fix requires explicit user approval via `AskUserQuestion`.
5. **Don't overwrite uncommitted work.** Check git state first (below).

## Step 1 — check git state (always)
Run `git status --porcelain`. If there are uncommitted changes in `src/**` or `eval/**`, tell the user what's dirty and ask whether to proceed before running anything that writes files. Eval runs only write under `evaluation-results/runs/` (gitignored), so a report-only run is safe, but a fix would collide.

## Step 2 — run the requested mode
Map the arg to a command (all are dependency-free, offline):

| arg | command | what it does |
| --- | --- | --- |
| `smoke` | `node eval/cli.mjs smoke` | ~50 cases, fast sanity |
| `standard` | `node eval/cli.mjs standard` | ~500 cases |
| `full` | `node eval/cli.mjs full` | ~5000 cases |
| `stress` | `node eval/cli.mjs stress` | 25k cases |
| `regression` | `node eval/cli.mjs regression` | frozen gold + confirmed failures; **asserts** thresholds |
| `compare` | `node eval/cli.mjs compare` | current vs committed baseline; flags critical regressions |
| `baseline` | `node eval/cli.mjs baseline` | run + save as the tracked baseline (ask first — it moves the goalposts) |
| `live` | `node eval/cli.mjs live` | small budgeted run against real TMDB/schedule (needs TMDB_API_KEY; respects `--max-api-calls`/`--max-cost`) |
| `analyze` | `node eval/cli.mjs analyze` | run current mode, print failure clusters, no writes to gold |
| `optimize` | `node eval/cli.mjs optimize` | baseline → cluster → freeze failures → write proposal (no code edits) |

Pass through flags the user gives: `--seed N --cases N --profile scott --network lifetime --intent platform_browse --max-api-calls N --max-cost N --baseline PATH`.

## Step 3 — report the location + summarize the critical findings
Each run prints a summary and writes `evaluation-results/runs/<id>/` with `report.html` (open this), `report.md`, `summary.json`, `metrics.json`, `cases.jsonl`, `failures.jsonl`. In your reply:
- State PASS/FAIL and the **critical breaches** (hallucination, hard-violation, duplicate, time-window rates, crashes).
- Give the composite, pass rate, intent accuracy, and the **top 3 failure clusters** with counts.
- Point to `report.html` for the filterable view.
- Do NOT paste the whole cases table — surface the few most damaging failures.

## Step 4 — propose fixes (never apply unprompted)
For `optimize`/`analyze`, read the top cluster's `recommendedFix`. Prefer fixes to **normalization / detectors / filtering order / date math**, NOT ranking weights (only touch ranking if evidence shows the ranking model is the source). Present the smallest generalizable change and the affected file (usually `src/lib/nlu/detectors.ts`, `src/lib/finderParse.ts`, or the build-case route). Then:
- Use `AskUserQuestion` to confirm before editing any `src/**` file.
- If approved: make the change, update the frozen characterization test in `src/lib/nlu/detectors.test.ts` **on purpose**, then run `node eval/cli.mjs compare` AND `node eval/cli.mjs holdout`.
- **Reject** the change (revert) if it introduces ANY critical regression vs baseline or fails to generalize on the holdout split. Report the outcome.
- A cluster tagged "product decision" (ambiguity handling, ranking philosophy) → stop and ask the user; do not guess.

## Step 5 — regression hygiene
After confirming a real failure, ensure it is frozen into the regression set (the `optimize` command does this automatically via `freezeFailuresAsRegression`). Never remove a gold or regression case to make a run green.

## Notes
- Gate before committing any code change: `npm run typecheck && npm run lint && npm test && npm run build` (per CLAUDE.md).
- The two production touch-points the framework relies on (`src/lib/nlu/detectors.ts` and the `parseRequestedCount` re-export) are behavior-preserving extractions covered by `src/lib/nlu/detectors.test.ts`. If you change a detector's behavior, update those expectations deliberately.
