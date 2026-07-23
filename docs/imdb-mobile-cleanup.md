# IMDb Mobile Cleanup

Fixes the broken/empty IMDb presentation on cards and removes redundant evidence
chips. Missing IMDb data now renders **nothing** — no dash, no zero, no empty badge,
no reserved space — and the remaining metrics reflow cleanly.

## Root cause

`TileRatings.imdb` is typed `number | null`, and the card guarded only `imdb != null`.
That let `0`, `NaN`, and (from the JSON ratings endpoint) `""`, `"N/A"`, `"-"` slip
through and render as `IMDb 0.0` / `IMDb NaN` / a broken pill. There was no single
place that decided whether an IMDb value was genuinely displayable.

## Fix

**`src/lib/ratings.ts`** — one authoritative sanitizer, reused everywhere:
- `imdbScore(raw): number | null` — returns a value only for a real **1.0–10.0**
  rating. `null`, `undefined`, `""`, whitespace, `0`, negatives, `NaN`, non-finite,
  `"N/A"`, `"na"`, and every dash (`-`, `–`, `—`) are treated as **missing**. Never
  fabricates or estimates.
- `pctScore(raw): number | null` — validates critics/audience percentages; keeps a
  genuine `0%` but rejects `NaN`/out-of-range.

**`src/components/RatingsStrip.tsx`** — computes `critics`, `popcorn`, `imdb`, `meta`
through the sanitizers and renders each metric **only when valid**:
- Row 1: `Critics 84%` · `Audience 86%` (whichever exist).
- Row 2: `IMDb 8.3` (+ `Metacritic`) on its own row — hidden entirely when IMDb is
  missing, so the row collapses (no blank space) and the rest reflows.
- Word labels (`Critics` / `Audience` / `IMDb`) per the requested layout; each is
  `whitespace-nowrap` so labels never truncate.

**`src/components/TvDetective.tsx`** — same `imdbScore` guard for the On-TV picks.

**`src/lib/finder.ts`** — removed redundant evidence chips that repeated metadata
already visible above the chips: the `Your NN` match score (it's the dominant number
in the verdict panel), the bare year, the `NN% audience`, and the `IMDb 8.x` receipt.
The underlying filters still apply — only the duplicate chips are gone. Chips now
explain *why* (e.g. `on Netflix`, `fast-paced`, `all episodes out`, `English audio
verified`), never repeat the numbers.

## Visual priority preserved

WatchVerdict score → verdict label → personalized explanation → verified
audience/critics → IMDb only when present. IMDb never widens, heightens, clips, or
crowds the verdict panel (it sits on its own secondary row).

## Tests

**Unit — `src/lib/ratings.test.ts`** (9 cases): `imdbScore` returns null for null/
undefined/""/whitespace/0/negative/NaN/Infinity/"N/A"/"na"/dashes/>10, and the real
number for `8.3`, `"7.4"`, `" 9.5 "`, `10`; nothing renders as a dash or zero.
`pctScore` keeps `0`, rounds, rejects NaN/out-of-range.

**Playwright — `tests/responsive/layout.spec.ts`** at 320/360/375/390/393/402/412/
414/430 (+ tablet/desktop) and a dedicated `IMDb missing-value handling` suite at
**320/375/390/430**:
- `"IMDb —"`, `"IMDb 0.0"`, `"IMDb NaN"` never appear anywhere on the page.
- every rendered IMDb badge carries a valid 1.0–10.0 number and is not clipped.
- an **audience-only** card shows just `Audience 86%` — no IMDb, no critics element.
- an **imdb=0** card hides IMDb and still shows audience (reflowed, no gap).
- a **NaN-imdb** card hides IMDb and still shows critics.
- a valid card renders the real number (`Breaking Bad` → `IMDb 9.5`).
- single-column below 600px; no metric clips or overflows; cards stay aligned even
  when different titles expose different rating sources.

**Result:** 361 unit tests, 41 Playwright tests, typecheck, lint, and production
build all pass.

## Screenshots

`docs/screenshots/imdb-cleanup/after-{320,375,390,430}.png` — includes the
audience-only, zero-IMDb, and broken-feed guard cards rendering cleanly beside
fully-rated cards.

Do not merge or deploy.
