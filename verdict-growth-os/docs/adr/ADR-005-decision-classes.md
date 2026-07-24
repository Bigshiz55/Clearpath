# ADR-005 — Four decision classes with default governance policies

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** Founder + CTO
- **Related:** ADR-004 (reversibility), ADR-006 (learning value), `docs/DECISION_ENGINE.md §10`

## Context

Not all decisions deserve the same evidence, approval, or patience. Treating a
copy A/B like a pricing overhaul wastes founder attention and slows the cheap
stuff; treating a strategic bet like an experiment is dangerous. We need a small,
data-driven governance shortcut so the engine and humans don't re-litigate
process on every decision.

## Decision

Tag every Decision with one of four **classes**, each carrying a default policy
(stored in a `decision_class_policies` table — governance is data, not code):

| Property | **A · Strategic** | **B · Product** | **C · Growth experiment** | **D · Learning investment** |
| --- | --- | --- | --- | --- |
| Typical example | pricing model, positioning, big bet | onboarding/rec-quality fix | TikTok/Meta/creator test | instrumentation, holdout, value-model calibration |
| Reversibility (typical) | difficult / irreversible | reversible (deploy+rollback) | reversible / partial | reversible |
| **Approval** | founder + owning exec, mandatory | deployment approval | budget + channel approval | lightweight (internal) |
| **Evidence required** | high (memo + data + Growth Science review) | medium (metric + hypothesis) | low (a hypothesis — the point is to learn) | low (a clear question) |
| **Acceptable uncertainty** | low | medium | high | very high (uncertainty is the target) |
| **Review cadence** | quarterly / milestone | per release | weekly | per experiment |
| **Rollback expectation** | pre-agreed exit criteria; hard to unwind | ship-behind-flag, roll back on guardrail breach | kill on no-signal | archive learning; nothing to roll back |
| **Measurement period** | 1–2 quarters | 2–6 weeks | 1–2 weeks | until the belief converges |
| **Ranked primarily on** | risk-adj EV + strategic value | risk-adj EV | risk-adj EV + learning value | **learning value** (EV≈0 by design) |

Rules:
- **Class is largely implied by reversibility + primary value source**, so it's
  cheap to assign and hard to game (an irreversible action cannot be filed as a
  Class-C experiment to dodge approval).
- Policies are **defaults**, overridable per decision with a logged reason.
- Class D formalizes "sometimes the best investment teaches the most" (ADR-006):
  it is judged on learning value, and a near-zero direct EV is expected, not a flaw.

## Consequences

- **Positive:** governance is proportional; founder attention is spent on Class A/B,
  not on every experiment. Approval defaults are consistent and auditable.
- **Positive:** the explore quota (ADR-006) maps cleanly to Class C + D capacity.
- **Cost:** one enum + one policy table. No per-class workflow engines — that would
  be over-engineering.
- **Invariant preserved:** default-deny still holds; classes set *how much* process,
  never *whether* an externally-visible action needs approval.

## Alternatives considered

- *No classes, per-decision governance.* Rejected: re-litigates process constantly,
  burns founder attention.
- *A richer taxonomy (8–10 types).* Rejected as over-engineering at a 4-seat scale;
  four classes cover the governance-distinct cases.
