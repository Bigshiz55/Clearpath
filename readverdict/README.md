# ReadVerdict

**The right book. Not more books.**

ReadVerdict is an intelligent book-recommendation **decision service** in the
Verdict product family. You describe what you want — in words or by voice — and
it returns a short, ranked set with a clear verdict and the reasons behind it,
tuned to your taste, your time, your format, and who you're reading with.

It is deliberately **not** a catalog, a popularity feed, or a Goodreads clone.
Its job is to _reduce_ choice to the right next read.

> **Status: Phase 1 — durable foundation.** This repository is the project
> baseline: stack, brand tokens, responsive app shell, Supabase-ready
> architecture, tests, and a green production build. Feature surfaces
> (Ask, Discover, My Books, Read Together, Reader DNA) are present as
> **honest, phase-labeled placeholders** — they never fabricate book data.
> See [`ARCHITECTURE.md`](./ARCHITECTURE.md) and the phased plan below.

## Stack

- **Next.js 14** (App Router) · **TypeScript** (strict, `noUncheckedIndexedAccess`)
- **Tailwind CSS** design tokens (Verdict-family theme)
- **Supabase-ready** architecture (`@supabase/ssr`) — wired to degrade gracefully
  until configured
- **Vitest** unit tests · **ESLint** (`next/core-web-vitals`) · **Prettier**

## Getting started

```bash
npm ci
cp .env.example .env.local   # optional — the app runs and builds with no keys
npm run dev                  # http://localhost:3000
```

No secrets are required to run the Phase 1 foundation. Supabase and external
providers activate only once their keys are present in `.env.local`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run format` | Prettier check |

Run the full gate suite before every commit:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Project structure

```
src/
  app/                     # App Router routes
    page.tsx               #   Home (positioning + verdict-layout preview)
    ask/                   #   Ask ReadVerdict (center of the product)
    discover/  my-books/   #   Core areas
    together/  profile/
    reader-dna/            #   Secondary area
    loading|error|not-found.tsx
    globals.css
    layout.tsx             # Root layout → AppShell
  components/
    nav/                   # AppShell, responsive nav (desktop bar + mobile tabs)
    ui/                    # Container, PageHeader, EmptyState, VerdictBadge
    icons.tsx
  config/nav.ts            # Canonical navigation (desktop vs mobile subsets)
  lib/
    env.ts                 # Runtime env access (never at build time)
    supabase/              # server + browser clients (null until configured)
    verdict/tiers.ts       # PURE, tested verdict-tier taxonomy
    utils/cn.ts            # PURE, tested classname helper
test/shims/                # server-only shim for the Vitest runner
```

## Design & product principles (enforced from day one)

- **Reduce choice, don't expand it.** Return fewer, better matches over a padded
  grid.
- **Never fabricate data.** Placeholders state what's coming; they don't invent
  ratings, availability, or book attributes.
- **Four separate models** — Book DNA, Reader DNA, Reading Session DNA, Search
  DNA — never collapsed into one score. (See `ARCHITECTURE.md`.)
- **Secrets are server-only.** `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`,
  provider keys never get a `NEXT_PUBLIC_` prefix.
- **Env validated at runtime, not build time**, so `next build` works with no
  configuration.
- **Accessible & responsive** — semantic HTML, keyboard support, visible focus,
  reduced-motion support, 44px+ touch targets, safe-area insets, no
  color-only signals.

## Phased build plan

1. **Durable foundation** ← _this repository_
2. Brand & application shell
3. Core book data (canonical models, Book DNA, provenance)
4. Ask ReadVerdict (Search DNA parser, results, Full Verdict)
5. Reader DNA
6. My Books
7. Read Together
8. Availability & services
9. Internationalization (English · LatAm Spanish · Simplified Chinese)
10. Analytics & privacy
11. ReadVerdict Search Lab (automated evaluation & regression)
12. Verification

Each phase ends with: tests, production build, commit, and an honest status
report — never "done" on the basis of written code alone.

## Backup & source control

This project keeps a full local git history. Durable off-machine backup
(a private GitHub repository) is pending destination authorization — see the
Phase 1 status report. Until then, ZIP checkpoints are produced after each
major phase.
