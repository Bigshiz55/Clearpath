# WatchVerdict — Source of Truth

Canonical facts about the project. When in doubt, this file wins.

## What it is
A personalized movie & TV recommendation app answering "Should I watch this?"
with a headline **WATCH IT / MAYBE / SKIP IT**, a general **WatchVerdict Score**,
a per-user **Personal Match** score, honest ratings/availability, watchlists, and
shareable verdicts.

## Canonical app
Single Next.js 14 App Router + TypeScript app at repo root. No other/legacy apps.

## Stack
Next.js 14.2.x · TypeScript strict · Tailwind · Supabase (Auth/Postgres/RLS) ·
TMDB (required) · OMDb (optional critic ratings) · OpenAI (optional prose) ·
Vercel · Vitest.

## Engine boundaries (`src/lib`)
- `scoring/` — pure, deterministic, authoritative. Never overridden by AI/UI.
  - `traits.ts` (defining-vs-secondary detection), `general.ts` (WatchVerdict
    score + critic blend), `personal.ts` (match + adjustments), `verdict.ts`
    (tiers, primary call, disposition, report assembly), `preferences.ts` (rules).
- `tmdb/` — `client.ts` (server-only: search + fallback, details, providers,
  similar), `image.ts` (client-safe image URLs).
- `omdb.ts` — optional critic ratings. `ai.ts` — optional prose.
- `supabase/` — browser/server/admin clients + session middleware.
- `report.ts` — orchestrates TMDB + OMDb + scoring + persistence per user.
- `actions/` — server actions (watchlist, share, profile, account) with zod.

## Scoring rules (authoritative)
- Two separate scores: general (0–100) and Personal Match (0–100).
- Personal penalties (only when the trait is a **major defining** characteristic):
  supernatural/paranormal −20, noir −20, slow burn −20, science fiction −20,
  fantasy −20. A secondary tag alone never triggers a major penalty.
- Positive Scott signals: grounded crime, psychological thriller, serial-killer
  investigation, detective mystery, domestic thriller, favorite franchise.
- Every meaningful adjustment is explained in plain language.
- Scott is the default owner profile; every user configures their own rules.

## Primary call mapping
Must/Strong Watch → **WATCH IT**; Worth/Possible Watch → **MAYBE**;
Low Priority/Skip → **SKIP IT**.

## Data honesty (non-negotiable)
Never fabricate ratings, availability, cast, or content counts. Missing data is
labeled unavailable. Provider data shown with TMDB/JustWatch attribution and a
"may change" note. No hosting/streaming of copyrighted media — legal deep links
only.

## Live project identifiers
Supabase project `WatchVerdict` (ref `vajgviraxigkwlvysxfz`,
`https://vajgviraxigkwlvysxfz.supabase.co`). GitHub `Bigshiz55/Clearpath`,
branch `claude/watch-verdict-app-wwbtbg`.

## Secrets policy
Server-only: `TMDB_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`,
`OMDB_API_KEY`. Client-safe: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`.
