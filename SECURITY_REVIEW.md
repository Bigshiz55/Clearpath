# Security Review

Reviewer pass over the current branch. ✅ = verified, ⚠️ = verify live.

## Secrets
- ✅ `TMDB_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OMDB_API_KEY`
  are server-only. Grep of the built client bundle (`.next/static`) finds none of
  them; no secret carries a `NEXT_PUBLIC_` prefix.
- ✅ Privileged modules start with `import 'server-only'` (tmdb client, omdb, ai,
  admin supabase, report, profile, share).
- ✅ Only the publishable/anon key and site URL are exposed client-side.

## Authentication & authorization
- ✅ Identity verified with `supabase.auth.getUser()` (revalidates token), not
  `getSession()`.
- ✅ Protected routes gated in middleware; redirect to `/login` when unauthenticated
  or unconfigured (never a 500).
- ✅ Open-redirect protection on `/login` and `/auth/callback` (internal paths only).
- ✅ Account deletion uses the service-role client, but only after verifying the
  caller is the account owner.

## Row Level Security (RLS)
- ✅ Enabled on all 7 tables; policies restrict to `auth.uid()`. `watchlist_items`
  additionally checks the parent list is owned by the user.
- ✅ `shares` has **no** broad anon SELECT policy. Public reads go only through the
  `get_public_share(token)` `SECURITY DEFINER` RPC, which returns just the public
  snapshot for active, non-expired tokens — prevents row enumeration.
- ✅ Share tokens are 22-char base62 from `crypto.randomBytes`, not derived from
  user/row ids; revocable (`is_active`) with optional expiry.
- ⚠️ Run `supabase/tests/rls_checks.sql` in the live project and Supabase's
  Security Advisor after deploy to confirm on the running database.

## Input & transport
- ✅ All server actions and API routes validate input with zod.
- ✅ Secure headers (`X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS) via `next.config.mjs`.
- ✅ `/app/*` and `/api/*` responses set `no-store` / `private` — no caching of
  authenticated data. Service worker never caches private/authenticated responses.

## Data honesty
- ✅ No fabricated ratings, availability, cast, or content counts. Missing data is
  labeled unavailable in UI and scoring. AI prose (if enabled) is fed only
  computed facts and cannot change scores.

## Dependencies
- 0 critical (`npm audit`). Remaining are dev/build-only or non-applicable Next
  advisories — see KNOWN_ISSUES #3 / DECISION_LOG D15.
