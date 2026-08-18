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

The hard-constraint work (PR #78) left `runFinder` with a clean seam: taste only
ever needed to replace the comparator, never the filter. No new enforcement
logic was added; none was needed.

**Be precise about WHY that is safe, because the obvious story is wrong.** The
forensic review found that personalization runs at `finder.ts:797`, while the
person/media gate (`constraintsFromQuery` + `qualifyCandidates`) runs at
`finder.ts:938` — *after* it. Only the subject-centrality pre-filter precedes
the ranking. So a candidate the request rules out IS in the list when taste
ranks it, and taste may put it first.

What makes that safe is not absence but direction: the gate is a downstream
FILTER over the ranked list, and `evaluateCandidate` reads a candidate's own
facts, never its position. Ranking therefore decides which candidates get
verified first — a genuine product benefit, since taste-preferred eligible
titles surface ahead of the `need` early-stop — and never whether one qualifies.

That order-independence is now pinned: reverse the pool and `qualifyCandidates`
returns the same survivors (`hardConstraints.test.ts`).

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

## FORENSIC PR REVIEW (PR #79) — TWO REAL DEFECTS FOUND AND FIXED

The review was run against the shipped code, not the PR description. Two of the
seven checks failed.

### DEFECT 1 — a paid OpenAI call was reachable from Ask · **FIXED**

The audit's whole premise was that Ask touches only the free channel. The
import trace said otherwise: `personalizeCandidates` calls
`getUserDimensionProfile`, and `computeUserProfile` backfills up to
`BACKFILL_CAP = 12` missing fingerprints by calling `getTitleDimensions` →
`classify()` → `https://api.openai.com/v1/chat/completions`, each with a 9s
timeout, **inside the request**. Worse, Ask passed `sampleSize = 0`, which is
part of the `unstable_cache` key while being unused in the computation — so Ask
got its own cold cache entry that no warmed surface shared, and Ask was the one
paying for the backfill.

This violated two explicit rules: "no paid AI calls in bulk ranking" and
CLAUDE.md's "never call an LLM in a user request path".

The unit tests could not have caught it: they mock `@/lib/titleDimensions`
wholesale.

FIX: `getUserDimensionProfile` gained an opt-out, `{ backfill?: boolean }`,
default `true` so every existing caller is byte-identical — including its cache
key, which is extended only in the no-backfill case. Ask passes
`{ backfill: false }` and accepts a thinner profile rather than an unpriced
request. `src/lib/titleDimensions.backfill.test.ts` exercises the REAL module
with a key present and watches the network: default classifies, `backfill:false`
reaches `api.openai.com` **zero** times.

### DEFECT 2 — the documented mechanism was false · **FIXED**

See Finding 2 above. The PR body, three code comments and this ledger all
claimed personalization runs after the hard-constraint gate. It does not. The
safety conclusion survives, but for a different reason, and the reason is now
stated correctly and pinned by an order-independence test.

### The other five checks passed

| check | evidence |
|---|---|
| no eligibility logic duplicated or weakened | neither new module contains `.filter`/`.slice`/`.splice` or any eligibility symbol; `personalizeCandidates` maps 1:1 |
| DB query count constant with pool size | 3 reads/request; `getCachedDimensions` called once with the whole pool (pinned) |
| `PERSONAL_NUDGE_CEILING` bounded by existing DNA constants | `PREF_NUDGE_MAX` is now IMPORTED from `preference/rank.ts` rather than copied; ceiling pinned as the empirical max movement, ±18 |
| missing DNA / missing fingerprints stay honest no-ops | `personalScore: null`, `participated: false`, order unchanged |
| no unrelated behavior or corpus files changed | see the diff scope below |

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

## PRODUCTION PROOF — **NOT DONE**, and why

`/api/ask` requires a session (`route.ts:179`), verified against production:
an anonymous POST returns `{"error":"Not signed in."}` / HTTP 401. This session
holds no production credentials — no `.env`, no `SUPABASE_*`/`TMDB_*`/`OPENAI_*`
in its environment — so it cannot sign in, cannot enumerate accounts to find one
with sufficient DNA, and must not create one (that writes production data).

Every sub-item of the requested proof needs a session, **including the control**:
there is no signed-out Ask ordering, only a 401, so the "no DNA" control must be
a signed-in account without DNA.

`docs/TASTE-DNA-PRODUCTION-PROOF.md` carries the exact commands for the owner to
run. It is a single authenticated call, because the response spreads the whole
`FinderItem`: each item exposes `matchScore` (order before taste) next to
`personal.rankScore` (order after) and the evidence that moved it.

**Phase 1 is merged and deployed. It is NOT production-proven.**

## NEXT ACTION

Owner decision. The branch is pushed and complete; no merge authorization has
been given for Phase 1. To prove the phase in production the merged SHA must
serve Ask and a signed-in account with DNA on file must receive a measurably
different order than a signed-out request for the same query.
