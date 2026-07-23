# CLAUDE.md — working in ReadVerdict

ReadVerdict: Next.js 14 (App Router) + TypeScript strict + Tailwind + Open
Library. A standalone books companion to WatchVerdict. No secrets, no database —
public, read-only, deterministic.

## Commands
- Install: `npm ci`
- Dev: `npm run dev` · Build: `npm run build` · Serve: `npm start`
- Gates before committing: `npm run typecheck && npm run lint && npm test && npm run build`

## Architecture rules (important)
- **The deterministic engine is authoritative.** All core scoring lives in
  `src/lib/scoring/` — pure (no I/O), unit-tested, and never reaches out to the
  network. It is always what the verdict page relies on. If you touch it, update
  `src/lib/scoring/*.test.ts` and keep all tests passing.
- **Age-based signals take an injected reference year** (`refYear`, default
  2026) so the score is deterministic and testable. Do not read the wall clock
  inside the engine.
- **The Open Library client is server-only.** `src/lib/books/openLibrary.ts`
  starts with `import 'server-only'`. Client components may only import the pure
  helpers (`src/lib/books/cover.ts`, `src/lib/format.ts`).
- **Env is validated at runtime, not import/build time** (`src/lib/env.ts`) so
  `next build` works with no configuration. Don't move access to module top
  level. ReadVerdict has no required env — Open Library is key-less.

## Data honesty
Never fabricate ratings, page counts, availability, or edition counts. When Open
Library data is missing, label it unavailable (the UI and engine already do —
e.g. an unrated book falls back to the neutral acclaim prior and is marked
low-confidence, never given an invented rating).

## Scoring shape
`ReadVerdict Score = 0.42·acclaim + 0.20·popularity + 0.20·readability +
0.18·stayingPower`, each component clamped 0–100. Acclaim is a
confidence-weighted blend (`acclaim.ts`) so thin rating pools shrink toward a
neutral prior. Tiers/calls live in `verdict.ts`.
