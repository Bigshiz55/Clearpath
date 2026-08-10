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

### 5. Hover-intent trailer preview — `1a17cd2`
`src/lib/trailer/hoverIntent.ts` is the dwell: `hoverPreviewAllowed` (a real
mouse AND `(hover: hover) and (pointer: fine)` AND not reduced-motion AND the
Autoplay pref on) plus `createHoverIntent` (380ms, injectable timers, refuses
to re-arm while previewing). Pure, 15 unit tests, no browser.

`TrailerMedia` gained a fourth play SOURCE — `'hover'` alongside manual/auto —
and everything follows from that one distinction:

- The hover overlay is **`pointer-events: none` and carries no controls**, so
  the click still lands on the poster link underneath. Without it, hovering a
  card DISABLES "click to understand it" on exactly the card you are looking
  at. *(Negative control measured: the click is eaten, More Info never opens.)*
- Hover **claims the single-active slot BEFORE the network call**, so card B
  stops card A immediately and regardless of whether B has a trailer.
  *(Negative control: without the claim, two players stay mounted.)*
- `hoverClaim` is what makes pointer-leave the owner of a preview and NOT of a
  manual player. Clicking ▶ Trailer during a preview PROMOTES it and drops the
  claim, so moving the mouse away no longer stops it.
- Jitter is handled twice: `pointerenter`/`pointerleave` (not over/out) so
  drifting onto the card's own ▶ Trailer chip is not a new hover, and the
  intent's own re-arm guard. *(Negative control: treating pointer-move as
  leave-then-enter restarts the preview.)*
- No trailer → the poster simply stays. No player, no toast: a hover asked for
  nothing, it only paused.

**Not behind `?trailers=1`, deliberately.** That flag gates scroll-dwell
autoplay, which starts video at a card you never pointed at. A hover preview
only ever happens where the user is already looking. It still cannot happen on
touch.

`MoreInfoLink` calls `stopAllTrailerPlayback()` on open: the dialog appears
under a stationary cursor, and a stationary cursor fires no boundary event.

### 6. Desktop E2E + visual proof — `28a4c49`
`playwright.desktop.config.ts` (port 3212, a real `Desktop Chrome` descriptor).
A widened mobile viewport cannot prove `pointerType` or `(hover: hover)`, which
is the whole reason this is a project and not a viewport. 44 tests:
`hover-trailer.spec.ts` (13), `card-interaction.spec.ts` (19),
`visual-proof.spec.ts` (12). `npm run test:desktop` builds first, same
convention as mobile.

Artifacts land in `test-results/desktop/` (git-ignored — evidence is produced by
a run, not committed): `grid-alignment-{1280,1440,1728}.png`,
`card-provider-{present,absent}.png`, `card-never-checked.png`,
`card-two-line-title.png`, `grid-verdict-variance.png`,
`more-info-desktop{,-skip,-over-grid}.png`, `more-info-mobile-390.png`,
`card-hover-preview-{active,restored}.png`.

**Two anti-vacuity guards.** A `NEGATIVE CONTROL` test asserts the fixture *can*
start a preview, and another asserts the titles render at *different* heights.
Without them every "nothing happened" assertion would also hold against a
fixture that had quietly stopped working.

**The fixture defect the artifacts caught.** `buildFitReasons` takes an axis END
for `agree` ("puzzle-forward") and `"you lean <end>"` for `clash`. Feeding it
sentences produced *"You rate you rate these highly investigative mystery
highly"* — which was about to be photographed as the product's own copy. Match
`src/lib/scoring/dimensions.ts` when mocking `/api/dna`. Reading your own
artifacts is part of the job.

**The Docket coach mark is dismissed in the desktop fixture**
(`wv.wcoach.dismissed.v1` via `addInitScript`). It is portalled `fixed` to the
body and lands over the first card's artwork; it is already
`pointer-events: none`, but its own "Got it" is hit-testable, so layout drift
would redden a hover spec for a reason unrelated to hovering. It keeps its own
coverage in `device-polish` and `onboarding-confidence`.

## Original notes, kept for context

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

### 5 and 6 — DONE, see above.

## Where this leaves the model

All six milestones are in. The desktop contract now holds end to end:

| Gesture | Result |
| --- | --- |
| Poster hover (≥380ms, mouse only) | muted trailer preview |
| Poster click | More Info |
| Title click | More Info |
| ▶ Trailer | deliberate playback, with controls |
| FOR / AGAINST | vote only |
| SAVE | save only |
| W | docket only |

Nothing left to do here. If you are picking this up to extend it, the two
places most likely to need attention next are the hover threshold (380ms is a
judgement, not a measurement — worth watching against real usage) and whether
the preview should ever unmute on a deliberate second gesture.

## Conventions worth keeping

- `npm run build:harness` before any Playwright run; `.next` is shared.
- Free the port with `node scripts/check-port-free.mjs 3211` — **`lsof`/`ss`
  cannot see the listener in this sandbox**.
- Never pipe a build through `grep -q` (SIGPIPE aborts it mid-write and leaves
  `.next` broken).
- `npx vitest run` rewrites `evaluation-results/*` SHA stamps; revert that
  churn, don't commit it.
- Write a negative control for any layout guard. A test that cannot fail is
  decoration. Same for behaviour guards: break the fix, watch the test go red,
  put it back. Every claim in the milestone 5 notes above was measured that way.
- Desktop Playwright runs on **3212** (`npm run test:desktop`), mobile and
  search-routing on **3211**. They cannot run at the same time on 3211.
- `boundingBox()` is viewport-relative. Scroll a target into view BEFORE
  measuring it or moving the pointer to it — the lower grid rows start below the
  fold at 900px, and `mouse.move` to an off-screen coordinate is a silent no-op
  that reads as "the component did nothing".
- Look at the screenshots your suite produces. A green run photographed
  malformed copy for two iterations before anyone opened the PNG.
