# CLAUDE.md — working in this repo

WatchVerdict: Next.js 14 (App Router) + TypeScript strict + Supabase + TMDB.

## Commands
- Install: `npm ci`
- Dev: `npm run dev` · Build: `npm run build` · Serve: `npm start`
- Gates before committing: `npm run typecheck && npm run lint && npm test && npm run build`

## Architecture rules (important)
- **The deterministic engine is authoritative.** All core scoring lives in
  `src/lib/scoring/` — pure (no I/O), unit-tested, and never changed by AI or UI.
  It is always computed first and is what ranking, filtering, and the 7 spec
  scenarios rely on. If you touch it, update `src/lib/scoring/*.test.ts` and keep
  all 7 scenarios passing.
- **The AI adjustment layer is the one sanctioned exception, and it lives
  OUTSIDE `src/lib/scoring/`.** `src/lib/aiAdjust.ts` may nudge the *displayed*
  final score by a bounded ±15 (`MAX_ADJUSTMENT`) with a one-line reason, on top
  of the deterministic blend. It must always degrade to the deterministic score
  on any failure (no key, timeout, unparseable output) and is reserved for the
  title page (`?ai=1`), never the many-card grids or ranking. Keep the pure
  engine untouched — the AI only refines the number after the fact.
- **The content fingerprint is a second sanctioned personalization signal,
  also OUTSIDE `src/lib/scoring/`.** Every title is classified once across 18
  interpretable axes (`src/lib/scoring/dimensions.ts` is pure math; the
  gpt-4o-mini classifier + `title_dimensions` cache live in
  `src/lib/titleDimensions.ts`). In `rankByDna` (personalization layer, not the
  pure engine) the fingerprint may nudge a title's *rank score* by a bounded
  ±8 (`DIM_NUDGE_MAX`) toward the user's learned dimension profile. It is
  cache-only and deterministic at request time (no per-request LLM call) and a
  no-op whenever the profile or a title's fingerprint is missing, so the
  deterministic Watchability score stays authoritative and the 7 scenarios
  (which never touch `rankByDna`) are unaffected.
- **Secrets are server-only.** `TMDB_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `OPENAI_API_KEY` must never get a `NEXT_PUBLIC_` prefix or be imported into a
  client component. Server-only modules start with `import 'server-only'`.
  Client-safe TMDB image helpers live in `src/lib/tmdb/image.ts`; the full TMDB
  client (`src/lib/tmdb/client.ts`) is server-only.
- **Env is validated at runtime, not import/build time** (`src/lib/env.ts`) so
  `next build` works without secrets. Don't move validation to module top-level.
- **Auth**: verify identity with `supabase.auth.getUser()` (not `getSession()`).
  Protected routes live under `/app`; `src/middleware.ts` refreshes the session
  and gates them.
- **RLS**: every user table is RLS-protected (`supabase/migrations/0001_init.sql`).
  Public share reads go only through the `get_public_share` SECURITY DEFINER RPC
  — never add a broad anon SELECT policy on `shares`.
- **Mutations** are server actions in `src/lib/actions/*` with zod validation.

## Data honesty
Never fabricate ratings, provider availability, cast, or content-guide counts.
When TMDB data is missing, label it unavailable (the UI and scoring already do).

## Deploying
See `DEPLOYMENT.md`. Requires TMDB + Supabase keys and a Vercel connection.
