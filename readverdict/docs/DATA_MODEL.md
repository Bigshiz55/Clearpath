# Data model, entity resolution & provenance

## Work vs Edition

A **Work** is the conceptual book (title, contributors, series, Book DNA,
subjects). An **Edition** is one physical/digital manifestation (format, ISBNs,
publisher, page count, narrators, cover, region, availability, rating). One work
owns many editions; a hardcover, Kindle edition, translation, large-print, and
audiobook can share a work while differing in nearly every edition field.

Types: `src/lib/domain/book.ts`.

## Provenance & confidence

Every externally-sourced or derived field is a `SourcedValue<T>`:

```ts
{ value, status, confidence, provenance, conflicts? }
```

- **status** — `confirmed | sourced | user-supplied | inferred | estimated | ai-generated | insufficient`
- **confidence** — 0..1 (`confidenceLabel` → high/medium/low/none)
- **provenance** — source, sourceRecordId, originalValue, retrievedAt,
  lastVerifiedAt, region, editionScope
- **conflicts** — preserved competing values (never discarded)

### Source priority & conflict resolution

`resolveConflict()` chooses a winner by source priority
(`user > publisher > isbndb > openlibrary/googlebooks > csv > estimate >
ai-generated`), then by confidence, and keeps every disagreeing value in
`conflicts`. Examples honored: user-confirmed history outranks an inferred
import; a calculated reading time is always `estimated`.

## Entity resolution

`matchBooks(a, b)` in `entityResolution.ts`:

1. Matching canonical **ISBN-13** ⇒ same edition (score 1).
2. Otherwise a blend of title similarity (Dice bigrams on a normalized title),
   author overlap, and year proximity.

**Guardrail:** same-work requires real author agreement, so two different books
that happen to share a title (e.g. *Home* by Morrison vs Robinson) are **never**
merged. `clusterWorks()` groups a list without over-merging; imports reuse it for
duplicate detection.
