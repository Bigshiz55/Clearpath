# ReadVerdict 📚✓

Should you read it? Search any book and get a clear **ReadVerdict** — a
transparent 0–100 score, honest signals about length and availability, and where
to read it. A books companion to WatchVerdict, powered by
[Open Library](https://openlibrary.org).

> **Runs with zero configuration.** Open Library is a free, key-less public API,
> so `npm ci && npm run dev` is all you need — no secrets, no accounts.

## Highlights

- **Transparent, deterministic score.** A pure engine (`src/lib/scoring/`)
  blends four interpretable components — reader **acclaim**, **popularity**,
  **readability**, and **staying power** — into one honest 0–100 number. Every
  input is shown on the verdict page. Fully unit-tested (26 tests), never any
  I/O.
- **Confidence-weighted acclaim.** Ratings are weighted by sample size: a 5-star
  average from 3 ratings never outranks a 4.3 from 900. Thin evidence shrinks
  toward a neutral prior and is labelled low-confidence.
- **Honest data.** Ratings, availability, edition counts, and page counts come
  straight from Open Library. Missing data is labelled unavailable — never
  fabricated.
- **Clear call.** Read it / Maybe / Skip, with the specific reasons for and
  against, reading signals, and where you can legally get the book.
- **No account needed.** Public, read-only, server-rendered.

## Stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind · Vitest · Open Library
API.

## Local development

```bash
npm ci
npm run dev        # http://localhost:3000
```

Optionally copy `.env.example` to `.env.local` to set an Open Library contact
string for the outbound `User-Agent`. Nothing else is required.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |

Run all gates before committing:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Architecture

```
src/
  lib/
    scoring/            # PURE deterministic engine — no I/O, unit-tested
      acclaim.ts        #   confidence-weighted rating blend
      general.ts        #   the 0–100 ReadVerdict Score
      verdict.ts        #   tier, call, signals, reasons, reading options
      *.test.ts         #   26 tests; fixtures in fixtures.ts
    books/
      openLibrary.ts    # server-only Open Library client (search + work detail)
      cover.ts          # client-safe cover URL helper
    format.ts           # pure display helpers (reading time, bands)
    types.ts            # shared domain types
    env.ts              # runtime env access (never at build time)
  app/
    page.tsx            # home + search box
    search/page.tsx     # results grid
    book/[workId]/page.tsx  # the verdict page
  components/           # ScoreDial, BookCover, BookCard, SearchBar, …
```

### Design rules (mirrored from WatchVerdict)

- **The deterministic engine is authoritative.** All scoring lives in
  `src/lib/scoring/` — pure, no I/O, unit-tested. It is what the verdict relies
  on. If you touch it, update the tests.
- **Secrets stay server-only.** The full Open Library client is `server-only`;
  only the pure cover-URL helper is client-safe. ReadVerdict needs no secrets,
  but the boundary is kept regardless.
- **Env is validated at runtime, not build time** (`src/lib/env.ts`), so
  `next build` works without configuration.
- **Data honesty.** Never fabricate a rating, page count, or availability. When
  Open Library data is missing, the UI and engine label it unavailable.

## The score, briefly

```
ReadVerdict Score =
    0.42 · acclaim        (confidence-weighted reader ratings)
  + 0.20 · popularity     (log-scaled reading-log reach)
  + 0.20 · readability    (length commitment + availability)
  + 0.18 · stayingPower   (editions in print + endurance over time)
```

Each component is clamped to 0–100. Age-based signals take a reference year so
the score is deterministic and testable.

## Attribution

Book data, covers, and ratings from **Open Library** (Internet Archive). Shown
as reported, with attribution, in the app footer and on every verdict page.
