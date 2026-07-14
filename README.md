# WatchVerdict 🎬✓

Personalized movie & TV verdicts. Search any title and get a clear
recommendation, a **WatchVerdict Score** (general) plus a **Personal Match
Score** tuned to your taste, honest content signals, and where to watch it
legally — then save it to a watchlist or share a polished verdict page.

> **New here? To go live, follow [`DEPLOYMENT.md`](./DEPLOYMENT.md).**
> It's ~15 minutes and the only steps that need your private keys.

## Highlights

- **Two clearly separated scores.** A transparent 0–100 general score and a
  per-user personal match. Personal penalties (e.g. Scott's supernatural −20)
  fire only when a trait is a *defining* characteristic, never a stray tag.
- **Deterministic scoring engine**, fully unit-tested (21 tests). AI is optional
  and can only rewrite prose — it can never change a score or invent facts.
- **Real accounts.** Supabase Auth (email + magic link), onboarding, private-by-
  default data, per-user preferences, watchlists, regions, account deletion.
- **Shareable verdicts.** Unguessable, revocable public links with optional
  expiry, a generated OG share card, and Web Share support. No account needed to
  view.
- **Honest data.** Streaming availability comes straight from TMDB/JustWatch with
  attribution; missing data is labeled, never fabricated.
- **PWA.** Installable, offline shell, privacy-safe service worker (never caches
  authenticated responses).

## Stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind · Supabase (Auth,
Postgres, RLS) · TMDB API · Vercel · Vitest.

## Local development

```bash
npm ci
cp .env.example .env.local     # fill in your keys (see DEPLOYMENT.md)
npm run dev                    # http://localhost:3000
```

Apply the schema in `supabase/migrations/0001_init.sql` to your Supabase project.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest scoring/preference suite |

## Project layout

```
src/
  app/                 App Router pages, API routes, PWA manifest/icons
    api/health         Health endpoint (config presence, no secrets)
    api/search         TMDB search proxy (server-side key)
    app/               Authenticated area (discover, title, watchlist, settings)
    share/[token]/     Public verdict page + generated OG image
  components/          Reusable UI (scores, verdict, watchlist, auth, settings)
  lib/
    scoring/           Deterministic engine (traits, general, personal, verdict)
    tmdb/              TMDB client (server-only) + client-safe image helper
    supabase/          Browser/server/admin clients + session middleware
    actions/           Server actions (watchlist, share, profile, account)
supabase/
  migrations/0001_init.sql   Schema + RLS + secure share RPC
  tests/rls_checks.sql       RLS verification queries
```

## Security posture

See `WATCHVERDICT_RELEASE_CHECKLIST.md`. In short: RLS on every table, secrets
server-only (grep-verified out of the client bundle), unguessable/revocable share
tokens resolved through a `SECURITY DEFINER` RPC (no enumeration), validated
inputs (zod), secure headers, open-redirect protection, and no caching of
authenticated responses.

Data provided by [TMDB](https://www.themoviedb.org) and JustWatch. WatchVerdict
is not endorsed or certified by TMDB.
