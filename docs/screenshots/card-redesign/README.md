# Card + trailer redesign — visual evidence

Captured from the real components on the `MOBILE_HARNESS=1` build
(`/dev/visual-qa`, `/dev/top10`) with `scripts/cardAudit.mjs` (before) and
`scripts/cardShots.mjs` (after). Both are re-runnable:

```bash
npm run build:harness
MOBILE_HARNESS=1 PORT=3211 \
  NEXT_PUBLIC_SUPABASE_URL=https://harness.invalid \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=harness-anon-key npm start &
node scripts/cardAudit.mjs test-results/card-audit          # geometry numbers
node scripts/cardShots.mjs test-results/shots               # these screenshots
```

## What is real in these shots and what is not

The harness has no TMDB key and this environment has no route to TMDB or
YouTube, so three things are stubbed, and none of them is dressed up as real:

- **Poster artwork is absent.** The placeholder frame is what the app draws
  when TMDB gave it nothing — it is the product's real empty state, not a
  missing image.
- **Provider logos render as broken-image icons.** `image.tmdb.org` is
  unreachable here. The tile geometry is real; the marks are not loading.
- **The trailer embed is a synthetic slate** that says so on its face
  ("TRAILER EMBED — stubbed, no TMDB key in harness"). What the shot proves is
  the geometry: a real `<iframe>`, of the real dimensions, mounted inside the
  card's own media frame, with the whole card still on screen. Substituting
  real key art would make the screenshot a claim about something that did not
  run.

## before/

| File | What it shows |
| --- | --- |
| `01-grid-1440x900.png` | The browse grid. Cards measure **763px**; the grid starts at y=271, so the first card's bottom edge is at 1028px in a 900px viewport. There is no scroll position at which a whole card is visible. |
| `01b-grid-1280x800.png` | The same, worse: 763px of card in 800px of viewport. |
| `01c-mobile-390.png` | 390×844. Cards 559–601px — a 42px spread across one grid. |
| `02-top-picks-rail.png` | The ranking strip: 5.5rem grey numerals behind the artwork, detached green `89 HOW?` boxes under each title. |
| `02b-top-picks-rail-how-open.png` | Opening one score's working grows the rail from 292px to **522px** (+230) and pushes everything below it. |

## after/

| File | What it shows |
| --- | --- |
| `03-grid-three-up-poster.png` | Three cards, poster state. **527px** each, zero spread. |
| `04-grid-three-up-trailer-playing.png` | **The proof shot.** The centre card's trailer is playing inside its media frame. Title, metadata, Verd1ct, reason, availability and FOR·AGAINST·SAVE are all still on screen; the two neighbours have not moved a pixel. |
| `02-top-picks-redesigned.png` | The rail: small `#1` rank chips on the artwork, the Verd1ct TV badge with its verdict word, a quiet `WHY #1?` control. |
| `02b-top-picks-trailer-playing.png` | A trailer inside a rail poster. The rail height is unchanged; rank and title stay readable. |
| `02c-top-picks-why-open.png` | The evidence panel opens **below** the rail — the ten posters do not move. |
| `05-more-info-with-trailer.png` | More Info: a large video region, then the ratings, every "why it fits", genres and the full synopsis. |
| `06-mobile-390-grid.png` | 390×844 grid. 393px cards, zero spread. |
| `06b-mobile-390-trailer-playing.png` | Preview on a phone: the trailer plays in the row card's poster frame, with ✕ and mute (pause/restart step aside below a 220px frame). Whole card visible. |
| `06c-mobile-390-more-info.png` | The phone sheet. |
| `07-desktop-1440x900.png`, `08-desktop-1280x800.png` | The two desktop widths, for the record. |

The numbers in both tables come from `scripts/cardAudit.mjs`, and every one of
them is asserted continuously by `tests/mobile/card-geometry.spec.ts`.
