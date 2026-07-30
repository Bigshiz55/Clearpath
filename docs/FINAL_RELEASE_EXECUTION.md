# WatchVerdict v1.0 — Final Release Execution Checkpoint

> Persistent, resumable checkpoint for the final autonomous release mission.
> **Preservation rule (non-negotiable):** build on the existing app. Do NOT
> rebuild, replace, or discard working features, branding, routes, accounts,
> watchlists, preferences, or integrations. No force-push. Never expose or
> commit secrets.

_Last updated: 2026-07-25_

## Phase 0 — Baseline & Protect ✅

| Fact | Value |
| --- | --- |
| Repo | `Bigshiz55/Clearpath` |
| Working branch | `claude/watch-verdict-app-wwbtbg` (local ref `prod-fix`) |
| Starting commit | `4461bba` |
| Current commit | see `git log` — mission commits: `83c44ec` (refinement overhaul), `cad439d` (cards/controls/manifest) |
| Backup | local branch `backup/pre-final-release` + tag `v1.0.0-pre-final-release` at `4461bba` |
| Rollback | `git checkout backup/pre-final-release` (or redeploy `4461bba` from Vercel) |
| App version | `1.0.0` |
| Production URL | `clearpath-pearl-chi.vercel.app` |
| Baseline gates | typecheck ✅ · lint ✅ · vitest 502 pass / 4 env-gated skips ✅ · build ✅ |

### Secrets (NAMES only — no values inspected or exposed)
- Server-only: `TMDB_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `OMDB_API_KEY`, `WATCHMODE_API_KEY`, `MIGRATE_SECRET`.
- Client-safe `NEXT_PUBLIC_*`: Supabase URL + publishable key, VAPID public
  key, site/deploy URLs, build metadata.
- No `.env` tracked; secret-value scan clean; runtime env validation
  (`src/lib/env.ts`) keeps `next build` secret-free. ✅
- **Sandbox has NO live keys** → live TMDB/OpenAI/Supabase smoke tests are
  blocked here; they run only against the deployed environment.

### Sandbox limitations (external dependencies, restated honestly)
- No live API keys → live-data smoke tests and provider-availability
  verification are **blocked** in this environment (harnesses + fixture tests
  cover everything else).
- No WebKit binary → Safari claims rest on standards-based fixes
  (`min-width: 0`, wrap fallbacks) + Chromium verification, **not** on a real
  Safari run.
- `/app/*` requires Supabase auth → headless testing uses the
  `MOBILE_HARNESS=1` `/dev/*` harnesses which render the REAL components.

## Priority 1 — search/reco/filter/state correctness ✅
- Constraint architecture (prev. commits `89fed03`, `4461bba`): search-mode
  classifier, media/source ontologies, query planner, hard validator, result
  guard, final media-type guard in `/api/ask`, releases diagnostics.
- **This mission (`83c44ec`):**
  - Killed the hidden `maxRuntime: 150` default — every slider now has a true
    neutral; "Any" sends null, never a secret threshold.
  - `src/lib/refineState.ts`: separated constraint layers (saved < query <
    temporary), `effectiveConstraints`, deterministic `canonicalQueryKey`
    (order/duplicate/neutral-spelling insensitive; every field load-bearing),
    `activeFilterChips`.
  - FinderUI: latest-request-wins (monotonic id + AbortController), staleness
    banner + **Update results** CTA, results-updated confirmation, active
    filter chips, dynamic Submit/Update label.
  - English audio confirmed OFF by default (parser enables it only on explicit
    phrases).
  - Permanent **Family Movie Night** regression flow + property tests
    (`refineState.test.ts`, 11 tests).

## Priority 2 — shared cards / Safari / responsive ✅ (Chromium-proven)
- `poster-grid`: content-aware `minmax(250px, 1fr)` ≥640px + `min-width: 0`
  child guard (Safari min-content escape).
- RatingsStrip ratings row wraps — IMDb can never leave the verdict panel.
- FOR → PASS → SAVE order verified programmatically on every card.
- `Permissions-Policy: microphone=(self)` — the empty allowlist was silently
  breaking production voice search while the mic button still rendered.
- Overflow guard after changes: **140 pass** (15 routes × 5 viewports × 2
  orientations). Safari itself untestable here (no WebKit) — see limitations.

## Priority 3 — control audit ✅ (core surfaces)
- `/dev/finder` harness renders REAL FinderUI + ReleaseWall unauthenticated.
- `tests/mobile/controls.spec.ts` (5 tests): full interaction → state →
  request → validated render loop with intercepted APIs, including the
  mandated **Shows + Upcoming + Soonest + Netflix** sequence (per-click request
  assertions + truthful `unsupported_upcoming_provider` diagnostic + working
  recovery patch) and a real stale-response race (rapid Enter).
- `src/lib/qa/interactionManifest.ts` + coverage-gate test: every manifest
  control must keep a live automated test or CI fails (the gate already caught
  the unasserted PASS button during its own bring-up).

## Priority 4 — testing / security / a11y / perf
- Vitest: 513 pass / 4 env-gated skips (63 files). Playwright: overflow 140,
  controls 5; full matrix run recorded below.
- Security: headers (nosniff, DENY, HSTS, referrer, permissions) ✅; admin
  routes auth-gated (`/api/admin/migrate` needs `MIGRATE_SECRET`/admin;
  founder routes verify identity server-side; `/dev/*` 404 without
  `MOBILE_HARNESS=1`, which production never sets) ✅; no tracked env files ✅;
  0 TODO/FIXME; 1 intentional server-side telemetry log.
- A11y: 44px tap-target + focus/roles assertions live in the Playwright
  suites; card actions have accessible names (verified in controls suite).
- Perf: build budget unchanged (First Load JS shared 87.4 kB; middleware
  83.1 kB); images lazy-load; grids CDN-cached ratings endpoint.

## Remaining work / honest gaps
1. Live-data smoke tests + provider availability: **blocked** (no keys here);
   run `eval/live` suites in a keyed environment or against production.
2. Real Safari/WebKit + Firefox runs: **blocked** (Chromium only in sandbox).
3. Full pairwise combination sweep across every provider chip and every
   route's every control: core combos are covered; the long tail is enumerated
   in the interaction manifest for expansion.
4. WCAG AA formal audit (contrast measurement, screen-reader pass): partial —
   programmatic checks only.

## Next action
- Push `prod-fix` → `claude/watch-verdict-app-wwbtbg` (fast-forward), verify
  Vercel deploy badge shows the new SHA, then run live smoke tests against the
  deployed URL (the only environment with keys).
- Next command: `git push origin prod-fix:refs/heads/claude/watch-verdict-app-wwbtbg`
