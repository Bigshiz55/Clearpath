# ADR-006 — Learning value as first-class, and the multi-constraint CEO portfolio

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** Founder + CTO + CDS mandate
- **Related:** ADR-002 (ΔEV), ADR-004 (reversibility), ADR-005 (classes), `docs/DECISION_ENGINE.md §11–12`

## Context

Two gaps remain. (1) The engine ranks on ΔEV, but sometimes the best move is the
one that *teaches us the most* — information that improves every future decision.
The preview already carries `strategicUncertaintyResolved`; it must become a
measurable, dollar-denominated property. (2) "Maximize EV" is the wrong objective;
the CEO must maximize **long-term company value** across several scarce resources,
not just expected cash.

## Decision

### 1. Learning value is expected value of information (EVOI), in dollars

```
LearningValue(d) = Σ over future decisions f whose choice depends on what d reveals:
                     P(d's result flips f) × |ΔEV swing between f's options| × time_discount
```

It is **decision-relevant**: learning only has value if it would change a future
action. "Interesting but inert" information scores **zero**. This VOI discipline is
what stops vanity experiments. Class D decisions (ADR-005) are ranked primarily on
this; a negative direct ΔEV is acceptable when LearningValue clears the cost (the
Meta paid test is the canonical case — see `docs/DECISION_LEDGER_MOCK.md §3.5`).

### 2. Learning value ADDS to EV without double counting

```
TotalValue(d) = riskAdjEV(d) + LearningValue(d) + optionValue(d) + strategicValue(d)
```

`riskAdjEV` is direct cash impact (ADR-002/004). `LearningValue` is the *additional*
value from what the outcome teaches about **other** decisions — a disjoint stream,
so adding them is not double counting. `optionValue` (ADR-004) is the value of a
cheap abort. `strategicValue` captures durability/compounding/long-horizon worth.

### 3. Growth Science recalibrates beliefs after every experiment

Beliefs are versioned **distributions** over key parameters (KPI-graph edges, LTV,
free-to-paid anchor, play base-rates, per-channel CAC). The loop:

```
prior(θ) ──▶ design experiment powered to shrink var(θ) ──▶ measure
        ──▶ Bayesian posterior(θ) ──▶ propagate to KPI-node values (re-price ledger)
        ──▶ update play base-rates, class reference-priors, exec credibility,
            and the calibration curve (predicted vs realized) ──▶ record verdict
            (worked / failed / inconclusive / never_repeat)
```

Realized learning value = (posterior variance reduction × downstream EV-at-stake).
Comparing it to the *predicted* learning value is itself a calibration signal that
sharpens future EVOI estimates.

### 4. The CEO portfolio maximizes long-term value under multiple constraints

**Objective (per cycle, choose subset S):**

```
maximize  Σ_{d∈S} TotalValue(d)
subject to:
  Σ cash_cost        ≤ cash budget
  Σ eng_days         ≤ engineering capacity
  Σ founder_attention ≤ founder capacity          (approvals + reviews cost this)
  Σ irreversible_risk ≤ risk budget               (cap concurrent one-way doors)
  dependencies satisfied (topological order)
  funnel diversification (don't stack all bets on one constraint)
  RESERVE an explore quota for Class C/D           (protect learning from starvation)
  horizon blend: weight durable/strategic value, not just this-quarter ΔEV
```

**Do not simply maximize EV.** The explore reserve, the learning-value term, and the
strategic/durability weighting are what turn "maximize EV" into "maximize long-term
company value."

## Consequences

- **Positive:** the system can correctly choose a negative-EV experiment when its
  EVOI is high, and it protects a learning budget instead of always exploiting.
- **Positive:** founder attention and reversibility become real allocation inputs,
  matching how the company is actually constrained.
- **Cost / over-engineering guard:** implement as **one composite scalar**
  (riskAdjEV + LearningValue + optionValue + strategicValue) + **three hard
  constraints** (founder attention, eng capacity, irreversible-risk cap) + **one
  reserve** (explore quota). Cash rarely binds at this scale; time-horizon folds
  into strategicValue. **No multi-objective/Pareto solver** — a greedy knapsack with
  guardrails is correct for a 4-seat company. Weights are Growth-Science-tunable
  parameters, not frozen constants.

## Alternatives considered

- *Pure EV maximization.* Rejected: starves learning, over-exploits a stale optimum.
- *Full multi-objective optimizer over 8 axes.* Rejected as over-engineering; collapse
  to one scalar + a few constraints until scale justifies more.
