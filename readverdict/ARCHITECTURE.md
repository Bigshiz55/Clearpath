# ReadVerdict — Architecture

This document is the durable design reference. Phase 1 establishes the skeleton;
later phases fill it in. Where something is **not yet built**, it is labeled
_(planned — Phase N)_ so this file never overstates what exists.

## 1. Product thesis

ReadVerdict is a **decision service**, not a catalog. Every surface exists to
answer one question:

> _"What should I read next, given exactly what I asked for, my durable taste,
> how much time and attention I have, the format I prefer, what I can access,
> and who I may be reading with?"_

Design consequences that hold from Phase 1:

- Prefer **fewer, qualified** results over a padded grid.
- **Never fabricate** book data (ratings, availability, attributes). Missing
  data is labeled, not invented.
- Popularity is never a substitute for relevance; a persuasive explanation
  never rescues a weak match.

## 2. The four DNA models (kept separate on purpose)

These are **never** collapsed into a single score or embedding. Phase 1 defines
the vocabulary; the schemas and stores arrive in Phases 3–5.

| Model | Question it answers | Lifetime | Phase |
| --- | --- | --- | --- |
| **Book DNA** | What is objectively true about this book? | Durable per title | 3 |
| **Reader DNA** | What are this reader's durable preferences? | Durable per user | 5 |
| **Reading Session DNA** | What does the reader want _right now_? | Ephemeral per request/session | 4 |
| **Search DNA** | What does the current request _mean_? | Ephemeral per request | 4 |

Each Book DNA attribute carries: stable identifier, value, **salience**,
**confidence**, evidence source, provenance, and last-updated time. Attributes
are never invented to justify an explanation.

Reader DNA distinguishes **explicit** vs **inferred** signals and tracks
confidence per dimension — it must never display false confidence from a small
sample. A single click is not a permanent preference.

Reading Session DNA (temporary: "quick read", "audiobook for driving", a page
cap, a mood) must **not** silently promote itself into durable Reader DNA.

## 3. Verdict taxonomy

Working tiers (subject to product review), defined in
[`src/lib/verdict/tiers.ts`](./src/lib/verdict/tiers.ts) and unit-tested:

`Must Read` › `Strong Yes` › `Worth a Look` › `Maybe` › `Probably Pass`

`tierForScore()` maps a personalized 0–100 score to a tier; the mapping is
total, monotonic, and clamps out-of-range/NaN input.

## 4. Book similarity _(planned — Phase 4)_

"Books like this" must not reduce to genre, popularity, same author, or a single
embedding. Similarity is expressed through explicit **lenses** — same story
structure, same emotional payoff, same prose feeling, same narrative voice, same
mystery construction, same reading commitment, etc.

Rules that will be enforced:

- Exclude the seed book unless inclusion is requested.
- A high Reader DNA score cannot rescue a book that fails a required
  seed-similarity threshold.
- Return fewer books rather than padding with weak matches.

## 5. Recommendation pipeline _(planned — Phase 4)_

Deterministic ordering, so behavior is testable by the Search Lab (Phase 11):

1. Interpret the request → **Search DNA**
2. Resolve titles / authors / series / entities
3. Identify hard constraints
4. Retrieve candidates from multiple sources
5. Verify metadata
6. Apply hard constraints
7. Apply seed-book similarity qualification
8. Apply contradiction penalties
9. Remove unqualified candidates
10. Apply Reader DNA
11. Apply Reading Session DNA
12. Apply diversity & series controls
13. Rank valid candidates
14. Generate evidence-grounded explanations

## 6. Application shell (Phase 1 — built)

- **Root layout** (`src/app/layout.tsx`) wraps everything in `AppShell`.
- **`AppShell`** provides a skip link, a sticky desktop top bar, and a fixed
  mobile bottom tab bar (hidden on desktop), with safe-area padding.
- **Navigation** is defined once in `src/config/nav.ts`:
  - Desktop: Ask · Discover · My Books · Read Together · Profile
  - Mobile: Home · Ask · My Books · Together · Profile
  - Secondary (from Profile): Reader DNA
- **UI primitives**: `Container`, `PageHeader`, `EmptyState` (honest,
  phase-labeled), `VerdictBadge`.
- **States**: global `loading`, `error`, and `not-found`.

## 7. Data & auth _(planned — Phase 5)_

- Supabase clients exist now (`src/lib/supabase/{server,client}.ts`) and return
  `null` until configured, so the UI renders unauthenticated without crashing.
- When auth lands: verify identity with `supabase.auth.getUser()` (never trust
  `getSession()` alone); protect the app surfaces via middleware; enforce RLS on
  every user table.

## 8. Secrets & environment

- Runtime-only env access (`src/lib/env.ts`) — never read at import/build time,
  so `next build` needs no configuration.
- Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, provider
  keys) never receive a `NEXT_PUBLIC_` prefix and never enter client modules.
- Server-only modules begin with `import 'server-only'`.

## 9. Internationalization _(planned — Phase 9)_

Architecture will keep these axes **independent**: interface language, search
language, content language, market region, timezone, currency. Changing language
must not change region or currency. Internal identifiers are language-neutral.
Target locales: English, neutral Latin American Spanish, Simplified Chinese.

## 10. Analytics & privacy _(planned — Phase 10)_

Semantic events (not raw clicks) with unique IDs, anonymous/user/session IDs,
consent state, event versions, and language-neutral names. Never recorded:
passwords, payment details, tokens, private group exclusions, raw voice audio by
default, or sensitive inferred traits. Privacy controls include data export,
deletion, Reader DNA reset, and search-history deletion.

## 11. ReadVerdict Search Lab _(planned — Phase 11)_

A permanent automated evaluation system: generate realistic searches → run the
real engine → capture score traces → validate hard constraints → grade
relevance → diagnose failures → add confirmed failures to regression tests →
compare against a baseline → run hidden holdout tests → reject critical
regressions → produce reviewable reports. It **never** merges or deploys
automatically. Modes: smoke, standard, full, stress, mutation, regression,
holdout, live-observation. Deterministic fixtures; strict cost controls.

## 12. What is real vs. scaffold today

| Area | State |
| --- | --- |
| Stack, configs, gates (typecheck/lint/test/build) | **Real** |
| Design tokens, responsive shell, navigation | **Real** |
| Verdict tier taxonomy + `cn` util (+ tests) | **Real** |
| Supabase client scaffolding (null until configured) | **Real (inert)** |
| Ask / Discover / My Books / Together / Reader DNA pages | **Honest placeholders** |
| Book data, DNA stores, pipeline, availability, i18n, analytics, Search Lab | **Planned** (Phases 3–11) |

Nothing in the current build fetches or fabricates real book data.
