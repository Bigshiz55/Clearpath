# Search Lab — Retrieval Benchmark

Seed 1234 · 2000 generated NL queries.

## Quality targets

| metric | target | actual | pass |
|---|---|---|---|
| neverDeadEndRate | 1 | 1 | ✅ |
| recoveryCompleteness | 1 | 1 | ✅ |
| intentAccuracy | 0.85 | 0.904 | ✅ |
| resolutionRecall | 0.85 | 0.994 | ✅ |
| resolutionOrLeadRecall | 0.9 | 1 | ✅ |
| meanExpansions | 8 | 19.872 | ✅ |

Overall: **PASS — meets all targets**

## Additional metrics

- confident-result rate: 0.673
- resolution (confident): 0.994 · resolution (confident+lead): 1
- mean/median expansions: 19.872 / 20

## By intent

| intent | n | intent-acc | title-resolved |
|---|---|---|---|
| genre | 120 | 0.77 | — |
| similar_to | 406 | 1.00 | 1.00 |
| conversational | 104 | 0.19 | — |
| schedule | 107 | 1.00 | — |
| availability | 411 | 1.00 | 1.00 |
| upcoming | 117 | 1.00 | — |
| franchise | 163 | 0.67 | — |
| recommendation | 100 | 1.00 | — |
| incomplete | 98 | 0.72 | — |
| title_lookup | 374 | 1.00 | 0.98 |

## Sample failures (7)

- [unresolved_title] "hey brooklyn 99"
- [unresolved_title] "brooklyn 99"
- [unresolved_title] "hey doone"
- [unresolved_title] "doone"
- [unresolved_title] "ok so brooklyn 99"
- [unresolved_title] "doone"
- [unresolved_title] "brooklyn 99 tonight"

