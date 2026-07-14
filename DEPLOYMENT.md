# WatchVerdict — Deployment Runbook

This app is **turnkey-deployable**. Everything that can be built and verified
without private credentials is done. The steps below are the only remaining work
and each requires a credential/login that cannot exist inside the build sandbox.

Estimated time: **~15 minutes.**

---

## What you need

- A **TMDB API key** (free) — https://www.themoviedb.org/settings/api
- Your **Supabase** project `WatchVerdict` (ref `vajgviraxigkwlvysxfz`) keys
- A **Vercel** account (free) connected to the GitHub repo
- (Optional) an **OpenAI API key** — the app works fully without it

---

## Step 1 — Apply the database schema

In the Supabase dashboard → **SQL Editor**, paste and run the contents of:

```
supabase/migrations/0001_init.sql
```

Then run `supabase/tests/rls_checks.sql` and confirm:
- every table shows `rls_enabled = true`
- `get_public_share` and `username_available` show `security_definer = true`

(Or with the Supabase CLI: `supabase link --project-ref vajgviraxigkwlvysxfz`
then `supabase db push`.)

## Step 2 — Get your keys

From Supabase → **Project Settings → API**:
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon`/`publishable` key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ secret, server-only)

From TMDB → `TMDB_API_KEY` (v4 read-access token or v3 key both work).

## Step 3 — Deploy to Vercel

1. Vercel → **Add New → Project** → import the GitHub repo.
2. Framework preset: **Next.js** (auto-detected via `vercel.json`).
3. Add Environment Variables (Production + Preview):

   | Name | Value | Notes |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://vajgviraxigkwlvysxfz.supabase.co` | public |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your anon key | public |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service-role key | **secret** |
   | `TMDB_API_KEY` | your TMDB key | **secret** |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-app>.vercel.app` | set after first deploy, then redeploy |
   | `OPENAI_API_KEY` | (optional) | **secret**, optional |

4. **Deploy.** Note the production URL.
5. Set `NEXT_PUBLIC_SITE_URL` to that URL and **redeploy** (so auth redirects,
   share links, and OG tags use the real origin).

## Step 4 — Configure Supabase Auth URLs

Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://<your-app>.vercel.app`
- **Redirect URLs** (add both):
  - `https://<your-app>.vercel.app/auth/callback`
  - `https://<your-app>.vercel.app/**`

(Email confirmations/magic links are on by default. For instant testing you can
disable "Confirm email" under Authentication → Providers → Email.)

## Step 5 — Smoke-test the live app

- `GET /api/health` → `status: "ok"` and all `checks` true.
- Open `/` → sign up with an email → complete onboarding → land on `/app`.
- Search a title (e.g. "The Bourne Identity") → open it → a full verdict renders.
- Add it to your watchlist → refresh → it persists on `/app/watchlist`.
- Share the verdict → open the `/share/<token>` link in a private window
  (signed out) → it renders. Toggle the personal score off/on and confirm.
- Open on a phone (or DevTools iPhone viewport) → layout is mobile-first; you can
  install it from the browser menu (PWA).

---

## Notes

- **Secrets never reach the browser.** Only `NEXT_PUBLIC_*` values are bundled
  client-side; `TMDB_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY`
  are server-only (verified — see `WATCHVERDICT_RELEASE_CHECKLIST.md`).
- **No key? The app still builds and boots.** Feature pages render a precise
  configuration error instead of crashing, and `/api/health` reports `degraded`.
- **Scott's rules**: when the owner signs up with display name starting "Scott",
  onboarding offers the Scott preset. Any user can edit their rules in Settings.
