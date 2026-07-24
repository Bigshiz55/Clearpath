# WatchVerdict — Release Checklist

**Date:** 2026-07-24
**Branch:** `feature/search-dna-and-search-lab`
**Reviewer:** Automated engineering review (CI environment — no live secrets, no physical device)

---

## How to read this document

Every row carries exactly one status. The statuses mean precisely this, and
nothing is upgraded on assumption:

| Status | Meaning |
|--------|---------|
| **PASS** | Verified in this environment by an automated test that actually executed and asserted the behavior. The evidence column names the test. |
| **FAIL** | Executed and the behavior was wrong. |
| **NOT TESTED** | No test in this environment exercised the real behavior. Usually because it needs live secrets (TMDB/Supabase/OpenAI), an authenticated session, or a real device — none of which exist in this CI sandbox. **This is the honest default; it is not a soft PASS.** |
| **BLOCKED** | Cannot be tested here at all until an external precondition is met (secrets provisioned, deployment URL, real hardware). The blocker is named. |

**Rule honored throughout: nothing is marked PASS that was not verified. PASS is never inferred.**

### What "verified in this environment" can and cannot cover

This sandbox has: the source tree, Node, a headless Chromium, and the ability to
run `typecheck` / `lint` / `unit tests` / a production `build` / the Playwright
**responsive harness** (which drives `/dev/responsive`, a component gallery with
mock data — **not** the live app).

This sandbox does **not** have: `TMDB_API_KEY`, Supabase URL/keys,
`OPENAI_API_KEY`, an authenticated user, a live database, a deployed URL, or any
iPhone/Android device. Therefore **every flow whose correctness depends on live
data or auth is NOT TESTED here** — by design, the integration (`npm run
test:integration`) and E2E (`npm run test:e2e`) suites created in this pass are
the mechanism to turn those into PASS **once run against a real deployment with
secrets**. Until someone runs them there, they remain NOT TESTED.

---

## A. Build, type safety, and static gates (verified here)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| A1 | TypeScript compiles with no errors (`strict`) | **PASS** | `npx tsc --noEmit` → exit 0 |
| A2 | Production build succeeds with **no secrets present** | **PASS** | `npm run build` → exit 0 (env validated at runtime, not build time) |
| A3 | Unit test suite green | **PASS** | `npm test` → **412 passed, 37 files, 0 failed** |
| A4 | ESLint clean | **PASS** | `npm run verify` → lint step exit 0 |
| A5 | No secret leaks in client bundle (server-only modules) | **NOT TESTED** | Architectural guard (`import 'server-only'`) enforced by convention + build; not asserted by an automated leak scan here |

## B. Deterministic scoring engine (verified here)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| B1 | 7 spec scenarios pass | **PASS** | `src/lib/scoring/*.test.ts` within the 412-test run |
| B2 | Engine is pure / no I/O | **PASS** | Unit tests run with no network/secret and pass |
| B3 | AI adjustment layer degrades to deterministic score on failure | **PASS** | `src/lib/aiAdjust.test.ts` (5 tests) |
| B4 | Ratings normalization (IMDb/critics/audience) | **PASS** | `src/lib/ratings.test.ts` (9), `src/lib/tmdb/meta-helpers.test.ts` (8) |

## C. Live Court — reliability spine (unit-verified here; live NOT TESTED)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| C1 | Canonical invite-URL service (same-deployment guarantee, override) | **PASS** | `src/lib/court/inviteUrl.test.ts` (12 tests) |
| C2 | Join-state classifier / distinct recovery states | **PASS** | `src/lib/court/joinState.test.ts` (8 tests) |
| C3 | Genre-Draft engine (deck, group score) | **PASS** | `src/lib/court/*.test.ts` (15 tests) |
| C4 | Court UI states render (error card, invite box, recovery) | **PASS** | `tests/responsive/court-states.spec.ts`, `court-invite.spec.ts` (Playwright harness, mock data) |
| C5 | **Real room create → join → idempotent re-join → picks → close** against live Supabase | **NOT TESTED** | Test written: `tests/integration/court.int.ts`. Skips here (no Supabase env). Run with secrets to promote to PASS. |
| C6 | **Idempotent join produces no ghost participant** on a real DB | **NOT TESTED** | Asserted by `court.int.ts` (`pid2 === pid1`), but only executes with live Supabase |
| C7 | **Two real devices see each other** (polling sync) | **NOT TESTED** | Needs live DB + a second client; `court.int.ts` covers server truth, not two browsers |
| C8 | `court_health` / migration 0023 applied on target project | **NOT TESTED** | `court.int.ts` `beforeAll` asserts it — only against a live project |
| C9 | Invite share on real iPhone Safari / installed PWA | **BLOCKED** | Requires a physical iPhone — see Device Validation Checklist |

## D. Core product flows (all NOT TESTED here — need live stack + auth)

| # | Flow | Status | Path to PASS |
|---|------|--------|--------------|
| D1 | Sign in (magic link / password) | **NOT TESTED** | `tests/e2e/app.e2e.ts::signIn` — needs `PLAYWRIGHT_E2E_URL` + test creds |
| D2 | Search returns live TMDB results | **NOT TESTED** | `tmdb.int.ts` (server) + `app.e2e.ts` search test — needs `TMDB_API_KEY` / deployment |
| D3 | Streaming-provider availability shown honestly | **NOT TESTED** | `tmdb.int.ts` watch/providers — needs `TMDB_API_KEY` |
| D4 | Recommendation engine returns ranked titles | **NOT TESTED** | `app.e2e.ts` recommendations — needs auth + live stack |
| D5 | Title / Watchability verdict page renders | **NOT TESTED** | `app.e2e.ts` title test — needs live TMDB |
| D6 | Judge Verdict flow | **NOT TESTED** | No live-stack test exercises `/api/judge` end-to-end yet |
| D7 | Watch DNA persistence across sessions | **NOT TESTED** | `app.e2e.ts` DNA page renders, but round-trip persistence needs a seeded account + two sessions |
| D8 | Watchlist add/remove persists | **NOT TESTED** | `app.e2e.ts` watchlist renders; mutation persistence not asserted against live DB |
| D9 | Group rooms / Together | **NOT TESTED** | No live-stack automated test yet |
| D10 | Realtime / polling synchronization | **NOT TESTED** | Polling logic unit-covered; live sync not exercised |
| D11 | Anonymous guest session (middleware `signInAnonymously`) | **NOT TESTED** | `auth.int.ts` verifies it against live Supabase (or reports it disabled) — skips here |
| D12 | Public share page (`get_public_share` RPC) | **NOT TESTED** | Needs live Supabase |

## E. Public surfaces & error recovery (test written; runs against a deployment)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| E1 | Landing + public routes render without 5xx | **NOT TESTED** | `tests/e2e/smoke.e2e.ts` — skips without `PLAYWRIGHT_E2E_URL` |
| E2 | Unknown Court/join room shows recovery, never endless spinner | **NOT TESTED (live)** / **PASS (harness)** | Live: `smoke.e2e.ts`; harness state: `court-states.spec.ts` |
| E3 | `/api/court/health` reports readiness **without leaking secrets** | **NOT TESTED** | `smoke.e2e.ts` asserts no `service_role`/JWT in body — runs against a deployment |
| E4 | `/api/health` responds (no 5xx) | **NOT TESTED** | `smoke.e2e.ts` — needs deployment |

## F. Responsive / mobile layout (verified here via harness)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| F1 | No horizontal scroll at 320–1280px | **PASS** | `tests/responsive/layout.spec.ts` — **57 responsive Playwright tests pass** (full `playwright.config.ts` run, exit 0) |
| F2 | Single-column card grid below 600px | **PASS** | `layout.spec.ts` + dedicated 390px test |
| F3 | IMDb never shows `—` / `0.0` / `NaN`; hidden cleanly when missing | **PASS** | `layout.spec.ts` IMDb missing-value tests |
| F4 | Logo wordmark complete/unclipped at every width | **PASS** | `layout.spec.ts::assertLogoComplete` |
| F5 | Tap targets ≥40px; content clears fixed bottom nav | **PASS** | `layout.spec.ts` |
| F6 | Text scaling 100–200% no overflow | **PASS** | `layout.spec.ts` scaling tests |
| F7 | Real-device rendering (Safari/Chrome on iPhone) | **BLOCKED** | Harness is headless Chromium at CSS widths — **not** a real iOS Safari. See Device Validation Checklist |

---

## Summary of counts (this environment)

- **PASS (verified here):** static gates (A1–A3), deterministic engine (B1–B4), Court unit spine (C1–C4), responsive harness (F1–F6).
- **NOT TESTED:** every live-data / authenticated / realtime flow (Section D almost entirely; C5–C8; E1–E4). Tests exist and are wired; they execute only with secrets or a deployment URL.
- **BLOCKED:** real-device behavior (C9, F7) — needs physical iPhones.
- **FAIL:** none recorded.

**Bottom line:** the deterministic core, the Court reliability logic, and the
mobile layout are verified. **The end-to-end product against the real stack is
NOT YET VERIFIED in this environment** and must be proven by running
`test:integration` + `test:e2e` against a live deployment with secrets, plus the
Device Validation Checklist on hardware, before any of Section D can move to PASS.
