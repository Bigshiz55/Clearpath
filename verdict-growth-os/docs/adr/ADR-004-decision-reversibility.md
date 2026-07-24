# ADR-004 — Decision reversibility drives prioritization (one-way vs two-way doors)

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** Founder + CTO + CDS mandate
- **Related:** ADR-002 (ΔEV), ADR-005 (classes), ADR-006 (learning value), `docs/DECISION_ENGINE.md §9`

## Context

v1 stored `reversibility` as a flat field with a fixed risk penalty. That wastes
its real signal. Reversibility is the cheapest risk control a startup has: a
two-way-door decision can be made fast on thin evidence because being wrong is
cheap to undo; a one-way-door decision can sink the company. The engine must let
reversibility *change the ranking*, not just annotate it.

## Decision

### 1. Four reversibility levels backed by a continuous `cost_to_reverse`

`easy_to_reverse` · `moderate_cost` · `difficult` · `nearly_irreversible`.
The label is a UX bucket over a continuous `cost_to_reverse_usd` (plus a
`time_to_reverse`). Examples: flag flip / copy test = easy; shipped UI = moderate;
public price change / partnership = difficult; data deletion / sent email blast /
brand repositioning = nearly irreversible.

### 2. Reversibility enters the value function three ways

```
downsideRisk(d)   = P(bad_outcome) × cost_to_reverse
riskAdjEV(d)      = EV_base × confidence − downsideRisk(d)          ← irreversible costs more
optionValue(d)    = uncertainty × upsideRetained × (1 − reverseFriction)
                    (a reversible + uncertain action is a cheap CALL OPTION:
                     bounded downside, keep the upside — positive option value;
                     an irreversible bet has ~zero or negative option value)
```

So for two actions with equal EV, the **more reversible one ranks higher** — lower
downside penalty *and* a positive option-value bonus.

### 3. Reversibility sets the evidence & approval bar (via Decision Classes, ADR-005)

Reversible → low evidence bar, can be auto-safe. Irreversible → high evidence bar,
mandatory approval, treated as Class A.

### 4. A portfolio-level cap on irreversible bets

The allocator caps concurrent irreversible/high-`cost_to_reverse` decisions under a
**risk budget**, while allowing many reversible bets in parallel. This is a hard
constraint, not a penalty.

## Consequences

- **Positive:** the system structurally prefers fast, cheap, reversible experiments
  and is appropriately cautious on one-way doors — the correct startup instinct,
  encoded. Throughput of learning rises because reversible actions clear a low bar.
- **Positive:** `optionValue` gives a principled reason to try reversible-uncertain
  things that a pure-EV ranker would reject.
- **Cost:** two new decision columns (`cost_to_reverse_usd`, `prob_bad_outcome`) and
  one portfolio constraint. No new subsystem.
- **Risk:** `P(bad_outcome)` and `cost_to_reverse` are estimates; Growth Science
  calibrates them from measured reversals over time.

## Alternatives considered

- *Keep the flat penalty.* Rejected: ignores option value and can't cap one-way doors.
- *Block all irreversible actions.* Rejected: some (a deliberate pricing move) are
  correct; the answer is a higher evidence bar + approval + a risk cap, not a ban.
