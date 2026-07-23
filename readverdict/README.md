# ReadVerdict

**The decision engine for what you read next.**

> Goodreads records what happened. StoryGraph analyzes your patterns.
> **ReadVerdict makes the call.** Every book gets a personalized trial — and you
> get the verdict.

ReadVerdict is a book-discovery and reading-decision platform in the Verdict
product family. It answers one question better than anything else: **“Is this
book worth committing my next several hours to?”** Its signature experience puts
every book **on trial** — charges, prosecution, defense, evidence, a jury, and a
decisive verdict — all grounded in real evidence and your reading taste.

## Status

Phases 1–16 of the build are implemented locally and **run without any external
credentials**. The app uses **real Open Library data**, a **local (browser)
persistence layer** so the full flow works with no account, and honest
low-confidence behavior everywhere data is thin. See
[`docs/KNOWN_LIMITATIONS.md`](./docs/KNOWN_LIMITATIONS.md) for exactly what is
real, mocked, or credential-blocked, and [`PHASE_REPORT.md`](./PHASE_REPORT.md)
for the per-phase completion report.

**Not deployed.** Local completion only, per project direction.

## What works locally, end to end

- Take the **Reader Interview** → your **Reader DNA** is built with per-dimension
  confidence.
- **Import** a Goodreads/StoryGraph CSV, or paste a title/ISBN list → preview,
  duplicate detection, commit to your library.
- **Search** any book (real Open Library) → open a personalized **Book Trial**.
- See a **decisive verdict** immediately (Read it / Borrow / Sample / Skip / …),
  a **finish-probability prediction**, the charges, both sides of the case, and
  evidence — every item tagged _confirmed / sourced / inferred / insufficient_.
- Ask **spoiler-controlled cross-examination** questions.
- Mark a book started, **file a Reading Appeal**, mark finished or DNF with a
  reason → your **Reader DNA updates** and the next verdict reflects it.
- **Share** a spoiler-free verdict card; **export or delete** all your data.

## Stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind (literary design
tokens) · Vitest · Open Library API · Supabase-ready (migrations + clients,
inert until configured).

## Getting started

```bash
npm ci
cp .env.example .env.local   # optional — the app runs and builds with NO keys
npm run dev                  # http://localhost:3000
```

Suggested first run: **Home → Empanel your jury (interview) → Search “The Silent
Patient” → open the trial.**

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Dev / production build / serve |
| `npm run lint` · `typecheck` · `test` | Gates |
| `npm run search-lab:smoke` | Verdict-quality regression guardrails |
| `npm run search-lab:full` | Full synthetic-scenario grid |

Full gate suite:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Where things live

```
src/
  app/                    # routes: home, search, courtroom, trial/[workId],
                          #   my-books, reader-dna, onboarding, profile
    actions/books.ts      # server actions: real provider search
  components/             # trial/, search/, books/, onboarding/, dna/, import/,
                          #   profile/, courtroom/, ui/ (design system)
  lib/
    domain/               # PURE: confidence, provenance, isbn, book (Work vs
                          #   Edition), readerDna, entityResolution — tested
    providers/            # provider interface, registry, Open Library, mock
    import/               # CSV parser, Goodreads/StoryGraph/list mappers
    onboarding/           # Reader Interview → observations
    dna/                  # Book DNA inference
    trial/                # match, predict (DNF), trial composer, cross-exam
    store/                # local persistence (reducer + React provider)
    analytics/            # event taxonomy
    lab/                  # Search Lab evaluation harness
supabase/migrations/      # incremental SQL schema (RLS)
docs/                     # data model, Reader DNA, providers, import, privacy…
```

## Principles (enforced in code and tests)

- **Reduce the choice, don’t expand it** — a small, decisive answer, not a feed.
- **Never fabricate** ratings, completion/DNF rates, cohort stats, quotes, or
  availability. Missing data is labelled _insufficient_; the jury is explicitly
  _modeled similarity_, never a fake tally.
- **Provenance & confidence travel with every sourced field.**
- **Four separate models** — Book DNA, Reader DNA, Reading Session DNA, Search
  DNA — never collapsed into one score.
- **Secrets are server-only**; env is validated at runtime, not build time.
- **Accessible & mobile-first** — semantic HTML, keyboard, focus, reduced motion,
  44px targets, no color-only meaning.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.
