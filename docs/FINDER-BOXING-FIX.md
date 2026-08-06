# Finder subject fix — "boxing" is a hard constraint, not two genres

## The live failure
A signed-in user asked Forensic Search (**POST /api/finder**):

> "Find me a boxing movie that I would like that's been made within the last 20 years"

and got **Avatar: The Last Airbender, Spider-Man: Into the Spider-Verse, The Dark
Knight**, with chips **Movies · Last 20 yr · 2 genres**. "Boxing" was gone.

## Root cause (in the real route, not a neighbor)
`POST /api/finder` → `parseAskWithAI` → `FinderQuery`. The `FinderQuery` model
had **no required-subject concept**: the AI mapped "boxing" to two genres
(`genreIds:[…]`) and set no keyword. Even when a keyword survived,
`finder.ts`'s **keyword-starvation relaxation** dropped it and back-filled the
grid with popular genre matches. So the subject was lost two different ways, and
the client adopted the returned `query`, which is why the chip read "2 genres".
This is the `/api/finder` execution path — separate from `/api/ask`, which prior
work had touched.

## The fix (systemic)
- **`src/lib/nlu/requiredSubject.ts`** — deterministic, LLM-independent detector.
  A named subject (boxing / wrestling / MMA / martial arts) is required; a
  negated one is excluded. Each subject carries a bounded keyword expansion and
  the adjacent subjects it must never be broadened into.
- **`FinderQuery`** gains `subjectKeywordIds` (hard `with_keywords`),
  `subjectLabel`, `subjectCanonical`, `excludeKeywordIds` (`without_keywords`),
  `minReleaseDate` (exact calendar boundary).
- **`src/lib/finderSubject.ts`** — one shared step used by **both** `/api/finder`
  and `/api/ask`: resolves the subject to keyword ids, sets it as a hard filter,
  drops AI proxy-genres (unless the user named a genre), converts "last N years"
  to an **exact date** (2006-08-06 on 2026-08-06) and discloses "I treated
  'made' as released…".
- **`finder.ts`** — a required subject is **never relaxed or padded**. Discovery
  gates on the subject keywords alone (airtight evidence); if only 7 verified
  boxing movies exist, 7 is the answer, with honest wording. Every returned item
  carries a `subjectEvidence` receipt.
- **Route** — `/api/finder` (and `/api/ask`) attach the deployment SHA (body +
  `X-WatchVerdict-SHA` header), an `interpretation` list, and a
  `constraintReceipt`; a **no-filler assertion** drops any item lacking subject
  evidence so "everything matches" can never render falsely.
- **Chips** — `activeFilterChips` shows **Boxing** as its own chip and never
  collapses a subject into "N genres".
- **Founder Production Search Proof** page (`/founder/search-proof`) — one-click
  authenticated run of the real route, showing page SHA vs response SHA (with a
  stale-build warning), the applied query, constraint receipt, per-title
  evidence, and a redacted JSON download. No tokens/cookies/keys are exposed.

## Tests (frozen, append-only)
- `src/lib/nlu/requiredSubject.test.ts` — hard-subject corpus v1 (20 mandated
  cases): boxing ≠ wrestling ≠ MMA ≠ martial arts; negation excludes; Rocky-like
  ≠ boxing when boxing is excluded.
- `src/lib/finderSubject.test.ts` — the exact query's produced **query shape**:
  hard subject set, proxy genres dropped, exact date boundary, chips
  "Movies · Boxing · Last 20 yr" (never "2 genres"), exclusion wired.
- `src/app/api/finder/finderSubject.int.test.ts` — env-gated route-level test
  that exercises the **actual handler** live (skipped without secrets; never a
  false green).

## Definition-of-done items requiring production auth
Live-authenticated confirmation of the exact query on production is done via the
deployed **/founder/search-proof** page (one click), since automated
authenticated verification has no credentials in this environment.
