# PROJECT_STATE

**As of:** 2026-07-14 · branch `claude/watch-verdict-app-wwbtbg`

## Release status
**Code-complete and green; awaiting owner deployment.** The database migration
has been applied to the live Supabase project. The only remaining step is the
Vercel deploy with the owner's API keys (see `OWNER_INSTRUCTIONS.md`).

## Verification (this build)
- `npm ci` ✅ · `npm run typecheck` ✅ · `npm run lint` ✅
- `npm test` ✅ **25 tests** (scoring + traits) · `npm run build` ✅ (17 routes)
- `npm audit` → 0 critical (remaining are dev/build-only or non-applicable Next advisories; see DECISION_LOG D15)
- Runtime smoke: `/`=200, `/api/health`=degraded-as-configured (now reports omdb/critic_ratings), protected routes 307→/login, `/share/<bad>`=404, `/api/search` returns a precise config error when TMDB unset.

## Working (verified by build/tests/smoke)
Deterministic scoring engine, personal match, WATCH IT/MAYBE/SKIP IT headline,
critic-rating blending (OMDb optional), similar titles, search + fallback, auth
flows, onboarding, watchlist CRUD + persistence, shares (revocable/expiring) +
public page + OG image, PWA, health, security headers, RLS.

## Requires live credentials to exercise end-to-end (not yet possible in sandbox)
Real TMDB search results, provider availability, OMDb critic data, live sign-up,
cross-device persistence, deployed URL. All code paths are implemented and unit/
build-verified; they need keys + a deploy to observe with real data.

## Canonical app
Single Next.js App Router project at repo root (`src/app`). No duplicate/legacy
apps exist (fresh build — see `WATCHVERDICT_AUDIT.md`).
