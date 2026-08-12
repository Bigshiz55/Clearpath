# Showdown V3 — Phase 1 audit

Measured on `claude/showdown-cold-start-scanner` @ `018db0b`, against production
`6080287`. Every number here was read from the running system or the source, not
estimated.

## Current state

| | measured |
|---|---|
| Diagnostic titles | **113** (46 in production) |
| Trait axes | **44** |
| `title_dimensions` coverage | **31/46 = 67%** in production |
| Poster resolution | 45/46 |
| Interaction modes | **1** (head-to-head) |
| Evidence types captured | **1 of 8** (choice only) |
| Cross-session exposure memory | **none** |
| Recommendations source | the diagnostic pool itself |
| Rounds / exposures | 20 / 40 unique |
| Session-1 confidence → rank nudge | 0.336 → **+3.0** |

## Why the experience feels shallow

Three structural causes, in order of severity. None is a polish problem.

### BLOCKER 1 — the rich fingerprint never reaches the recommender

Showdown reasons in **44 `TraitKey` axes**. The ranker reasons in **15
`DIMENSION_KEYS`** (`pacing darkness warmth humor suspense emotion complexity
realism character stakes morality violence attention serialized romance`).

```
grep -rn "TraitKey" src/lib/preference/*.ts src/lib/dna.ts → 0 matches
```

There is **no bridge**. `preferenceNudge` matches a user's beliefs against
`title.dims`, which come from `title_dimensions` — so the only Showdown output
that survives the crossing is *which title was picked*, re-expressed in the
15-axis vocabulary by a classifier that never saw the comparison.

Everything that makes Showdown's model interesting — `weirdness`, `ambiguity`,
`characterFocus`, `sentimentality`, `cynicism`, `episodic`, `subtitles`,
`horrorTolerance` — is **invisible downstream**. The engine learns that someone
wants the uncanny rather than the merely grim, and then hands the ranker a
thumbs-up on a title.

This is the root cause. A richer game on top of this bridge produces a richer
*results screen* and identical recommendations.

**Architectural fix:** either (a) a verified `TraitKey → DIMENSION_KEYS`
projection with per-axis confidence carried through, or (b) extend
`title_dimensions` to carry the texture axes and classify against them. (b) is
correct and expensive; (a) is tractable and lossy. Neither is a small change,
and inventing an unverified mapping is how the `lineup_id` class of defect
happens.

### BLOCKER 2 — the recommendation payoff is the diagnostic pool

`ShowdownResults.tsx:36` ranks `[...TITLES]` — the 113 diagnostic titles — by
`predictedAppeal`. It does not call `rankByDna`. So the payoff can only ever
recommend films from the same small pool the player was just quizzed on, scored
by Showdown's private model rather than the product's ranking pipeline.

This is §24's *"the recommendation payoff uses fixtures"* condition, already
true today.

**Architectural fix:** results must call the real ranking path. The permanent
write already goes through `recordEvents` correctly; the read side was never
connected.

### BLOCKER 3 — one evidence type out of eight

`ShowdownDecision` records `{leftId, rightId, verdict, testing, gain, at,
responseMs}`. That is **choice evidence** and nothing else — no reason, no
intensity, no familiarity, no attraction, no rejection, no tradeoff.

This is why a binary pick is ambiguous, and the ambiguity is structural rather
than statistical. Choosing *Silence of the Lambs* over *Lord of the Rings*
currently writes evidence across every axis the pair splits, attenuated by
attribution. Attribution correctly reduces confidence in a confounded
observation — but it cannot **disambiguate** one, because the information
needed was never collected. Only asking resolves it.

**Architectural fix:** the evidence grammar in §2, with reason chips generated
from the actual pair difference. This is the single highest-value change in the
whole brief.

### Secondary: exposure memory does not exist

`StoredDna.usedTitleIds` is declared, initialised to `[]` at
`Showdown.tsx:80`, and **never written or read**. `seenTitleIds` is
session-scoped. A returning player can be dealt the same titles again — the
no-repeat invariant holds *within* a session only.

### Secondary: coverage will not scale as-is

67% coverage on 46 titles. The brief asks for 250–300. Generation runs through
`/api/cron/classify` at 20 titles/run via gpt-4o-mini, so a 300-title pool is
~15 cron runs before the chain is live, and §24 makes insufficient coverage a
stop condition. The mechanism exists and is correct; the lead time is real and
must be started before the pool lands, not after.

## What is already correct and must be preserved

- Canonical `PreferenceEvent` recording through `recordEvents` — one log, one engine
- Permanent vs session separation, enforced by type and proved by negative control
- Attribution-weighted evidence (clean single-axis > confounded multi-axis)
- The three-phase adaptive scanner (sweep → hypothesis → resolve), with measured
  divergence between opposed personas
- The absolute in-session no-repeat invariant
- 390×844 geometry: no overflow either axis, no control under 44px (measured)

## Recommended phase order

Different from the brief's, because Phase 1 changed what the dependencies are:

1. **Blocker 1** — the projection. Nothing downstream improves until this exists.
2. **Blocker 3** — evidence grammar + pair-difference reason engine.
3. **Blocker 2** — real ranking payoff.
4. Pool expansion to 250–300, with classification started in parallel from day one.
5. Interaction modes, exposure memory, premium UI, result synthesis.

Building the UI first would produce a beautiful surface over a model that
cannot express itself to the recommender — which is §24's *"visual polish hides
shallow evidence"*.
