# Verdict Growth OS — Cost-Control Plan

The mission includes **sustainable CAC** and **low AI/infra cost per active
user**. Cost control is therefore a first-class, in-code concern — not a policy
document that hopes for good behavior.

## Enforced in code today

| Control | Where | Behavior |
| --- | --- | --- |
| Daily cost ceiling | `src/lib/domain/cost.ts` → `checkCostCeiling` | A job asks before every spend; a charge that would breach the ceiling is refused and the job aborts (`aborted_cost`). |
| Warn threshold | `cost.ts` → `shouldWarn` (default 80%) | Surfaces a warning before the wall so operators can intervene. |
| Duplicate-run prevention | `src/lib/domain/jobs.ts` → `evaluateJobStart` | An idempotency key seen before is `skipped_duplicate`, never re-executed. |
| Emergency stop | `jobs.ts` (checked first) + `scheduled_jobs.emergency_stop` | A single flag halts all job starts immediately. |
| Per-product ceilings | `src/lib/registry.ts` `costLimits` + `products` table | Each product declares `dailyLlmUsdCeiling`, `dailyJobRunCeiling`, `maxAiCostPerActiveUserUsd`. |
| Cost/active-user visibility | `src/lib/domain/revenue.ts` + `/revenue` | LLM+infra ÷ active users shown per product with a live ceiling bar. |

All of the above are covered by unit tests (`cost.test.ts`, `jobs.test.ts`).

## Budgets (defaults; tune per product in the registry)

- WatchVerdict: **$5/day** LLM ceiling, 500 job runs/day, ≤ **$0.05** AI cost per
  active user.
- ReadVerdict: **$3/day** LLM ceiling, 300 job runs/day, ≤ **$0.05** per active
  user.
- Env overrides: `GROWTH_OS_DAILY_LLM_USD_CEILING`, `GROWTH_OS_DAILY_JOB_RUN_CEILING`.

## LLM cost discipline (when LLMs are introduced)

LLMs are used only for **drafting and summarization**, never for ranking or
approval decisions (those stay in the pure engine). To keep cost per active user
low:

- Prefer small models (e.g. gpt-4o-mini class) for classification/summaries.
- **Cache** derived artifacts (classifications, summaries) so a title/opportunity
  is processed once, not per request — the same pattern WatchVerdict uses for
  its content fingerprint cache.
- Batch nightly rather than per-request where possible.
- Every LLM call is a metered job run subject to `checkCostCeiling`.

## Paid spend discipline

- There is **no automatic advertising spend** and **no billing write path** in
  v1. Any paid campaign or budget increase is an approval-gated action with an
  explicit `costUsd`, reversibility, and evidence, decided by a human.
- Budget increases are their own approval action type — they can never be a side
  effect of another action.

## Monitoring & review

- The Integrations page shows every job's ceiling and utilization.
- The Audit log records every decision and (later) every job run and its cost.
- Recommended cadence: review cost/active-user and LTV:CAC weekly; any product
  exceeding its `maxAiCostPerActiveUserUsd` generates a cost-signal observation
  that surfaces in the briefing.
