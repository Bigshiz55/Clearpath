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

---

# Phase 2 — what was built, and what it measured

Blocker 3 and both secondaries are done. Blocker 1 and Blocker 2 are not, and
are the top two items in `BACKLOG.md`'s **Next**.

| | before | after |
|---|---|---|
| Evidence types captured | 1 of 8 | **3** (choice · reason · appetite) |
| Interaction types on screen | 1 | **3** + a fourth verdict (`Both`) |
| Cross-session exposure memory | none | queue with release |
| Repeats in session 2 (measured) | **38 / 40** | **0 / 40** |
| Canonical write path callers | **0** | 1 (completed `dna` runs) |
| Verdicts the server action accepts | 3 of 4 | 4 of 4 |

## Three defects found while building, none of them the thing being built

**The canonical write path had no caller.** `recordShowdownSession` is a
validated server action that writes `preference_events`, and `grep` found it
referenced only by a doc comment and a test. Every claim about Showdown
reaching the ranker was true of the pure chain and false of the running app.

**`both` was unrepresentable end to end.** The verdict has existed in the engine
since the ledger split. `decisionToEvents` had no branch for it — it fell
through `verdict === 'left' ? left : right` and filed "I want both of these" as
a vote for whichever poster happened to be on the right. The server action's zod
enum omitted it too, so a single `both` in a run would have failed `safeParse`
and discarded **every** decision in that session. Both are invisible for exactly
as long as no control can produce the verdict, which is why adding the button is
what would have shipped them.

**`seenTitleIds` conflated two different things.** It holds both the suppression
list a session is seeded with and the titles it actually showed. Feeding the
whole thing back to the durable history re-stamps every *avoided* title as
freshly seen, so the oldest exposures could never age out and the release policy
would silently never release. Found by a failing test, fixed with
`carriedTitleIds` in the engine rather than by adjusting the test.

## The two invariants worth stating

**A reason tops up; it does not add.** A confounded pick plus a stated reason
equals exactly what a clean single-axis matchup would have paid on that axis —
`already + topUp === REASON_CEILING`. Adding full strength on top would let a
four-axis guess plus one tap outweigh a genuinely clean comparison, inverting
the ordering `attribution.ts` exists to produce. Negative control: making it
additive fails two tests.

**An appetite lands only on the agreed axes.** The comparison already spoke for
every axis the pair split on; the appetite records only where they agreed. The
two evidence types cannot double-count because their domains are disjoint by
construction, not because a weight was tuned.

## Costs stated plainly

- Six of twenty rounds may be interrupted, never two running. Follow-ups are the
  highest-quality evidence per second, and asking always would take the run past
  three minutes — evidence from a session nobody finishes is worth nothing.
- The exposure reserve keeps half the catalogue dealable. With 113 titles and 40
  exposures per session that means sessions 1 and 2 never repeat, and session 3
  can re-meet ~23 titles from session 1. Total suppression would fix the repeat
  and empty the pool during session 3; the reserve is the trade, and pool
  expansion is what actually removes it.
- A stated reason moves the canonical grade by one rung
  (`maybe_interested → interested`) and never to `must_watch`. It removes the
  confounding penalty, which is what it earns; only the player saying "I'm
  watching that tonight" reaches the top rung.
