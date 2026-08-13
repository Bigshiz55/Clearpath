# Card / trailer premium pass — visual review

Rendered through the `MOBILE_HARNESS=1` harness routes, which mount the real
components: `/dev/visual-qa` (the real `PosterCard` grid) and `/dev/top10` (the
real `Top10Rail`). Committed here so the change can be reviewed from the pull
request without running anything.

| File | What it shows |
| --- | --- |
| `before-toppicks-1440.png` | Top Picks at `aa82bba`: 5.5rem grey numerals behind the artwork, posters offset to clear them, detached coloured "89 HOW?" boxes |
| `after-toppicks-1440/1280/390.png` | Poster-dominant rail: `#N` chip on the artwork, the app's own verdict colour on the score, restrained "Why #1?" |
| `before-grid-1440.png` / `before-card-390.png` | The browse grid before |
| `after-grid-1440/1280.png`, `after-card-390.png` | After: aligned rows, reserved title block, More info |
| `after-grid-trailer-1440/1280.png`, `after-card-trailer-390.png` | **A trailer playing.** Compare the outer geometry against the matching non-trailer frame — it is identical |

## The interaction contract

A trailer may never change the outer dimensions of a card.

- **Poster state** — the poster occupies the media frame.
- **Trailer state** — the video replaces the poster *inside the same frame*.
- **Nothing below moves.**

No expansion, no row displacement, no card-height mutation, no clipping, no
overlay escaping into another row, no half-visible card, no giant hover card.
One trailer plays at a time; the explicit ▶ Trailer control stays available;
More Info owns the large cinematic experience.

This is proved rather than asserted by
`tests/mobile/card-trailer-geometry.spec.ts`, which measures every card in the
grid before, during and after playback at 1440, 1280 and 390 and requires the
three measurements to be *identical*, and separately requires the player's box
to equal its media frame's box exactly.

## What was actually wrong

- **`▶ Trailer` was 68×25** and each icon control 32×32 — under the 44px
  interaction minimum, on controls sitting over artwork where a mis-tap costs
  the card's own navigation. The target and the mark are now different things:
  a transparent ≥44px button extending into the poster's dead corner, with the
  refined pill inside it.
- **An unnamed provider crashed the whole results page.** See the commit
  message on `8079782` — a throw during render unmounts the tree, so one
  result with unresolved availability produced "Something went wrong" and no
  titles at all.
- **The trailer wrapper had no height**, so any child asking for `h-full`
  collapsed to its content — which is why a card with no artwork drew its
  fallback title at the top of an empty frame.
- **Top Picks carried a second colour language.** `Top10Rail` had its own
  `toneFor()` with its own thresholds (80/65/50, plus a pink at 65) that
  disagreed with `verdictVisual.ts`. It now routes through `scoreVerdict()`.
- **Rows did not line up.** A one-line title reserved one line and a two-line
  title reserved two, so every block below — facts, score, synopsis, provider
  row — started at a different height across a row.
