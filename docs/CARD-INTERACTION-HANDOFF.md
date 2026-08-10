# Card interaction model — handoff

Branch: `claude/card-interaction-model` (from mobile `42ac046`).
Do not touch `main`, production, `claude/search-deterministic-floor`, or the
mobile reconciliation branch.

Interaction philosophy being built:
**HOVER = PREVIEW IT · CLICK = UNDERSTAND IT · FULL VERDICT = ANALYZE IT**

## Colour decision (owner-fixed — do not "simplify" this)

- The proprietary SCORE identity is **pink** (the Verd1ct TV mark).
- The VERDICT keeps **semantic** colour: STREAM IT green, MAYBE amber, SKIP red.
- Do not make every WatchVerd1ct element pink. The distinction is deliberate.

## Done

### 1. Shared score identity — `745f7ca`
`src/components/WatchVerd1ctScore.tsx` is the ONLY place the score's
appearance is decided. `WatchCall` and `RatingsStrip` both render it.

It replaced three divergent treatments: the card's pink mark, `WatchCall`'s
`🧬 84 · STREAM IT` pill, and `RatingsStrip`'s **green ✅ pill** — the last of
which was what every non-card surface used (QuickLook, detail view, judge
card), so the score looked *least* like itself exactly where it should be the
hero. Never invents a score: `null` renders nothing, or a fixed-height
placeholder when the caller needs the row to hold its shape.

### 2. Structural action-row alignment — `c935fd7`
Row moved from the top of the card to the **last child** with `mt-auto`.
Works because `.poster-grid` sets no `align-items` (CSS-grid `stretch` already
equalises card heights per row) and the card is `flex flex-col`.

`tests/mobile/card-alignment.spec.ts` asserts the property at
320/390/430/768/1280/1512. **Negative control measured**: with `mt-auto`
neutralised the same fixture goes from `[0,0]` to `[20,20]` px of rag — the
guard detects the real defect.

Re-pointed, not weakened: `card-compact` 'lead the card' → 'close the card'
(still asserts air above the buttons + a visible `border-top`), and the
reading-order test is now facts → score → synopsis → **actions**.

### 3. More Info + 4. Personalization — `19ef372`
`QuickLook` IS More Info. Poster/title/`MoreInfoLink` open it over the grid.
`PersonalizedFit` renders WHY YOU'LL LIKE IT / WATCH OUT / FOR YOU / AGAINST
YOU from `fit.agree`/`fit.clash` via `buildFitReasons` — the same composer
`CardFit` uses, so card and drawer cannot disagree. Silent below
`MIN_SAMPLES_FOR_FIT`. `AlgorithmScore` now renders the shared score too.

Three defects fixed that only tests could see: the dialog was trapped under
the header by `.card`'s `backdrop-blur` stacking context (now portalled to
`document.body`); scroll was lost on close twice over (`overflow:hidden`
clamping + an effect keyed on an unstable `onClose`, now a mount-only capture
with a `position:fixed` lock); the poster was a 32px tap target because
`h-full` resolved to the placeholder height (now `absolute inset-0`, title
floored at 44px).

`tests/mobile/more-info.spec.ts` — 14 cases at 390 and 1280: open from poster
and title, Escape, close control, content, shared-mark identity, scroll
restoration, vote/save/W/trailer isolation, modified-click passthrough.

**Gotcha for the scroll test:** Playwright's `click()` scrolls its target into
view first. Take the baseline AFTER `scrollIntoViewIfNeeded()` on the actual
click target, or you compare two different scroll positions and fail a
component that is correct (observed: page moved 1040 → 350 on the click).

## Remaining, in order

### 3. More Info drawer/sheet — DONE, see above. Original notes kept for context:
Foundation exists: **`src/components/QuickLook.tsx`**, and `PosterCard`
already accepts an `onOpen` prop that suppresses `href` navigation
(`BrowseCatalog.tsx` is the only current caller — use it as the reference).

- Poster / title / card body → More Info. Desktop drawer or modal; mobile
  full-height sheet.
- **Must not navigate away.** Closing restores exact scroll position, result
  list, votes, save state, filters.
- Event isolation: Trailer, FOR, AGAINST, SAVE, provider links must
  `stopPropagation` — `CardVerdict` already does this, verify the rest.
- A11y: focus trap, focus restore to the invoking card, Escape closes,
  distinct labels — "Open more information for X" vs "Play trailer for X".
- Content order: title → year·type·rating·runtime → provider → shared pink
  score → WHAT IT'S ABOUT → WHY YOU'LL LIKE IT → WATCH OUT → FOR YOU /
  AGAINST YOU → external ratings → PLAY TRAILER → FOR·AGAINST·SAVE → SEE FULL
  VERDICT.

### 4. Personalized Why / Watch Out
Real evidence only — **do not generate LLM fluff and do not hallucinate
preferences.** Sources that already exist:
- `src/components/watch/WhyThisTitle.tsx` (+ `src/lib/reasons/whyThisTitle.ts`)
- `src/components/CardFit.tsx`, `src/lib/dnaClient.ts` (`loadDna`, `fit.agree` /
  `fit.clash` — already shaped as for/against pairs)
- `src/lib/scoring/dimensions.ts` + `titleDimensions` for the 18 interpretable
  axes.

Constraint: the explanation must be **directionally consistent with the
score**. An 84 STREAM IT cannot pair with a weak Why and a heavy Watch Out.
Render nothing rather than something generic when evidence is absent — the
codebase already does this (`WhyThisTitle` returns null when nothing is
substantiated).

### 5. Hover-intent trailer preview (desktop only)
Reuse **`src/components/trailer/TrailerMedia.tsx`** — it already has the
single-active store (`playing.claim/release`), dwell coordination
(`activeTrailer.ts`), lazy `resolve()` on demand, reduced-motion and autoplay
preference checks. Add a 300–500ms hover-intent timer; do not build a parallel
system.
- Hover = muted preview only. **Click must NOT start the trailer** — click is
  More Info.
- One preview at a time; lazy-load after intent; no restart on jitter.
- No trailer → poster stays, no broken player.
- No hover emulation on touch.

### 6. E2E
Desktop E2E does not exist yet — create it (a new Playwright project/config,
or desktop viewports in the mobile config). Cover the 15 desktop flows and 7
mobile flows in the assignment, plus visual proof of row alignment across
one-line/two-line titles, provider/no-provider, differing ratings.

## Conventions worth keeping

- `npm run build:harness` before any Playwright run; `.next` is shared.
- Free the port with `node scripts/check-port-free.mjs 3211` — **`lsof`/`ss`
  cannot see the listener in this sandbox**.
- Never pipe a build through `grep -q` (SIGPIPE aborts it mid-write and leaves
  `.next` broken).
- `npx vitest run` rewrites `evaluation-results/*` SHA stamps; revert that
  churn, don't commit it.
- Write a negative control for any layout guard. A test that cannot fail is
  decoration.
