# P0-H — SCORE COMPRESSION: MEASUREMENT, ROOT CAUSE, CALIBRATION DECISION

Harness: `scripts/measure/scoreDistribution.ts` (read-only, seeded, no network,
no database, no production data). Machine-readable output:
`artifacts/measure/score-distribution.json`.

It drives the REAL pure seam — `personalSignal` + `dimensionMatch`, the same
functions `personalRanking` calls — over candidate fields whose base-score
distributions are taken from OBSERVED production shapes, across five
behavioural taste profiles and twelve scenarios (60 cells per condition).

## THE QUESTION

`PERSONAL_NUDGE_CEILING` is 18. One production sample showed a 24-title
thriller field spanning 17 points. If that were typical, personalization could
reorder an entire field rather than break ties — a replacement ranker, not a
preference.

## MEASURED — BEFORE ANY CHANGE

| condition | base spread (median) | base stddev | \|nudge\| max | rank change | top-1 changed | no evidence | widest base gap crossed |
|---|---|---|---|---|---|---|---|
| full coverage, 40 ratings | 18 | 4.71 | 8 | 75.0% | 33% | 0% | 7 |
| 50% coverage, 40 ratings | 19 | 5.29 | 7 | 72.5% | 47% | **61.2%** | 7 |
| full coverage, **3 ratings** | 18 | 4.71 | **8** | **75.0%** | **33%** | 0% | 7 |
| no DNA | 18 | 4.71 | 0 | 0.0% | 0% | 100% | 0 |

## ROOT CAUSE

**Base scores are genuinely compressed** — median spread 18, stddev 4.7. That
part of the original suspicion is confirmed.

**But the ceiling was never the binding constraint.** Two measurements say so:

1. The **widest base gap a weaker title ever crossed was 7 points**, against a
   cap of 18. The dimension channel alone can only reach ±8 (`DIM_NUDGE_MAX`);
   the full 18 requires the explicit-preference channel to fire as well.
2. The no-DNA condition reorders **nothing** — the transform is inert without
   evidence, exactly as designed.

**The actual defect the measurement found is confidence-insensitivity.** The
`3 ratings` and `40 ratings` rows above are **byte-identical** — same rank-change
rate, same top-1 rate, same nudge spread. `profile.samples` was consulted only
as a binary gate (`samples > 0`), so a profile built from ONE rating moved a
title exactly as far as one built from four hundred.

The secondary finding is **coverage**: at 50% fingerprint coverage, **61.2%** of
candidates receive no personalization at all. Coverage, not magnitude, is what
limits personalization in practice.

## CALIBRATION DECISION

**The ceiling stays at 18. It was not the problem, and raising or lowering it
would have addressed nothing the data shows.**

The evidence-supported change is to make the fingerprint channel
**confidence-sensitive**: a linear ramp on rated-title count to
`FULL_CONFIDENCE_SAMPLES = 20`. The explicit-preference channel is deliberately
NOT scaled — a preference the reader stated outright is not a statistical
estimate awaiting more samples.

### MEASURED — AFTER

| condition | \|nudge\| max | rank change | top-1 changed | weaker-overtook-stronger |
|---|---|---|---|---|
| full coverage, 40 ratings | 8 → **8** | 75.0% → **75.0%** | 33% → **33%** | 266.5 → **266.5** |
| full coverage, **3 ratings** | 8 → **1** | 75.0% → **29.2%** | 33% → **8%** | 266.5 → **0** |

A first-session profile no longer reorders a field as hard as a long-established
one. An established reader is exactly where they were.

## NOT DONE, AND WHY

Coverage (61.2% of titles with no fingerprint at 50% coverage) is the larger
remaining lever, and it is a **backfill/ingest** problem — classify more titles —
not a scoring one. Raising the nudge to compensate for missing evidence would be
the exact mistake this measurement exists to prevent.
