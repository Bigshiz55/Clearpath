# ReadVerdict — Architecture

The durable design reference. Where something is mocked or planned it is labelled
so this file never overstates what exists. Companion docs live in [`docs/`](./docs).

## 1. Product thesis

A **decision service**, not a catalog. One question: *is this book worth
committing my next several hours to?* The signature experience puts each book
**on trial** and returns a decisive **verdict**. Guardrails hold everywhere:
prefer fewer qualified results; never let popularity substitute for relevance;
never fabricate a statistic.

## 2. The four models (kept separate)

| Model | Question | Lifetime | Where |
| --- | --- | --- | --- |
| **Book DNA** | What is true about this book? | Durable per work | `domain/book.ts`, inferred in `dna/inferBookDna.ts` |
| **Reader DNA** | The reader's durable taste? | Durable per user | `domain/readerDna.ts` |
| **Reading Session DNA** | What they want right now? | Ephemeral | (modeled via Reading Appeal + session context) |
| **Search DNA** | What the request means? | Ephemeral | (query normalization; expands in a later pass) |

They are never collapsed into one embedding.

## 3. Data model & honesty (Phase 3)

- **Work vs Edition** (`domain/book.ts`): a conceptual work owns many editions
  (hardcover/paperback/ebook/audiobook/translation) that differ in identifiers,
  page counts, narrators, publishers, dates, availability, and covers.
- **Provenance & confidence** (`domain/provenance.ts`, `confidence.ts`): every
  externally-sourced or derived field is a `SourcedValue<T>` carrying source,
  original value, timestamps, region/edition scope, an evidence **status**
  (`confirmed | sourced | user-supplied | inferred | estimated | ai-generated |
  insufficient`), and a 0–1 **confidence**. Conflicts are **preserved, never
  overwritten** (`resolveConflict` picks a winner by source priority and keeps
  the losers).
- **ISBN** (`domain/isbn.ts`): validation + 10↔13 conversion + canonicalization,
  the backbone of edition identity.
- **Entity resolution** (`domain/entityResolution.ts`): matches by identifiers
  and a confidence blend of title/author/year — and **never merges similar
  titles without a shared author**. See [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md).

## 4. Providers & imports (Phase 4)

- **Adapter interface** (`providers/types.ts`) with an honest `DataState`
  (`no_data | provider_failure | genuine_zero | insufficient_sample | …`) so
  "unavailable" is never rendered as zero.
- **Registry** (`providers/registry.ts`): caching, retries with backoff,
  cross-provider fallback, health — time/sleep injected for deterministic tests.
- **Open Library** real adapter (keyless, server-only) + **labelled mock**
  fallback. Normalization maps a `ProviderBook` → domain `Work`+`Edition` with
  provenance. New vendors slot in as adapters — see
  [`docs/PROVIDERS.md`](./docs/PROVIDERS.md).
- **Imports** (`import/`): RFC-4180 CSV parser; Goodreads & StoryGraph mappers;
  ISBN/title lists; duplicate detection; raw rows preserved. See
  [`docs/IMPORT.md`](./docs/IMPORT.md).

## 5. Reader DNA (Phases 3 & 5)

31 evolving dimensions, each a `DimensionState` (value, confidence, evidence
count, supporting/contradicting, stability, user-confirmed). Observations fold in
via an evidence-weighted mean; confidence rises with agreeing evidence and never
overstates thin data; users can confirm/correct any dimension; explanations are
evidence-grounded. See [`docs/READER_DNA.md`](./docs/READER_DNA.md).

## 6. The Book Trial & prediction (Phases 5–6)

Pure, deterministic, explainable (`trial/`):

- **match** — Reader DNA × Book DNA alignment → 1–100 score with signed per-axis
  contributions (`match` targets vs `ceiling` tolerances) and coverage-based
  confidence.
- **predict** — a transparent weighted-heuristic **finish probability / DNF
  risk** with hook point, struggle point, and +/- factors; qualitative and
  low-confidence when evidence is thin (explicitly **not** a trained-ML claim).
- **trial** — composes defendant, personalized charges, prosecution, defense,
  evidence (each status-tagged), witnesses, jury, verdict (13 decisive calls),
  and sentence. Data we lack (completion/DNF/cohort) is `insufficient` with a
  null value; the jury is `modeled-similarity`, never a fake N–M tally.
- **crossExamination** — spoiler-gated Q&A distinguishing inference from sourced
  fact; refuses to fabricate.

## 7. Persistence (local now, Supabase-ready)

`store/` is a React context + pure reducer + `localStorage`, holding Reader DNA,
library, appeals, events, consent — so the whole product works with **no
credentials**. The same shapes map onto the Supabase tables in
`supabase/migrations/0001_init.sql` (RLS on every user table); a server-backed
repository can replace the local one behind the same hooks once auth is
configured. See [`docs/PRIVACY.md`](./docs/PRIVACY.md).

## 8. Application surfaces (Phases 9–12)

Mobile-first shell (`components/nav/AppShell.tsx`): desktop top bar + fixed
mobile tab bar, skip link, safe-area, reduced motion. Routes: **Home, Search,
Courtroom, Trial, My Books, Reader DNA, Onboarding, Profile** (+ internal
`/style-guide`). Real state coverage: loading (skeletons), empty, error, low
confidence, import preview/success, provider failure, no-match.

## 9. Analytics, consent & evaluation (Phases 8, 10, 14)

- **Taxonomy** (`analytics/events.ts`): semantic events with versions and
  allow-listed props; `validateEvent` strips forbidden keys (passwords, tokens,
  email, payment, private exclusions, raw audio). The store's `track()` enforces
  it **and respects consent** (analytics off by default).
- **Search Lab** (`lib/lab/`): synthetic reader archetypes × book fixtures run
  through the real engine; quality metrics + hard-constraint expectations as
  regression guardrails; `npm run search-lab:*`.

## 10. Visual identity

A literary Verdict-family system distinct from WatchVerdict: Deep Library Green +
Dark Ink surfaces, warm parchment type, burnished copper and evidence gold
accents, oxblood for objections; editorial serif display + legible sans; subtle
courtroom motifs (fine rules, exhibit labels, docket stamps, embossed seals).
Tokens in `tailwind.config.ts`; legacy Phase-2 token names are aliased so the
whole app adopts the identity without churn.

## 11. Engineering

Strict TS (`noUncheckedIndexedAccess`), runtime env validation (`validateEnv`),
feature flags (`flags.ts`), server-only secrets, incremental migrations with RLS,
deterministic pure engines with **88 unit/integration tests**. The data model is
written to eventually support other Verdict products (shared accounts, consent,
provenance, taste vectors) while keeping book-specific data book-specific.

## 12. Real vs mock vs planned

See [`docs/KNOWN_LIMITATIONS.md`](./docs/KNOWN_LIMITATIONS.md) and
[`PHASE_REPORT.md`](./PHASE_REPORT.md) for the authoritative matrix.
