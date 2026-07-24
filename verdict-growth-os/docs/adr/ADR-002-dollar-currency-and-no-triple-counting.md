# ADR-002 — One dollar-denominated currency (ΔEV) and no triple-counting

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** Founder + CTO + (Chief Data Scientist mandate)
- **Related:** ADR-001, `docs/DECISION_ENGINE.md §2–3`, `docs/DECISION_LEDGER_MOCK.md`

## Context

To rank all work on one axis (ADR-001), we need a common unit. Candidates:
a 0–100 heuristic score, a weighted multi-factor index, or money. We also need to
avoid a specific, seductive error: **counting acquisition lift, activation lift,
and revenue lift as three separate benefits when they describe the same
downstream dollars.** A new signup, its activation, and its eventual subscription
are the *same* future revenue observed at different funnel depths and times.

## Decision

### 1. The currency is dollars: **ΔEV** (expected incremental value)

Every Decision is priced as risk- and time-adjusted expected incremental revenue.
A 0–100 score has no principled unit and cannot be compared to a $600 ad spend;
dollars can. This also ties the whole system directly to the business goal.

### 2. Value flows through a **KPI Value Graph**; you value the ONE node moved

```
P(subscribe | node) = (∏ forward conversion rates node → return_visit) × free_to_paid_anchor
value(node)         = P(subscribe | node) × LTV
```

`value(node)` already contains *all* downstream conversion to a paying
subscriber. Therefore:

> **Rule: value a change at the single node it moves. Never add the downstream
> steps back in.**

A funnel fix at `dna_completed` is valued once, at `value(dna_completed)`, which
already includes the signup→…→subscription path below it. You do **not** also add
"acquisition value" and "revenue value" on top.

### 3. Revenue / retention / acquisition are a **partition**, not a sum

The three "impact" figures every Decision reports are a **partition of the single
ΔEV by pathway** (fractions that sum to 1, so the dollar views sum to ΔEV).
They are lenses on one number, provided for interpretability. The ledger asserts
`acquisitionView + retentionView + revenueView == ΔEV` — enforced in
`ledger.test.ts` ("NEVER double counts"). It is structurally impossible to
over-count because we partition a single quantity rather than summing three
independent estimates.

### 4. Three cases, explicit uncertainty

Each Decision carries **conservative / base / optimistic** ΔEV plus a separate
`confidence`. Point estimates invite false precision; the band + confidence feed
the explore/exploit policy.

### 5. Excluded from ΔEV on purpose

Option value (PR domain authority, channel-learning from a paid test) is **not**
folded into ΔEV — it would be double-speak to call "information" revenue. It is
handled by the **explore budget** and a separate `strategicUncertaintyResolved`
value-of-information score, so exploratory bets are neither hidden nor inflated.

## Consequences

- **Positive:** a Reddit reply, an onboarding fix, and a pricing change sit on one
  comparable axis; the CEO question "which creates the most company value?" is a
  computation. The concrete WV proof is in `docs/DECISION_LEDGER_MOCK.md`.
- **Positive:** anti-double-count is an invariant with a test, not a guideline.
- **Risk / weakness:** all magnitudes are dominated by two calibrated inputs — the
  `free_to_paid_anchor` and `LTV`. These belong to Growth Science and must be
  recalibrated from real data; until then only *relative ranking* is trustworthy,
  not absolute dollars. Documented in the mock's "risks" section.
- **Risk:** the graph is linear and static; it ignores interaction effects (fixing
  activation raises the value of every acquisition play). Phase 2+ recomputes node
  values after each measured change, so the ledger re-ranks as reality shifts.

## Alternatives considered

- *0–100 composite score.* Rejected: no unit, not comparable to cost, invites
  triple-counting via weighted factors.
- *Sum revenue+growth+retention estimates.* Rejected: that IS the triple-count.
