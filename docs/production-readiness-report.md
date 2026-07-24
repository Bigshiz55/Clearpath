# WatchVerdict — Production Readiness Report

**Date:** 2026-07-24
**Branch:** `feature/search-dna-and-search-lab`
**Scope:** Full-app readiness for a public launch to ~100,000 users.
**Author:** Automated engineering review (CI sandbox — no live secrets, no device, no deployment URL).

> Companion documents: `release-checklist.md` (per-feature PASS/FAIL/NOT TESTED/BLOCKED),
> `device-validation-checklist.md` (the on-hardware steps this environment cannot run).

---

## 0. The honest headline

**Would I ship WatchVerdict to 100,000 users today? No — not yet.**

Not because a specific defect is known to be broken, but because **the opposite of
"broken" has not been demonstrated.** The parts that can be proven in a headless CI
sandbox are proven and green (deterministic engine, type safety, build, mobile
layout, Court reliability *logic*). But **every flow whose correctness depends on
the live stack — real TMDB, real Supabase, an authenticated user, a real
database, real streaming data, two real phones in a Court — has not been executed
end-to-end even once in a verifiable way.** Shipping to 100k users means those
flows carry real load on day one, and "it typechecks and the unit tests pass" is
not evidence that they work.

This pass **built the machinery to close that gap** (an env-gated integration
suite and an expanded E2E suite that run against a real deployment the moment
secrets exist), but running them against production is a step that has **not**
happened here. Until it does, the responsible status is **NO-GO for 100k**, with a
clear, short path to GO.

**Risk level for an immediate 100k launch: HIGH.**
**Risk level for a small, monitored beta (≤ a few hundred invited users): MODERATE** — acceptable if paired with the go-live gate in §8.

---

## 1. What IS verified (and is genuinely solid)

All of the following executed in this environment and passed — no inference:

- **Type safety:** `tsc --noEmit` clean (strict mode).
- **Build:** `next build` succeeds with **no secrets present** (env validated at runtime, per architecture).
- **Unit tests:** **412 passing across 37 files, 0 failing.** Includes the 7 deterministic spec scenarios, ratings normalization, AI-adjust degradation, and the entire Court reliability core (invite-URL, join-state classifier, guest-id, Genre-Draft engine).
- **Lint:** clean.
- **Mobile/responsive layout:** **57 Playwright tests passing** across 320–1920px — no horizontal scroll, single-column below 600px, IMDb never renders as `—`/`0.0`/`NaN`, logo always complete, tap targets ≥40px, content clears the fixed bottom nav, text scaling to 200%.
- **No orphaned processes** after the full verify + responsive run (harness server torn down cleanly; port released).

This is a real foundation. The deterministic scoring engine — the product's core
value — is authoritative, pure, and well-tested.

## 2. What is NOT verified (the gap that blocks 100k)

None of these has been executed end-to-end in a way this report can vouch for:

- **Live TMDB** — search results, watch/provider (streaming) availability. Test exists (`tests/integration/tmdb.int.ts`) but skips without `TMDB_API_KEY`.
- **Live Supabase** — auth, RLS, mutations, the `get_public_share` RPC, Court RPCs. Tests exist (`court.int.ts`, `auth.int.ts`) but skip without Supabase env.
- **Authenticated product journeys** — sign-in, search→verdict, recommendations, Judge Verdict, Watch DNA persistence, watchlist persistence, Together/group rooms. E2E written (`tests/e2e/app.e2e.ts`) but skips without `PLAYWRIGHT_E2E_URL` + test credentials.
- **Live Court with two real devices** — the actual "friends can't join" scenario. Server-side lifecycle is covered by `court.int.ts` *when run live*; two-browser sync and the iMessage share sheet require hardware (`device-validation-checklist.md`).
- **Real database under concurrency / load** — no load test has been run.
- **Migration 0023 actually applied on the production project** — asserted by `court.int.ts` `beforeAll` only against a live project.

**These are NOT TESTED, not PASS. They must not be presented as working.**

## 3. Known issues / open risks

| Area | Issue | Severity | Notes |
|------|-------|----------|-------|
| Live stack | Zero end-to-end verification against real TMDB/Supabase/auth | **High** | The core launch risk. Mitigation = run the new suites against a preview deploy with secrets. |
| Court | Depends on migration 0023 being applied AND both clients on the same deployment URL | **High** | Historically the exact cause of "friends can't join." `/api/court/health` is the pre-flight check; make it part of go-live. |
| Auth | Guest access requires "Anonymous sign-ins" enabled in Supabase; if off, middleware falls back to `/login` | **Medium** | `auth.int.ts` detects and reports this. Confirm the setting before launch. |
| AI features | `aiAdjust`, dimension classifier, judge, ask/clarify depend on `OPENAI_API_KEY` and external latency/quota | **Medium** | Designed to degrade to deterministic output on failure (unit-tested), but real-world timeout/quota behavior at 100k is unmeasured. |
| Secrets hygiene | No automated scan proving no secret reaches the client bundle | **Medium** | Enforced by `import 'server-only'` convention + build; `smoke.e2e.ts` checks the Court health endpoint doesn't leak, but a full bundle scan is not implemented. |
| Rate limits | TMDB and OpenAI rate limits under 100k concurrent users are unmodeled | **Medium** | No caching/backoff load profile validated at scale. |

## 4. Technical debt

- **Test coverage is uneven:** excellent on pure logic (scoring, Court core, search-lab), thin on the integration seam between the app and its live services — exactly where production incidents happen. The new integration/E2E suites narrow this but are not yet run.
- **Two Playwright configs** (`playwright.config.ts` harness vs `playwright.e2e.config.ts` live). Intentional, but a contributor must know which to run. Documented in the config headers.
- **`verify.sh` runs a curated subset** of Playwright specs, not the full responsive suite, to stay fast and orphan-safe. The full 57-test suite must be run separately (as done for this report). Consider a `verify:full` target.
- **Migrations self-apply via `/api/admin/migrate`** (base64-embedded, idempotent). Convenient, but production migration state should be confirmed explicitly, not assumed.
- **Many routes exist** (`/app/*` ≈ 30 screens). This report and the E2E suite exercise the core spine; the long tail (quiz, mentalist, vintage, chambers, subscriptions admin, etc.) is **NOT TESTED** and should be triaged before a wide launch.

## 5. Performance risks

- **Cold-start + external latency:** every core screen fans out to TMDB (and sometimes OpenAI). p95 latency under real conditions is **unmeasured**. Risk of slow first paints at scale.
- **No load/soak test:** behavior at 100k users — DB connection limits, TMDB rate limits, OpenAI quota — is unknown. This is a launch-gating unknown, not a known-good.
- **Polling-based Court:** deliberately chosen over Realtime for reliability, with bounded/visibility-aware backoff. At 100k concurrent rooms the aggregate `court_state` RPC load is unmodeled.
- **Positive signals:** production build completes and generates 51 static pages; env is validated lazily so cold builds are clean; polling is bounded (no runaway loops). But these are structural, not measured-under-load.

## 6. Security concerns

- **Secrets are server-only by construction** (`TMDB_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` never `NEXT_PUBLIC_`, server modules start with `import 'server-only'`). Verified by code convention + successful secretless build; **not** verified by an automated bundle secret-scan.
- **RLS on every user table**; public share reads go only through the `get_public_share` SECURITY DEFINER RPC (no broad anon SELECT on `shares`). **Correctness NOT TESTED against a live DB** — needs the integration suite run with Supabase env.
- **Auth uses `getUser()` (not `getSession()`)** for identity — correct pattern. Middleware gates `/app` and `/lite`.
- **Court health endpoint** is designed to be secretless; `smoke.e2e.ts` asserts no `service_role`/JWT leaks — **runs only against a deployment.**
- **Open-redirect guard** on the login `next` param (internal absolute paths only) — present in code; not adversarially tested here.
- **No automated dependency-vulnerability (audit) scan** was run in this pass.

## 7. Accessibility, mobile, browser compatibility

- **Accessibility score: NOT MEASURED.** No axe/Lighthouse a11y audit was run in this environment. Semantic labels and focus order exist in code but are unscored. VoiceOver is a device-checklist item. **Do not claim a number.**
- **Mobile responsiveness: STRONG (verified).** 57 Playwright tests across all required widths + text scaling pass. **Caveat:** the harness is headless Chromium at CSS widths — **real iOS Safari rendering is NOT TESTED** (device checklist).
- **Browser compatibility: PARTIAL.** Verified on the bundled Chromium engine only. **Safari (incl. iOS), Firefox, and real Android Chrome are NOT TESTED.** Given the iPhone-first audience, real Safari testing is essential and currently BLOCKED on hardware.

## 8. The path from NO-GO to GO (go-live gate)

Everything below is achievable and mostly already wired. Ship when **all** are green:

1. **Run the integration suite against a real project:** `TMDB_API_KEY=… NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… npm run test:integration` → TMDB + Court + Auth tests must PASS (not skip).
2. **Deploy a preview and run the E2E suite:** `PLAYWRIGHT_E2E_URL=https://<preview> PLAYWRIGHT_E2E_EMAIL=… PLAYWRIGHT_E2E_PASSWORD=… npm run test:e2e` → public smoke + authenticated app flows PASS.
3. **Confirm `/api/court/health`** on the deployment reports `ok: true`, `has_guest_id: true`, `has_expires_at: true` (migration 0023 applied) and leaks no secret.
4. **Confirm Supabase "Anonymous sign-ins"** is enabled (or accept that guests must log in).
5. **Execute `device-validation-checklist.md` on two physical iPhones** — especially §5 (two-device Court) and §6 (iOS Safari layout/VoiceOver). Any FAIL blocks.
6. **Run a basic load/soak test** at expected launch concurrency; capture p95 latency and TMDB/OpenAI rate-limit headroom.
7. **Run an a11y audit (axe/Lighthouse)** and record an actual score; fix criticals.
8. **Run `npm audit`** (or equivalent) and triage high/critical advisories.

Steps 1–3 can be done in well under a day once secrets/preview exist. Step 5 needs
two phones and ~30 minutes. Steps 6–8 are the remaining real work.

## 9. Recommendation

- **Immediate public launch to 100,000 users: NO-GO.** Risk HIGH — core live flows are unverified end-to-end.
- **Small invited beta (tens–low hundreds), closely monitored: DEFENSIBLE** once go-live steps 1–5 pass, treating it as the load/observation phase for steps 6.
- **Full 100k launch: GO** only after the entire §8 gate is green, with FAILs fixed and re-verified.

**No feature in this report is marked working on the basis of "it should work."**
The green items were executed; the rest are honestly NOT TESTED or BLOCKED, and the
report tells you exactly how to turn each one green.
