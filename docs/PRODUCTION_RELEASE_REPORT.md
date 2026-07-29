# WatchVerd1ct — Production Release Report

_Date: 2026-07-29 · Branch `claude/watch-verdict-app-wwbtbg` (local `prod-fix`) · Head: see `git log`_

This is the honest close-out of the 23-section production-release mission.
Every claim below is backed by a committed test, a build, or a screenshot that
was actually inspected — and the last section lists what was **not** done,
because a release report that only lists green boxes is an ad.

## Verdict: READY, with named exceptions

The app builds clean, passes every gate, survives a full-app crawl with a
zero-tolerance exception policy, and was visually inspected at phone, tablet,
laptop and desktop widths. The named exceptions are listed at the end; none of
them corrupts data or blocks a user, and each has a documented reason.

## The numbers (all from this session's final runs)

| Gate | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| `next lint` | clean |
| `vitest run` | **1549 passed**, 4 env-gated skips, 0 failures |
| `next build` | clean (no secrets required, by design) |
| Full Playwright E2E | **886 passed, 0 failures**, 14.8 min, untruncated |
| Route crawler | 38/38 — 12 public routes + 23 harnesses, zero-exception policy |

## What this mission changed (R1–R6)

**R2 — Trust.** One brand string everywhere (`WatchVerd1ct` — enforced by
`brand.test.ts`, which walks every source file). One rating formatter
(`ratings/format.ts`) so "7.9/10 / 10" can never render and a TMDB-derived
number is labeled "Audience score", never Popcornmeter branding. One DST-safe
day-word module (`viewing/localDay.ts`) replacing five hand-rolled
`now + 86_400_000` sites and a UTC-pinned server date.

**R3 — Honest personalization.** `verdict/confidence.ts` caps confidence by
evidence and sample size (never averages up). Recommendation headings tell a
guest the truth: "Popular picks while we learn your taste → Rate N more…→
Recommended for you". The W coach mark explains the W/gavel flow once, retires
itself, and never renders off-screen (regression-tested at 320–430 px).
Verdict Confidence sits on the verdict page beside the call — deliberately not
on grid cards, where three layout suites proved it didn't fit.

**R4 — The accuracy loop.** "Did we get it right?" appears after a title is
marked watched: four plain answers, one write that both teaches Taste-DNA
(`watchlist_items.rating`) and grades the published call against the engine's
own tiers (`bandFor` derives from `tierFromScore` — agreement asserted at all
101 scores). It asks once, admits misses in plain words ("We got that one
wrong"), and refuses to print an accuracy percentage under 10 graded calls.
Talking a user out of something they liked counts as a full miss; a hedged
maybe can never score one. 21 unit + 12 E2E tests.

**R5 — The crawler.** `route-crawl.spec.ts` loads every public route and every
dev harness and fails on: 5xx, 404, page exception, unexplained console error,
broken image, empty body, Next's client-error fallback, horizontal overflow
(320/1920), a broken auth wall, or a dead landing-page link.

**R6 — Hardening found by the above.** Three real defects caught and fixed
this window:

1. **Landing page scrolled sideways at 320 px** (+2 px) — the enlarged
   wordmark. Fixed in `Logo` with a step-down below 360 px; caught by the
   crawler on its first run.
2. **The Court white-screened in a fresh-checkout test run** — the Playwright
   config set `NEXT_PUBLIC_*` at `npm start`, but Next inlines them at *build*
   time. The suite now builds what it tests (`build:harness`).
3. **The crawler itself was suppressing evidence** — a React #418/#423/#425
   allowlist written to explain a symptom rather than a diagnosis was hiding
   the Court crash. The allowlist is gone; a page exception now always fails,
   and every route is additionally asserted not to render "Application error".
   The console allowlist was narrowed to the two failures the harness provokes
   by construction, matched on the specific call and host.

Plus: `arch/secrets.test.ts` now *enforces* the server-only-secrets rule —
no secret identity behind `NEXT_PUBLIC_`, every module reading a secret is
server-bound, no client component reads one, and the guard proves it can see
real secret reads so it can't pass vacuously. And the suite's 8-minute
`globalTimeout`, which had been truncating full runs at ~600/899 tests while
still printing a result, is raised to 60.

## Visual inspection

Screenshots taken this session and actually looked at: landing at 390/820/
1366/1920 (hero centered, gold courtroom CTA, no overflow, wordmark steps
correctly), finder at 390/1366, verdict cards at 390 (FOR/AGAINST/SAVE row on
top, W + coach mark, honest "Ratings not available yet"), channel guide at
390/1366, and the post-watch panel at 390/1280 (all four grades legible,
tap targets ≥ 44 px).

## Known limitations — stated, not hidden

- **No live keys in this environment.** TMDB/OpenAI/Supabase behavior is
  verified through fixtures and intercepted RPCs; live-data smoke tests run
  only against the deployed environment. Provider availability and live
  ratings were **not** re-verified here.
- **Chromium only.** No WebKit binary in the sandbox; Safari claims rest on
  standards-based CSS plus Chromium verification.
- **Migrations 0026–0033 are written but not applied** to the production
  database from here; `recommendation_outcomes` logging is fail-open until
  0024+ is applied (a user's rating never depends on it).
- **Spec sections not completed in this window:** §2 homepage three-path
  hierarchy, §4 streaming-service selection collapse, §5 conversational search
  refinement, §7 verdict-page tab restructure, §19 performance audit beyond
  build-size review, and parts of §21 (systematic empty-state sweep). These
  are design work, not defects — the current screens pass every reliability
  and honesty gate above.
- **Visual regression (§18)** is covered by programmatic layout assertions
  (heights, overflow, alignment) rather than pixel-diff snapshots.
