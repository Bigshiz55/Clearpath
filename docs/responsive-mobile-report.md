# WatchVerdict — Mobile Responsiveness Overhaul

Branch: `feature/search-dna-and-search-lab` (isolated). Nothing merged/deployed.

A reusable, production-grade responsive system — not a screenshot-specific patch.
The same components now adapt to **actual available width** (viewport media queries
+ CSS **container queries** on cards), so every screen, card, verdict panel, form,
and future component behaves from 320px phones to desktop.

## Root causes found

1. **Grid forced 2-up on every phone.** `.poster-grid` used
   `grid-template-columns: repeat(2, minmax(0, 1fr))` unconditionally, so two cards
   were squeezed side-by-side even at 320px. → Root cause of "desktop squeezed into
   mobile", uneven/cramped cards.
2. **Ratings row was a single nowrap flex line.** `RatingsStrip` line 2 laid
   🍅/🍿/IMDb in one `flex … whitespace-nowrap` row with the IMDb pill last, so on a
   narrow card **IMDb was pushed off / clipped**. → Root cause of "IMDb cut off".
3. **Verdict label + panel had no shrink guards.** The call text column lacked
   `min-w-0`, so a long label could force the pink panel wider than the card.
4. **Action buttons were 36px tall** (`h-9`) — under the 44px tap target.
5. **State Your Case button was `justify-end`** → floated lopsided to one side on
   phones; not full-width.
6. **Safe-area gaps.** Content bottom padding (`pb-20`) didn't add
   `env(safe-area-inset-bottom)`, so the last content could sit under the fixed
   bottom nav on notch/home-indicator phones; `.container-page` had no horizontal
   safe-area for landscape notches.
7. **No global overflow guard / box-sizing assertion / responsive type wrapping**
   for 30–50% longer translated strings (the CTA used `white-space: nowrap`).

## Components / files changed

- `src/app/globals.css` — the shared system (below).
- `src/components/RatingsStrip.tsx` — wrapping, content-sized rating chips; missing
  sources omitted cleanly; IMDb never clipped; Metacritic added.
- `src/components/AlgorithmScore.tsx` — verdict panel: `min-w-0 flex-1` text column,
  label wraps instead of overflowing; badge stays fixed size.
- `src/components/LikeButton.tsx`, `SaveButton.tsx`, `TasteFeedback.tsx` — card-bar
  (For / Pass / Save) buttons bumped to **h-11 (44px)**, equal-width (`flex-1 min-w-0`).
- `src/components/BuildCaseBox.tsx` — "State Your Case" CTA is **full-width on phones**,
  intrinsic-width + right-aligned from `sm` up (never lopsided).
- `src/app/app/layout.tsx` — content bottom padding now
  `pb-[calc(4.75rem+env(safe-area-inset-bottom))]` so nothing hides behind the nav.
- (Header safe-area-top and bottom-nav safe-area-bottom were already handled and
  verified.)

## Breakpoints / container-query rules added (globals.css)

- **Global safety net:** explicit `box-sizing: border-box`; `html,body { max-width:
  100%; overflow-x: hidden }` (guard only — root causes are fixed at source);
  `img,svg,video,canvas { max-width: 100% }`.
- **`.poster-grid`** → `repeat(auto-fit, minmax(min(100%, 10rem), 1fr))`: **one
  full-width card ≤~360px**, **two only once each card has ≥~160px** usable width
  (≥~375px). `sm+` keeps `minmax(200px,1fr)` so desktop density is unchanged.
- **`.card`** → `container-type: inline-size; container-name: card` — internal pieces
  respond to the *card's* width, not just the viewport.
- **`.ratings-grid`** → `display:flex; flex-wrap:wrap` with content-sized chips and
  `min-width:0`: available sources sit on one row on a wide card and **wrap to a new
  row** (never clip / truncate) on a ~150px card. IMDb is never pushed off-edge.
- **`.container-page`** → horizontal padding `max(1rem, env(safe-area-inset-left/right))`.
- **`.wv-cta-3d`** → `white-space: normal; text-wrap: balance` so full-width / longer
  translated labels wrap inside the button instead of overflowing.

## Tests added

`tests/responsive/layout.spec.ts` (Playwright), driving a no-auth harness route
(`/dev/responsive`, gated behind `RESPONSIVE_HARNESS=1`) that renders the real
`RatingsStrip`, the card system, and the real `BuildCaseBox` with the spec's test
data (very long titles, missing ratings, all ratings, long platform names,
non-Latin/long translated titles). Widths: **320, 360, 375, 390, 393, 414, 430,
768, 1024, 1280**, plus a **large-accessibility-font** pass at 320px.

Each viewport asserts: `document.scrollWidth ≤ innerWidth` (no horizontal scroll);
no element's right edge exceeds the viewport; card children stay inside card bounds
(no clipping); **IMDb visible wherever IMDb data exists**; verdict panel visible;
action buttons visible with ≥40px tap height; the form is centered (equal L/R
margin) and within the viewport; the gavel button is inside the panel and ~full
width on phones. Run: `npm run test:responsive`.

Result: **11/11 pass.** Existing suites unaffected: typecheck, lint, 287 unit tests,
production build (46/46 pages).

## Screenshots generated (visually inspected)

`test-results/responsive/harness-{320,360,375,390,393,414,430,768,1024,1280}.png`
and `harness-320-largefont.png`. I visually inspected 320, 360, 375, 390, 430, 768,
1280, and the large-font 320 — covering every regime: 1-column ≤360, 2-column
375–430, 3-column tablet, 5-column desktop, and the accessibility-font case. In all:
full titles (2-line clamp), IMDb + every available rating fully visible, verdict
panel inside the card, equal For/Pass/Save buttons, centered State Your Case with a
full-width gavel on phones, and no horizontal scroll.

## Acceptance criteria

1. IMDb + every available rating fully visible on phone cards — ✅
2. Verdict panel never exceeds card width — ✅
3. Cards feel intentional for mobile (1-up on small phones, 2-up when wide enough) — ✅
4. State Your Case balanced & centered, full-width CTA on phones — ✅
5. No horizontal scrolling at any supported width — ✅ (asserted)
6. Nothing hidden behind the bottom navigation — ✅ (safe-area padding + tested clearance)
7. Automated responsive tests pass at every required viewport — ✅ (11/11)
8. Screenshots generated per viewport for review — ✅

## Remaining concerns

- **Verdict label wraps to two lines** ("STREAM IT") on the narrowest 2-column
  cards (~155–175px). This is graceful wrapping (no clipping) and acceptable, but a
  future refinement could shrink the label font one step via the card container
  query for a tidier single line.
- The Playwright harness renders `RatingsStrip` with static data (the live
  `AlgorithmScore`/`CardRatings` fetch ratings client-side, which needs the API);
  the harness deliberately exercises the *presentational/CSS* layer, which is what
  the responsive fixes touch. End-to-end verification with live data is a follow-up
  once a seeded/test API is available.
- Screenshots are committed for review; they are large binaries and could later be
  moved to CI artifacts instead of the repo.

## Rollback

All changes are additive/CSS-level. `git revert <commit>` restores the prior
layout. The harness route is gated behind `RESPONSIVE_HARNESS=1` (returns 404
otherwise) so it never ships in normal builds.
