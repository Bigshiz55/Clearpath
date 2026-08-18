# PHASE 1 — TASTE DNA → PRODUCTION RECOMMENDATION RANKING · SHIP LEDGER

Continuation state across sessions: read this, execute **NEXT ACTION**.

WORKSTREAM: `phase1-taste-dna-ranking`
MISSION: Make the user's learned Taste DNA change the ORDER of production Ask
recommendations, without ever changing WHO is eligible.

CURRENT BRANCH: `claude/phase1-taste-dna-ranking`
BASE / MERGE-BASE: `1b014f2fda22d3a90ad1f51e30a908deef4072f4` — cut from
CURRENT main, which is the merge of the hard-constraint architecture (PR #78).
Production verified by the owner at that SHA: `branch: main`,
`environment: production`, canonical interpreter live, hard-constraint
eligibility live.
STATUS: ARCHITECT + BUILDER + VERIFIER complete. All gates green. Branch only —
NOT merged, no merge authorization requested or given.

---

## THE PROBLEM THIS PHASE SOLVES

Taste DNA existed and was learned, but it did not reach the surface the user
actually asks questions on. Ask (`runFinder`) ordered survivors by
`matchScore` — a **user-independent** quality number. Two different users with
opposite tastes asking the identical question received a byte-identical list.
The `rankByDna` personalization layer existed but was wired only into
Watch/Browse, never into Ask.

## ARCHITECTURE AUDIT (done before any code, as required)

### Finding 1 — `rankByDna` has TWO channels, and only one of them is free

| channel | inputs | cost per title | usable in bulk ranking |
|---|---|---|---|
| **embedding** | `getTitleVector` → `computeTitleVector` → `embed()` | **PAID** OpenAI call on cache miss (30-day `unstable_cache`) | **NO** |
| **cache-only** | `getCachedDimensions` + `dimensionMatch` + `preferenceNudge` + `explainTitle` | 0 network calls; reads the `title_dimensions` cache | **YES** |

The work order forbids "paid AI calls in bulk ranking". Phase 1 therefore
consumes **only the cache-only channel**. `getTitleVector` is deliberately not
called from the Ask path. This is the single most important design decision in
the phase and the reason a new bridge module exists instead of a direct
`rankByDna` call: `rankByDna` cannot be reused wholesale without dragging the
paid channel into a grid path.

### Finding 2 — eligibility and ordering were already separated

The hard-constraint work (PR #78) left `runFinder` with a clean seam:
`survivors` → `eligibleSurvivors` → sort. Taste only ever needed to replace the
comparator, never the filter. **The ordering of those two stages IS the
guarantee** that Taste DNA cannot override a hard constraint — a candidate the
request ruled out is not present to be re-ranked. No new enforcement logic was
added; none was needed.

### Finding 3 — genres were already in hand at hydration

`meta.genres` is read during hydration and was being discarded.
`preferenceNudge`/`explainTitle` need it. Carrying it on `FinderItem` avoids an
N+1 refetch entirely.

## WHAT WAS BUILT

### `src/lib/ask/personalSignal.ts` — pure, no I/O, 14 tests

The taste contract. Bounded by construction:

```
DIM_NUDGE_MAX = 8    DIM_NUDGE_SLOPE = 0.16    PREF_NUDGE_MAX = 10
PERSONAL_NUDGE_CEILING = DIM_NUDGE_MAX + PREF_NUDGE_MAX = 18
```

`personalSignal()` returns `{ personalScore, rankScore, participated, evidence }`.
When nothing about the user participated it returns `personalScore: null`,
`rankScore = objective`, `participated: false` — an honest no-op, not a
fabricated 50. The reused constants are the SAME ones the existing DNA layer
uses; no second set of magic numbers was introduced.

### `src/lib/ask/personalRanking.ts` — server-only gatherer

`personalizeCandidates(supabase, userId, items)` loads, for the WHOLE pool:

- `loadPreferenceCached(supabase, userId)` — 1 query, cached
- `getUserDimensionProfile(supabase, userId)` — 1 query
- `getCachedDimensions([...all ids])` — 1 batched query

That is **O(1) queries for N candidates**, pinned by a test. It degrades to
inert on: no `userId`, empty pool, no preference AND no dimension samples, or
any thrown error (whole body is `try/catch` → `inert(items)`).

### `src/lib/finder.ts` — the wiring, ~28 lines

Between `eligibleSurvivors` and the sort. The comparator changes from
`b.matchScore - a.matchScore` to `b.personal.rankScore - a.personal.rankScore`.
With no DNA on file `rankScore === objective === matchScore`, so the sort is
byte-identical to the one it replaces.

## RANKING FLOW — BEFORE / AFTER

```
BEFORE:  candidates → hard-constraint gate → eligibleSurvivors
                                           → sort by matchScore (user-independent)

AFTER:   candidates → hard-constraint gate → eligibleSurvivors
                                           → personalizeCandidates (cache-only, O(1) queries)
                                           → sort by personal.rankScore (objective ±18)
```

The gate is untouched and still runs FIRST. That is the invariant.

## THE FIVE REQUIRED REGRESSION TESTS — all present, all passing

`src/lib/ask/personalRanking.test.ts` (12 tests total):

1. DNA changes ranking — two users, same pool, different order.
2. **Hard constraints are protected** — taste cannot promote an ineligible
   title, because the gate already removed it.
3. No DNA degrades honestly — order identical to the objective sort,
   `participated: false`, `personalScore: null`.
4. Explicit preferences are reflected in the ordering.
5. Explanation evidence is real — every reason traces to a stored signal,
   nothing fabricated.

Plus: an O(1)-query cost test (query count does not grow with pool size).

## PERFORMANCE

- **Paid AI calls added to bulk ranking: 0.** The embedding channel is not
  reached from Ask.
- **Database queries: 3 per request, independent of pool size.** No N+1.
- **Per-title work: pure arithmetic** over already-cached fingerprints.
- Titles with no cached fingerprint are a no-op, never a blocking fetch.

## GATES — actual exit codes

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npx vitest run` (full) | exit 0 — **4867 passed, 24 skipped, 0 failed** |
| canonical 20k health probe | media 0.2% · request 0% · date 0% · count 0.1% — unchanged from main |
| frozen corpus `layerBext` | **P0 635/635 · P1 515/515 · 0 failures** · 0 corpus files changed |
| `npm run build` | exit 0 |

No corpus, oracle, or seed file was touched.

## WHAT WAS DELIBERATELY NOT DONE

Per the work order: no diversity memory, no critic personalities, no Verdict
Room redesign. Those wait until Taste DNA is proven to affect production
recommendations.

## NEXT ACTION

Owner decision. The branch is pushed and complete; no merge authorization has
been given for Phase 1. To prove the phase in production the merged SHA must
serve Ask and a signed-in account with DNA on file must receive a measurably
different order than a signed-out request for the same query.
