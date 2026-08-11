# CLAUDE.md — working in this repo

WatchVerdict: Next.js 14 (App Router) + TypeScript strict + Supabase + TMDB.

## Product
WatchVerd1ct is a personalized TV guide. Every title carries a Verd1ct score
telling a user whether *they* would personally like it — not a generic
critic/audience average.

- **Packs** are optional depth layers for specific audiences: a set of
  channels plus enabled features, not a separate app. The first two are
  **Hallmark & Lifetime** (premiere calendar, actor tracking) and **True
  Crime** (browse by case, not episode).
- **Court** is a group decision tool: a host and guests each nominate titles,
  everyone votes, and the room gets a verdict for the whole group.
- **The docket** is an ambient, single-player version of Court: tap the
  Docket badge on titles as you browse, hit the gavel, get a verdict — no
  session, no invite, no waiting on anyone else.

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
- **Never call an LLM in a user request path.** Extraction and enrichment
  (e.g. the Case pipeline's episode-to-case matching) happen in batch at
  ingest; results are stored and read back deterministically. The one
  sanctioned exception is the AI adjustment layer above, which is bounded,
  degrades to the deterministic score on any failure, and never runs in a
  listing/grid path.
- **No Pack-specific branching.** Nothing may `switch`/`if` on a Pack slug,
  and no table may carry a Pack-specific column. Pack pages read from the
  same shared architecture (`src/lib/packs/*`) that every Pack uses — a new
  Pack should not require touching code that the others share.
- **Listings come from TVmaze** (CC BY-SA — attribution required; images are
  hotlinked, never mirrored/re-hosted). The Gracenote path is dead and must
  never be revived.
- **`catalog_titles` is synthetic fixture data**, not real content — don't
  treat query results against it as production-representative.
- **Production deploys from `main`.** Verified against the live deployment on
  2026-08-11: `/api/version` reports `branch: main`, `sha: 350d874`. This entry
  previously named `claude/watch-verdict-app-wwbtbg`, which is stale — that
  branch is ahead of production and its work is NOT deployed. Branch new work
  from `main`, and confirm with `/api/version` rather than this file if the two
  ever disagree again: the deployment is the fact, this is a description of it.

## Data honesty
Never fabricate ratings, provider availability, cast, or content-guide counts.
When TMDB data is missing, label it unavailable (the UI and scoring already do).

## Working agreement
- Work orders have SCOPE, CHANGES with acceptance criteria, DO NOT TOUCH,
  VERIFY, REPORT, COMMIT. Stop and report rather than expanding scope beyond
  what was asked.
- Never fabricate data or numbers. Report the blocker instead of guessing.
- Run tests non-interactively with an explicit exit flag. Build and test have
  separate time caps: build 480s, test 180s.
- Never request credentials. If something needs production access, output the
  exact command for the user to run themselves.
- At the end of any work order, update `BACKLOG.md` to reflect what moved
  (Now/Next/Blocked/Done), and note anything discovered along the way that
  belongs in the queue — so the backlog stays current without the user having
  to maintain it by hand.

## Deploying
See `DEPLOYMENT.md`. Requires TMDB + Supabase keys and a Vercel connection.

## Operating rules for AI sessions (repository governance)

The known-good search baseline is tag `watchverdict-search-baseline-2026-08-06`
(SHA `68a5a9359a034e7a5224c8b8474dd88d491268bf`) — see
`docs/SEARCH-BASELINE-GOVERNANCE.md`. Every session working in this repo MUST:

1. Develop on a working branch — never directly on `main`.
2. Run targeted tests continuously during development.
3. Run the complete required gates before integration:
   `npm run typecheck && npm run lint && npx vitest run && npm run build`,
   plus `npx playwright test -c playwright.searchrouting.config.ts` and, for
   any search-surface change, the frozen regression corpus
   (`scripts/searchAudit/layerA.ts` / `layerBext.ts`).
4. Integrate by opening or updating a pull request into `main`.
5. Report actual process exit codes for every gate.
6. Never claim a gate is green when its output went through a pipe (`| tail`,
   `| grep`, …) that masked the exit code — check the command's real status.
7. Never force-push `main`.
8. Never change, regenerate, or remove the frozen search corpus, its oracle,
   or its seed to make a regression pass. The corpus is evidence, not code.
9. Compare any search behavior change against baseline SHA `68a5a93` and
   report the delta (PASS→FAIL and FAIL→PASS counts), not just the new score.
10. Never move or replace the known-good baseline tag without explicit owner
    approval in the current conversation.
