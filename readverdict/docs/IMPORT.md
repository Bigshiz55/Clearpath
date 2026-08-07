# Import guide

`src/lib/import/`. All parsers are pure and preserve the **raw uploaded row** for
provenance and later correction.

## Supported now

| Kind | Input | Notes |
| --- | --- | --- |
| `goodreads_csv` | Official Goodreads export | Unwraps `="…"`, maps shelves → status (incl. DNF via bookshelves), canonicalizes ISBNs, ratings/pages/owned |
| `storygraph_csv` | Official StoryGraph export | Native `did-not-finish`, fractional star ratings |
| `title_list` | Pasted titles, one per line | `Title by Author` supported; bare ISBN lines resolved |
| `isbn_list` | Pasted ISBNs | Validated + canonicalized to ISBN-13 |

Use `parseImport(kind, text)`. Every result is an `ImportResult` with
`books`, `skipped` (with reasons — never silently dropped), and a `summary`.

## Duplicate detection

`detectDuplicates(books)` clusters rows via the shared entity-resolution rules,
so the same work imported twice is flagged while similar-titled different books
stay separate. The import UI previews parsed/skipped/duplicate counts before you
commit; low-confidence matches are never added silently.

## Planned (documented, not yet built)

- **Screenshot / Judge My Shelf** — image understanding to identify visible
  titles, with a per-book confirmation screen. Requires a vision model
  (credential-blocked). A physical book is never claimed "unread" without
  confirmation.
- **Connected accounts / email receipts** — strictly opt-in OAuth where
  officially supported; minimum scope; disconnect + delete; audit trail. No
  password collection, ever.

See [`docs/KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md).
