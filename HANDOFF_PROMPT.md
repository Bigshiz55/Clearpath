# Getting an agent to WatchVerd1ct's current state

There are two different asks hiding in "get it to the exact state," and they have
different answers. Read the first section before reaching for the second.

---

## A. If you want the EXACT state (recommended)

A prompt cannot reproduce 98 components, 95 unit-test files and 24 browser specs
byte-for-byte. Nothing can, except the repository. The exact state is:

- **Repo:** `Bigshiz55/Clearpath`
- **Branch:** `claude/watch-verdict-app-wwbtbg`
- **Commit:** `774bdb9`
- **Deployed:** `https://clearpath-pearl-chi.vercel.app`

The prompt that gets any agent there:

> Work in the `Bigshiz55/Clearpath` repository on branch
> `claude/watch-verdict-app-wwbtbg` (currently at commit `774bdb9`). Run
> `npm ci`, then read `CLAUDE.md` in full — it is the binding architecture
> contract, not background reading — followed by `PROJECT_STATE.md`,
> `KNOWN_ISSUES.md` and `DECISION_LOG.md`. Before you change anything, establish
> a baseline by running `npm run typecheck && npm run lint && npm test && npm run
> build`, and confirm you get 1,167 unit tests passing with 4 skipped and a
> successful build. Do not begin work until that baseline is green.

Everything below is for the other case.

---

## B. If you want to REBUILD it from nothing

Paste the whole of the following into a fresh agent session. It is a
specification, not a description — it encodes the invariants that make the
product what it is, and the mistakes that were expensive to discover.

---

### THE PROMPT

Build **WatchVerd1ct**, a streaming-recommendation web app whose promise is
*"We earn your subscription. We don't trick you into one."* It answers one
question — *what should I watch tonight* — and it answers it with arithmetic the
user can inspect, never with a number it cannot justify.

#### Stack

Next.js 14 (App Router) · TypeScript **strict**, including
`noUncheckedIndexedAccess` · Supabase (Postgres + Auth + RLS) · TMDB for
catalogue · Tailwind · Vitest for units · Playwright (Chromium) for browser
specs · deployed on Vercel. Runtime dependencies are deliberately few:
`@supabase/ssr`, `@supabase/supabase-js`, `next`, `react`, `react-dom`,
`server-only`, `zod`, plus `html-to-image`, `qrcode`, `web-push`, `tesseract.js`,
`pg`. Do not add a state manager, a component library, or an ORM.

Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test` (vitest run),
`test:mobile` (playwright).

#### The one architectural rule everything else hangs off

**The deterministic scoring engine is authoritative.** All core scoring lives in
`src/lib/scoring/` and is **pure** — no I/O, no fetch, no clock, no randomness.
It is computed first, and it is what ranking, filtering and the seven
specification scenarios depend on. It is never modified by AI output or by the
UI. If you touch it, you update `src/lib/scoring/*.test.ts` and all seven
scenarios keep passing.

Exactly two personalization layers may adjust a number, and **both live outside
`src/lib/scoring/`**:

1. `src/lib/aiAdjust.ts` — may nudge the *displayed* final score by a bounded
   **±15** (`MAX_ADJUSTMENT`) with a one-line reason. It must degrade to the
   deterministic score on *any* failure: no key, timeout, unparseable output. It
   is reserved for the title page behind `?ai=1` — never grids, never ranking.
2. The **content fingerprint**. Every title is classified once across 18
   interpretable axes (`src/lib/scoring/dimensions.ts` is pure math; the
   gpt-4o-mini classifier and its `title_dimensions` cache live in
   `src/lib/titleDimensions.ts`). In `rankByDna` — the personalization layer, not
   the pure engine — the fingerprint may move a title's *rank score* by a bounded
   **±8** (`DIM_NUDGE_MAX`) toward the user's learned profile. It is cache-only
   and deterministic at request time: **no per-request LLM call.** It is a no-op
   whenever the profile or a title's fingerprint is missing.

Build the pure module first, with its tests, and only then wire it to UI or
database. Every hard rule gets a test that fails if someone removes the rule.

#### Data honesty — the product's actual differentiator

Never fabricate a rating, a provider availability, a cast member, or a
content-guide count. When TMDB has no data, the UI says so. Two concrete
consequences learned the hard way:

- A "Skip" button that records `not_interested` turns *"never heard of it"* into
  a fabricated dislike. Design so that **not acting sends nothing**.
- A score breakdown that does not reconcile must say so rather than render a
  decorative chart. `showWork()` computes `points = value × weight`, checks the
  total against the score within `RECONCILE_TOLERANCE = 1.5`, and returns a
  `reconciles` flag; `workSentence()` returns null when it does not add up.

#### Security — non-negotiable

- `TMDB_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` and the founder
  access code are **server-only**. They never take a `NEXT_PUBLIC_` prefix, never
  enter a client component, never appear in a URL, a log line, an API response or
  a source file. Server-only modules begin with `import 'server-only'`.
- Client-safe TMDB image helpers live in `src/lib/tmdb/image.ts`; the full client
  (`src/lib/tmdb/client.ts`) is server-only.
- The founder access code is compared **server-side**, with a timing-safe
  comparison, and is never one of the service keys.
- Env is validated **at runtime, not at import or build time** (`src/lib/env.ts`),
  so `next build` succeeds without secrets. Do not hoist validation to module
  top-level.
- Auth identity is verified with `supabase.auth.getUser()`, never
  `getSession()`. Protected routes live under `/app`; `src/middleware.ts`
  refreshes the session and gates them.
- **RLS on every user table.** Public share reads go only through the
  `get_public_share` SECURITY DEFINER RPC — never add a broad anon SELECT policy
  on `shares`.
- All mutations are server actions in `src/lib/actions/*`, validated with zod.
- Never scrape a provider or bypass bot protection. Never ask a user for a
  streaming password, session cookie, or account access.

#### The model of the user

One append-only log, `preference_events`, is the single source of truth for
taste. Everything else is derived from it and can be rebuilt. Never
destructively delete user history or Viewer DNA.

Three ways in, in order of what they cost the user:

1. **Quick Taste Quiz** (`src/lib/taste/quickQuiz.ts`, ~600 lines, pure). A
   versioned bank of 39 statements across 7 sections (`core_loves`, `pace`,
   `tone`, `ingredients`, `limits`, `viewing`, `exceptions`), `SESSION_LENGTH =
   12`. Four responses with fixed weights: *Exactly me* 1.0, *Mostly* 0.6,
   *Depends* 0.5 (conditional scope, opens clarifying chips inline — never a
   modal, never blocking), *Not me* −0.75. Claim ids are
   `quiz:${questionId}:${attributeKey}` so re-answering **replaces** rather than
   accumulates.
   *The bug to avoid:* `targetsFor` must return FINAL polarity. Returning the
   negative-branch targets and *then* multiplying by a sign derived from the
   response value flips it twice and silently inverts the profile.
2. **React to real titles** — a 12-poster grid. Picks accumulate across rounds
   until the user presses an explicit end button; a new round must never
   overwrite earlier picks. Not tapping a poster sends nothing.
3. **Import your history** — the user reviews everything first, and *watched* is
   never read as *liked*.

Coverage and Confidence are **two different numbers** and the label takes the
lower of them. A dozen emphatic answers is a real start and nothing more; the
panel must never report it as a finished profile.

#### The Verd1ct — the closing move

Browsing forever is the failure mode. The user marks unseen titles with a **W**
check, building a **docket** (`MIN_FOR_VERDICT = 3`, `MAX_DOCKET = 8`,
`DOCKET_TTL_MS` 24h), then asks for one ruling.

`blendedScore` = `watchability × (1 − w) + personalMatch × w` where
`w = MATCH_WEIGHT(0.55) × clamp(matchConfidence)`, minus `UNAVAILABLE_PENALTY =
12` when nothing streams it. Eligibility runs **before** scoring. `marginBetween`
returns null rather than inventing a difference, and it may only cite
availability if availability actually affected the ranking — if it does not
affect ranking, adding the citation is a lie, and the fix is to make availability
affect ranking, not to soften the sentence.

#### Interface rules that were paid for in bug reports

- **Saved means handled.** A saved card leaves the browsing grid — with two
  exceptions: a grid that *is* somebody's list keeps its cards, and removal never
  happens on un-save.
- Five components locate their placard with `closest('.card')`. Restyle the card
  by *overriding* its classes, never by replacing them, or all five break
  silently and nothing looks wrong afterwards.
- **A phone card is a row, not a column.** A 2:3 poster at full width is 609px of
  artwork on a 440px screen before the title appears — one title per screen. Two
  narrow columns is also wrong: at ~170px a cell, "NOT FOR ME" wraps to three
  lines and titles truncate mid-word. Turn the *card* sideways below `sm`: poster
  at about a third of the width, title, synopsis and actions beside it. Restore
  the column layout from `sm` up.
- **Never truncate evidence.** A clipped quote is unreadable *and* incomplete,
  and it always eats the end — which is where the meaning lives. Claim ≥16px,
  evidence ≥14px, wrapping freely, at 320px.
- **No `backdrop-filter` on a `position: fixed` element, and no
  `background-attachment: fixed` on the body.** Together they put iOS Safari on a
  compositing path where fixed layers repaint lazily and get stranded mid-screen
  over content. Headless Chromium renders it correctly, so no browser test will
  catch it — pin it at the source instead. Bottom navigation is welded to the
  bottom edge, full width, opaque.
- Minimum tap target 44px, everywhere, at every viewport.
- No horizontal page scroll at any width from 320px up. Wide content scrolls
  inside its own container.

#### Testing

- **Pure logic gets unit tests.** Target roughly 1,150+ across ~95 files.
- **Anything needing a session gets a source-level architectural test**, not a
  browser test. `/app/*` redirects to `/login` without a session, so a browser
  assertion would pass against a login page and prove nothing. Read the source
  and fail if an invariant is violated. See `src/lib/viewing/independence.test.ts`
  for the pattern.
- **Browser specs run against `/dev/*` harnesses** gated behind `MOBILE_HARNESS=1`,
  driven by `playwright.mobile.config.ts` on port 3211. They mount the real
  components. Assert *properties* — font size, overflow, tap-target height, gap
  to the viewport edge — not screenshots, so they survive copy changes.
- Viewport matrix: 320×568, 360×640, 375×667, 390×844, 393×852, 414×896, 430×932,
  440×956, 768×1024, 820×1180, 1024×768, 1280×800, 1440×900.
- **Gates before every commit:**
  `npm run typecheck && npm run lint && npm test && npm run build`.

#### Deliberate non-goals

Do not re-enable public registration or normal user sign-in. Do not build a
second ranking anywhere — every recommendation surface calls the same slate
builder. Do not put an LLM in the per-request ranking path.

#### How to report

State plainly what passes and what does not. If a suite fails for environmental
reasons, verify that by re-running it on the previous commit before calling it
pre-existing, and say so with the evidence. Never describe an unverifiable fix as
verified.

---

## What this prompt cannot carry

Being straight about it:

- **The seven specification scenarios** are referenced in `CLAUDE.md` but their
  content lives in the tests. A rebuild will not reproduce them.
- **Tuned constants** — reranker weights, standard-score weights, calibration
  thresholds — are the output of sweeps recorded in `evaluation-results/`. A
  rebuild gets the architecture, not the calibration.
- **The Search Lab** (`eval/`, ~11 npm scripts) is a whole evaluation harness
  with generators, gold cases and a scorecard. It would need its own brief.
- **Migrations 0001–0034.** The schema is in `supabase/migrations/`. Note that
  **0026–0034 are not applied to any live environment** — that is a real
  outstanding item, not a detail.

For anything where the exact behaviour matters, use option A.
