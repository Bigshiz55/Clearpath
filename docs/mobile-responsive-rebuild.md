# Mobile Responsive Rebuild — Structural Fix

This was treated as a **layout-architecture defect**, not a spacing pass. Root causes
were fixed at source in the shared primitives (grid, logo, header, hero, ratings),
and every fix is proven with Playwright **bounding-box** assertions at real device
widths — not screenshot diffing alone.

## Root cause of each mobile defect

| # | Reported defect | Root cause | Fix |
|---|-----------------|-----------|-----|
| 1 | Logo clips to "WatchVERD_CT" | `Logo.tsx` wordmark was `text-2xl` with `whitespace-nowrap` beside a fixed **56px** (`h-14 w-14`) mark; on a 320–390px header shared with right-side controls it overflowed and clipped. The `.wv-iflip` I/1 slot was also a tight `0.64em`. | Mark is responsive (`h-10 → sm:h-14`); wordmark size is fluid `clamp(1.05rem, 4.6vw, 1.875rem)` so it **shrinks to fit** one line instead of clipping; `min-w-0` on the link; flip slot widened to `0.7em`. |
| 2 | Two-column desktop grid on phones | `.poster-grid` used `repeat(auto-fit, minmax(min(100%,10rem),1fr))` → **160px** min track = two columns at ≥~336px. | `.poster-grid` is now `grid-template-columns: 1fr` **below 600px** (true single column), multi-column only at ≥600px. |
| 3 | Verdict metrics / IMDb clipped | Symptom of ~160px squeezed cards + a single wrapping ratings row where IMDb competed for width. | Full-width single-column cards (#2) + priority ratings: **Row 1** 🍅 critics + 🍿 audience, **Row 2** IMDb (+ Metacritic) on its **own row**, each `whitespace-nowrap` (never truncated). |
| 4 | FOR / PASS / SAVE squeezed | Three `flex-1` buttons inside a 160px card. | Full-width single-column cards give the 44px buttons real room; they keep `min-w-0 flex-1` so they share width and never overflow. |
| 5 | Verdict panel forced desktop-horizontal into a mobile card | 160px card couldn't hold the score+call+ratings. | At full card width the score stays dominant, the ruling reads beside it, and ratings stack in priority rows. |
| 6 | Header controls consume too much width | Left cluster had a fixed `gap-6` and an oversized `lg` mark. | Header gaps compacted on phones (`gap-2/gap-3` → `sm:gap-4/gap-6`), `min-w-0` added, mark shrunk on mobile. |
| 7 | Hero/prompt oversized | `app/app/page.tsx` hero used `text-4xl`/`text-6xl` + `space-y-8` + a `text-2xl/3xl` promise banner stacked above the input; `BuildCaseBox` put a long description + link **above** the input. | Headline is `clamp(1.75rem, 7vw, 3.75rem)`; mobile spacing tightened (`space-y-6/4`); promise banner compacted; **input + gavel now sit directly under the title**, with the examples/explanation moved below. |
| 8 | Bottom nav may overlap content | — (already reserved) | `app/app/layout.tsx` reserves `pb-[calc(4.75rem+env(safe-area-inset-bottom))]`; the harness now renders the **real** `MobileNav`, and a test scrolls to the end and asserts the last card's actions clear the nav's top. |
| 9 | Reliance on fixed widths / overflow hiding | Fixed `10rem` grid track + fixed logo font. | Replaced with `1fr` grid + `clamp()` logo; `overflow-x: hidden` on `body` is kept only as a guard — no content is masked (bounding-box tests would catch it). |
| 10 | Passes tests but fails on a real phone | Old harness rendered synthetic cards only and never rendered the header/logo/nav. | Harness now renders the **real** `Logo`, `BuildCaseBox`, shared `.poster-grid`, `RatingsStrip`, and `MobileNav`, so tests exercise production components. |

## Files changed

- `src/app/globals.css` — `.poster-grid` single-column below 600px; `.wv-iflip` slot 0.64em→0.7em.
- `src/components/Logo.tsx` — responsive mark, `clamp()` fluid wordmark, `min-w-0`.
- `src/components/Nav.tsx` — compact header gaps + `min-w-0` on the left cluster.
- `src/app/app/page.tsx` — `clamp()` hero headline, tighter mobile spacing, compact promise banner.
- `src/components/BuildCaseBox.tsx` — input + CTA above the examples/explanation; shorter copy; tighter spacing.
- `src/components/RatingsStrip.tsx` — priority two-row metric layout (from the prior pass, retained).
- `src/components/PosterCard.tsx` — shorter 3:4 mobile poster, tighter action-bar padding (retained).
- `src/app/dev/responsive/page.tsx` — harness rebuilt to render real Logo header + MobileNav + hero + single-column grid.
- `tests/responsive/layout.spec.ts` — full bounding-box assertion suite (below).

## Automated assertions (Playwright bounding-box, not screenshots)

Run at widths **320, 360, 375, 390, 393, 402, 412, 414, 430**, 768/1024/1280, landscape 740×360, and text scaling **100/125/150/200%**. Each fails if:

- `document.scrollWidth > clientWidth` (horizontal scroll) — `noHorizontalScroll`.
- any visible element's right edge exceeds the viewport — `nothingOffscreen`.
- the logo is incomplete or clipped — `assertLogoComplete` (text contains `Watch…CT`, `scrollWidth ≤ clientWidth`, inside viewport).
- **more than one card column below 600px** — asserts all cards share one left edge; asserts multi-column at ≥600px.
- a mobile card is below the minimum usable width — asserts card width ≥ viewport − 32px gutters.
- IMDb is partially rendered — `notClipped` on every `[data-rating="imdb"]` + full "IMDb 8.x" text present.
- IMDb is not on its own row below the % scores — asserts `imdb.y ≥ critics.y + height`.
- an action button is < 40px tall or outside its card.
- the bottom nav covers interactive content — scrolls to end, asserts last action clears the nav top.

**Result: 37/37 Playwright tests pass** (18 layout + 15 audio-verification is unit, 4 audio Playwright, On TV 15). Typecheck, lint, **352 unit tests**, and production build all pass.

## Before / after screenshots

`docs/screenshots/mobile-rebuild/` — 320 / 390 / 430px before-and-after, plus 360px @ 200% text.

- **before-390.png**: two-column grid on a phone; hero shows the long description + "or just name…" link **above** the input. (The old harness didn't render the header, so the logo defect isn't visible there — it lived in the real `Nav`/`Logo`, now fixed and rendered in the new harness.)
- **after-390.png / after-320.png / after-430.png**: single full-width column; complete "WatchVERD1CT" logo in the header; input + gavel near the top; score dominant; 🍅/🍿 on row 1 and IMDb on its own row.
- **after-360-scale-200.png**: at 200% text the logo is still complete, cards stay single-column, IMDb never clips, no horizontal overflow.

## Confirmations

- **Logo complete:** yes — asserted at every width and at 100–200% text scaling.
- **Single column below 600px:** yes — asserted (one shared left edge; card ≥ full width − gutters).
- **IMDb never clips:** yes — `notClipped` + full-text assertion on every IMDb chip, incl. 200% text.
- **Horizontal scroll is zero:** yes — `scrollWidth ≤ clientWidth` at every width/scale/orientation.
- **Bottom nav overlap:** none — scroll-to-end test confirms actions clear the nav.

## Honest limitations

- **Validation environment:** headless Chromium driven at the exact CSS device widths above, with bounding-box assertions and orientation/text-scaling variants — this is stronger than "a desktop window narrowed by hand," but it is **not a physical iOS/Android device**. No real iPhone/Safari or Android Chrome hardware is available in this environment, so true on-device Safari (including its dynamic browser-chrome show/hide) was not exercised. The safe-area insets and `100dvh`/`dvh` units used are the correct primitives for that behavior, and are in place.
- **Screen coverage:** baselines were captured for the **home hero, recommendation grid, and movie card** (harness), **On TV** (its harness), and **verified-audio cards** (its harness). The remaining listed screens — search results, watchlist, judge/decision flow, empty/loading/error states — were **not separately screenshotted**; they render through the same now-fixed shared primitives (`.poster-grid`, `.card`, `Logo`, `MobileNav`, `RatingsStrip`), so they inherit the structural fixes, but they do not yet have their own visual baselines.
