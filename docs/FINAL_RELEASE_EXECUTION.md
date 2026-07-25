# WatchVerdict v1.0 — Final Release Execution Checkpoint

> Persistent, resumable checkpoint for the final autonomous release mission.
> **Preservation rule (non-negotiable):** build on the existing app. Do NOT
> rebuild, replace, or discard working features, branding, routes, accounts,
> watchlists, preferences, or integrations. No force-push. Never expose or
> commit secrets.

_Last updated: 2026-07-25_

## Phase 0 — Baseline & Protect

| Fact | Value |
| --- | --- |
| Repo | `Bigshiz55/Clearpath` |
| Working branch | `claude/watch-verdict-app-wwbtbg` (pushed via `prod-fix` local ref) |
| Baseline commit | `4461bba` (matches `origin/claude/watch-verdict-app-wwbtbg`) |
| App version | `1.0.0` (`package.json`) |
| Framework | Next.js 14 App Router · TypeScript strict · Supabase · TMDB |
| Production URL | `clearpath-pearl-chi.vercel.app` |
| Preview URL | `clearpath-pearl-chi-git-feature-team.vercel.app` |
| Test files | 62 `*.test.ts` at baseline |

### Secrets / credentials (NAMES ONLY — no values inspected or exposed)
- Server-only (must NOT get `NEXT_PUBLIC_`): `TMDB_API_KEY`, `OPENAI_API_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `OMDB_API_KEY`, `WATCHMODE_API_KEY`.
- Client-safe (`NEXT_PUBLIC_*`): Supabase URL + publishable key, VAPID public
  key, site/deploy URL, build-metadata vars.
- **No real `.env` is tracked** (only `.env.example`); secret-value scan is
  clean. ✅
- Env is validated at runtime (`src/lib/env.ts`), not at build time — `next
  build` works without secrets. ✅

### Sandbox limitations (hard external dependencies — cannot be worked around)
- **No live keys** (TMDB/OpenAI/Supabase) → cannot run live queries, verify
  real provider availability, or produce live screenshots.
- **No WebKit** in the sandbox → cannot run real iOS/Safari rendering tests
  (Chromium ≠ iOS Safari; do not claim Safari "PASS" from Chromium runs).
- **`/app/*` needs Supabase auth** → authenticated pages can't render headless;
  `/dev/*` harnesses (gated by `MOBILE_HARNESS=1`) render the REAL components
  for offline testing.

### Baseline gate results
- Recorded below once the baseline run completes.

## Phase 1 — Correctness (search / recommendation / filter / state)
- Architecture already shipped (commit `89fed03`): search-mode classifier,
  media + source ontologies, structured query planner, hard constraint
  validator, result guard, media-type final guard in `/api/ask`.
- Releases empty-state diagnostics + stale-response guard shipped (`4461bba`).
- **Open:** filter/refinement effective-constraint state overhaul (English-audio
  off by default, effective constraints, plan-derived cache keys, stale-response
  cancellation, "Update results" CTA, Family Movie Night flow).

## Phase 2 — Card / Safari / responsive
- **Open:** shared content-card system + laptop-Safari redesign (grid
  `minmax(250px)`, FOR/PASS/SAVE row, verdict panel + IMDb inside border, Safari
  `min-width:0`/`box-sizing`, header zones). Only quiz overflow-clip +
  AlgorithmScore flex-wrap done so far.

## Phase 3 — Audit every interactive control
- Releases wall controls traced & instrumented. Remaining controls pending.

## Phase 4 — Testing / a11y / perf / security / deploy / rollback
- Overflow guard (140 cases) + visual-QA matrix shipping. a11y/perf/security
  sweeps pending.

## Release Readiness Report
- Written at the end of the mission, with the 5 biggest launch-failure risks.
