# WatchVerdict — Release Checklist

Legend: ✅ done & verified in-session · 🟡 code complete, needs external credentials to verify live · ⬜ blocked on external action (user)

## Build & quality gates
- ✅ Installs from clean checkout (`npm ci`)
- ✅ Production build passes (`npm run build`)
- ✅ Lint passes (`npm run lint`)
- ✅ TypeScript strict passes (`npm run typecheck`)
- ✅ Scoring unit tests pass (`npm test`)
- ✅ Dependency audit reviewed (`npm audit`) — 0 critical; remaining findings are dev/build-only or non-applicable Next advisories (see decision log D15)

## Data & security
- ✅ Supabase migrations included and reproducible from a fresh project
- ✅ RLS enabled on every user table (policies in migrations)
- ✅ Service-role key never imported in client code (verified by grep)
- ✅ TMDB/OpenAI keys server-only (no `NEXT_PUBLIC_`)
- ✅ Public share pages expose only whitelisted fields
- ✅ Input validation (zod) on API routes
- ✅ Secure headers + open-redirect protection
- 🟡 Supabase security advisors run (needs live project access)

## Application features
- ✅ Deterministic scoring engine (WatchVerdict Score + Personal Match Score)
- ✅ Scott permanent preference rules + explanations
- ✅ Per-user preference rules (create/edit)
- ✅ Full verdict report format (all required sections)
- ✅ Search UI + title resolution flow
- ✅ Auth flows (sign up / in / out, magic link, callback, errors, loading)
- ✅ Onboarding (skippable, editable)
- ✅ Watchlist manager (statuses, sort/filter/search, grid/list)
- ✅ Public share pages (verdict + watchlist), revocable, optional expiry
- ✅ PWA manifest + icons + safe service worker
- ✅ Health endpoint (`/api/health`)
- ✅ Mobile-first responsive layout

## Live deployment (EXTERNAL — requires user credentials)
- ⬜ TMDB_API_KEY provided
- ⬜ Supabase publishable + service-role keys provided
- ⬜ Migrations applied to live Supabase project
- ⬜ Deployed to Vercel (production)
- ⬜ Supabase Auth redirect/site URLs configured
- ⬜ Live sign-up smoke-tested from clean browser
- ⬜ Live public share link opened unauthenticated
- ⬜ Live mobile viewport check
- ⬜ Public production URL documented

> The live-deployment section is the only outstanding work, and every item in it
> requires a credential or login that does not exist in this sandbox. The
> handoff runbook in `DEPLOYMENT.md` makes each a few-minute action.
