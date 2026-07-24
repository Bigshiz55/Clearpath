# ΔEV Decision Ledger — WatchVerdict (DEMONSTRATION MOCK)

> ⚠️ **DEMONSTRATION DATA.** Every number here is computed by the labeled preview
> engine `src/lib/decision-preview/*` from the **seed** WatchVerdict funnel
> (`isDemo = true`). It exists to prove the system can rank the highest-value
> action **before** any real integration is built. It is **not** production
> truth. Regenerate with `PRINT_LEDGER=1 npm test`; the ranking is locked by
> `ledger.test.ts`.

Purpose — answer the two company questions with one comparable currency:
1. Where is WatchVerdict losing the most company value?
2. What is the cheapest credible way to acquire the next qualified, retained user?

---

## 1. The KPI Value Graph (how upstream movement becomes one dollar figure)

Derived from the seed funnel; monetization anchored on the seed free-to-paid rate
(**4.1%**) and **LTV = $14.20**. Each node's value = `P(subscribe | node) × LTV`.

| Node | P(subscribe \| node) | Value of 1 incremental unit | Monthly volume |
| --- | ---: | ---: | ---: |
| signup | 0.002851 | **$0.0405** | 1,294 |
| dna_started | 0.004081 | **$0.0579** | 904 |
| dna_completed | 0.009954 | **$0.1413** | 371 |
| first_verdict | 0.011876 | **$0.1686** | 311 |
| successful_recommendation | 0.019348 | **$0.2747** | 191 |
| return_visit | 0.041000 | **$0.5822** | 90 |
| subscription | 1.000000 | **$14.2000** | — |

**Worked example (no double counting).** Fixing the DNA leak moves `dna_completed`.
The population entering that edge is `dna_started` = 904/mo. A +0.14 completion lift
adds `904 × 0.14 = 126.6` completions/mo, each worth `value(dna_completed) = $0.1413`
(which *already* contains the full signup→…→subscription path below it). Annualized
with a 0.9 durability factor:
`904 × 0.14 × 0.1413 × 12 × 0.9 ≈ $193`. We value it **once, at the node it moves** —
we never also add "acquisition value" or "revenue value" on top. The revenue /
retention / acquisition figures in the ledger are a **partition** of that $193, not
additions to it.

---

## 2. The ledger — 10 competing actions, one axis

Ranked by base-case ΔEV. Product = **WatchVerdict** for all. "Impact views" are a
partition of base ΔEV (they sum to it — see ADR-002).

### #1 — Fix DNA activation leak  ·  ΔEV(base) **$193.19**
| Field | Value | Field | Value |
| --- | --- | --- | --- |
| Executive sponsor | **CPO** | KPI affected | DNA completion rate |
| Baseline KPI | 41% | Expected lift | → 55% (+0.14) |
| Population affected | 904 dna-starts/mo | Cost (cash) | $0 |
| Engineering effort | 3 eng-days | Time to impact | 2 weeks |
| Confidence | 0.70 | Risk | low |
| Reversibility | reversible (A/B) | Approval | **Yes — production deployment** |
| Dependencies | none | Opportunity cost | ≈ $92 (displaces rec-quality fix in eng capacity) |
| **Revenue view** | $135.23 | **Retention view** | $57.96 |
| **Acquisition view** | $0.00 | | |
| Conservative | $96.60 | Optimistic | $275.99 |

### #2 — Improve pricing or packaging  ·  ΔEV(base) **$100.55**
| Field | Value | Field | Value |
| --- | --- | --- | --- |
| Executive sponsor | **CRO** | KPI affected | Free→paid (monetization multiplier) |
| Baseline KPI | 4.1% free-to-paid | Expected lift | ~+17% relative (→ ~4.8%) |
| Population affected | 1,294 signups/mo | Cost (cash) | $0 |
| Engineering effort | 0 eng-days | Time to impact | 1 week |
| Confidence | 0.50 | Risk | medium (can depress conversion) |
| Reversibility | reversible | Approval | **Yes — pricing change** |
| Dependencies | none | Opportunity cost | ≈ $84 (vs retention messaging, the next 0-eng play) |
| **Revenue view** | $100.55 | **Retention view** | $0.00 |
| **Acquisition view** | $0.00 | | |
| Conservative | $41.89 | Optimistic | $157.10 |

### #3 — Fix a recommendation-quality issue  ·  ΔEV(base) **$92.28**
| Field | Value | Field | Value |
| --- | --- | --- | --- |
| Executive sponsor | **CPO** | KPI affected | Successful-recommendation rate |
| Baseline KPI | 62% | Expected lift | → 72% (+0.10) |
| Population affected | 311 first-verdicts/mo | Cost (cash) | $0 |
| Engineering effort | 4 eng-days | Time to impact | 3 weeks |
| Confidence | 0.60 | Risk | low |
| Reversibility | reversible | Approval | **Yes — production deployment** |
| Dependencies | none | Opportunity cost | ≈ $193 (displaces the DNA fix if only one eng project) |
| **Revenue view** | $50.75 | **Retention view** | $41.53 |
| **Acquisition view** | $0.00 | | |
| Conservative | $46.14 | Optimistic | $138.42 |

### #4 — Improve retention messaging  ·  ΔEV(base) **$84.07**
| Field | Value | Field | Value |
| --- | --- | --- | --- |
| Executive sponsor | **CCO** | KPI affected | Return-visit rate |
| Baseline KPI | 45% | Expected lift | → 52% (+0.07) |
| Population affected | 191 successful-recs/mo | Cost (cash) | $0 |
| Engineering effort | 0 eng-days | Time to impact | 1 week |
| Confidence | 0.55 | Risk | low |
| Reversibility | reversible | Approval | **Yes — customer email** |
| Dependencies | none | Opportunity cost | ≈ $101 (vs pricing, the top 0-eng play) |
| **Revenue view** | $21.02 | **Retention view** | $63.05 |
| **Acquisition view** | $0.00 | | |
| Conservative | $42.03 | Optimistic | $144.12 |

### #5 — Improve onboarding completion  ·  ΔEV(base) **$80.98**
| Field | Value | Field | Value |
| --- | --- | --- | --- |
| Executive sponsor | **CPO** | KPI affected | Signup→DNA-start rate |
| Baseline KPI | 70% | Expected lift | → 80% (+0.10) |
| Population affected | 1,294 signups/mo | Cost (cash) | $0 |
| Engineering effort | 2 eng-days | Time to impact | 2 weeks |
| Confidence | 0.65 | Risk | low |
| Reversibility | reversible | Approval | **Yes — production deployment** |
| Dependencies | **overlaps the DNA fix (non-additive)** | Opportunity cost | ≈ $193 (shares activation surface with #1) |
| **Revenue view** | $60.74 | **Retention view** | $20.25 |
| **Acquisition view** | $0.00 | | |
| Conservative | $40.49 | Optimistic | $121.47 |

### #6 — Pursue a creator partnership  ·  ΔEV(base) **$20.24**
| Field | Value | Field | Value |
| --- | --- | --- | --- |
| Executive sponsor | **CPRO** | KPI affected | Incremental signups (one-shot) |
| Baseline KPI | n/a (new volume) | Expected lift | +500 signups |
| Population affected | 500 signups | Cost (cash) | $400 |
| Engineering effort | 0 | Time to impact | 3 weeks |
| Confidence | 0.40 | Risk | medium |
| Reversibility | partial | Approval | **Yes — influencer outreach** |
| Dependencies | none | Opportunity cost | ≈ $101 (vs pricing) + $400 cash |
| **Acquisition view** | $20.24 | Revenue/Retention | $0.00 |
| Conservative | $8.10 | Optimistic | $48.58 |

### #7 — Launch a TikTok campaign  ·  ΔEV(base) **$12.15**
| Field | Value | Field | Value |
| --- | --- | --- | --- |
| Executive sponsor | **CMO** | KPI affected | Incremental signups (one-shot) |
| Baseline KPI | n/a | Expected lift | +300 signups (opt. 1,500 on virality) |
| Population affected | 300 signups | Cost (cash) | $500 |
| Engineering effort | 0 | Time to impact | 1 week |
| Confidence | 0.35 | Risk | medium |
| Reversibility | partial | Approval | **Yes — public social post** |
| Dependencies | none | Opportunity cost | ≈ $101 (vs pricing) + $500 cash |
| **Acquisition view** | $12.15 | Revenue/Retention | $0.00 |
| Conservative | $4.86 | Optimistic | $60.73 |

### #8 — Pursue a PR opportunity  ·  ΔEV(base) **$12.15**
| Field | Value | Field | Value |
| --- | --- | --- | --- |
| Executive sponsor | **CPRO** | KPI affected | Incremental signups (one-shot) |
| Baseline KPI | n/a | Expected lift | +300 signups |
| Population affected | 300 signups | Cost (cash) | $0 |
| Engineering effort | 0 | Time to impact | 3 weeks |
| Confidence | 0.35 | Risk | low |
| Reversibility | partial | Approval | **Yes — journalist outreach** |
| Dependencies | none | Opportunity cost | ≈ $101 (vs pricing); **excludes** backlink/SEO option value |
| **Acquisition view** | $12.15 | Revenue/Retention | $0.00 |
| Conservative | $4.05 | Optimistic | $32.39 |

### #9 — Start a Meta paid acquisition test  ·  ΔEV(base) **$7.85**
| Field | Value | Field | Value |
| --- | --- | --- | --- |
| Executive sponsor | **CGO** | KPI affected | Incremental signups via paid (one-shot) |
| Baseline KPI | n/a | Expected lift | +194 signups ($600 / $3.10 CAC) |
| Population affected | 194 signups | Cost (cash) | $600 |
| Engineering effort | 0 | Time to impact | 1 week |
| Confidence | 0.40 | Risk | medium |
| Reversibility | reversible | Approval | **Yes — paid campaign** |
| Dependencies | none | Opportunity cost | ≈ $101 + $600 cash; **but highest value-of-information** |
| **Acquisition view** | $7.85 | Revenue/Retention | $0.00 |
| Conservative | $4.86 | Optimistic | $10.53 |

### #10 — Build a referral loop  ·  ΔEV(base) **$3.15**
| Field | Value | Field | Value |
| --- | --- | --- | --- |
| Executive sponsor | **CGO** | KPI affected | Referral rate (k-factor) |
| Baseline KPI | 12% | Expected lift | → 20% (+0.08) |
| Population affected | 90 return-visits/mo | Cost (cash) | $0 |
| Engineering effort | 5 eng-days | Time to impact | 4 weeks |
| Confidence | 0.45 | Risk | low |
| Reversibility | reversible | Approval | No (internal feature) |
| Dependencies | **needs an activated/retained base first** | Opportunity cost | ≈ $193 (largest eng cost, smallest return) |
| **Acquisition view** | $3.15 | Revenue/Retention | $0.00 |
| Conservative | $1.57 | Optimistic | $5.90 |

### Summary ranking

| # | Action | Sponsor | Cons | **Base ΔEV** | Opt | Cash | Eng | Approval |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | Fix DNA activation leak | CPO | $96.60 | **$193.19** | $275.99 | $0 | 3d | deploy |
| 2 | Improve pricing / packaging | CRO | $41.89 | **$100.55** | $157.10 | $0 | 0 | pricing |
| 3 | Fix recommendation quality | CPO | $46.14 | **$92.28** | $138.42 | $0 | 4d | deploy |
| 4 | Improve retention messaging | CCO | $42.03 | **$84.07** | $144.12 | $0 | 0 | email |
| 5 | Improve onboarding completion | CPO | $40.49 | **$80.98** | $121.47 | $0 | 2d | deploy |
| 6 | Creator partnership | CPRO | $8.10 | **$20.24** | $48.58 | $400 | 0 | outreach |
| 7 | TikTok campaign | CMO | $4.86 | **$12.15** | $60.73 | $500 | 0 | social |
| 8 | PR opportunity | CPRO | $4.05 | **$12.15** | $32.39 | $0 | 0 | outreach |
| 9 | Meta paid test | CGO | $4.86 | **$7.85** | $10.53 | $600 | 0 | paid |
| 10 | Referral loop | CGO | $1.57 | **$3.15** | $5.90 | $0 | 5d | none |

---

## 3. CEO allocator output

### 1) If you do only ONE thing today
**Fix the DNA activation leak (CPO).** ΔEV **$193** (band $97–$276), $0 cash, 3
eng-days, reversible A/B. It is worth ~1.9× the next action and directly answers
**both** company questions: it is where the most value is leaking, *and* it is the
cheapest way to get the next qualified retained user — because it converts traffic
you have **already paid to acquire** instead of buying more.

### 2) Ranked top five
DNA fix ($193) → Pricing/packaging ($101) → Recommendation-quality fix ($92) →
Retention messaging ($84) → Onboarding completion ($81). Four of the five are $0
cash; the portfolio is deliberately weighted to the **activation + monetization**
constraint, not acquisition.

### 3) Best action under a low-cash constraint
**Fix the DNA activation leak.** Highest ΔEV of all the $0-cash actions. (In fact
the entire top five is executable on $0 cash — a cash shortage changes nothing
about today's plan.)

### 4) Best action under a low-engineering-capacity constraint
**Improve pricing / packaging (CRO)** — ΔEV $101 with **0 engineering days**.
Caveat: it needs pricing-change approval and carries conversion risk. If you want
zero-eng *and* low-risk, the runner-up is **retention messaging** ($84, 0 eng,
low risk, email approval).

### 5) Best action for fastest learning
**Start the Meta paid acquisition test (CGO).** Its *direct* ΔEV is negative
(−$592 net), so it loses the value race — but it has the **highest
value-of-information per unit time**: for $600 in one week it resolves the
dominant strategic unknown, *can paid acquisition ever scale for us?* This is the
**explore** pick, funded from the exploration budget, not the ΔEV ranking. Note
the deliberate split: the best thing to **do** (DNA fix) ≠ the best thing to
**learn from** (Meta test).

### 6) Best action for highest long-term expected value
**Fix the DNA activation leak.** It is a durable, foundational lift applied to
*every future cohort*, and it is the prerequisite that makes referral and paid
acquisition viable later (both are value-destructive until the funnel converts).
Honorable mentions: **pricing/packaging** is the best permanent monetization
*multiplier* (it raises LTV, which is what eventually makes paid CAC work), and a
**referral loop** is the best *compounding* play — but only once there is an
activated base to refer from.

### 7) Why each rejected action lost
- **Creator partnership ($20 vs $400 cash):** acquisition diluted by the funnel
  leak — 500 signups convert to <$21 of subscriber value today.
- **TikTok ($12 vs $500 cash):** same dilution; even the optimistic viral case
  ($61) doesn't clear the spend. Fix the funnel, *then* pour traffic in.
- **PR ($12, $0 cash):** low direct value; its real worth (backlink/domain
  authority) is deliberately excluded from ΔEV and belongs to the explore budget.
- **Meta paid ($8 vs $600 cash):** worst direct ROI — but wins "fastest learning"
  (see #5). It is an explore bet, not a value bet.
- **Referral loop ($3, 5 eng-days):** highest engineering cost for the smallest
  return; premature — there are only ~90 retained users/mo to refer from.

### 8) What data would most change the ranking
In priority order (largest swing first):
1. **The free-to-paid anchor and LTV.** Every node value scales linearly with
   these two. A truer monetization rate could move *all* magnitudes several-fold
   and could re-order pricing vs the activation fixes. **Calibrate these first.**
2. **Real DNA-fix elasticity.** The +0.14 lift is an estimate; the conservative
   case ($97) still wins, but the margin over pricing depends on it.
3. **Real paid CAC + retention-by-channel.** If paid users retain far better than
   organic, Meta/creator/TikTok ΔEV rises and acquisition re-enters the top five.
4. **Funnel interaction effects.** The graph is linear/static; once activation is
   fixed, every acquisition play's ΔEV rises. Post-fix re-ranking is expected.

---

## 4. Risks & weaknesses in the ΔEV model (read before trusting a number)

- **Two inputs dominate everything.** All dollar magnitudes hinge on the
  `free_to_paid` anchor (4.1%) and `LTV` ($14.20). Until Growth Science
  recalibrates these from real data, **trust the ranking, not the absolute
  dollars.**
- **Seed volumes are not reconciled with the seed revenue snapshot** (the funnel
  implies far fewer subscribers than the 307 shown elsewhere in seed). This is
  demo data; the mock proves the *mechanism*, not the business's real size.
- **Linear, static graph.** No interaction effects: fixing activation should raise
  the value of every acquisition play, but this snapshot doesn't. Phase 2
  recomputes node values after each measured change.
- **Point-estimate lifts; heuristic bands.** Conservative/optimistic are scaled
  guesses, not modeled distributions. Confidence is a single scalar. Real
  uncertainty needs Growth-Science-fit distributions.
- **Opportunity cost is approximated** as the displaced runner-up in the binding
  resource pool, not a full portfolio re-solve. The real allocator does the joint
  optimization.
- **Overlap/cannibalization is flagged, not modeled.** DNA fix and onboarding both
  touch activation; their ΔEVs are **not additive** — doing both yields less than
  $193 + $81.
- **Option value is excluded from ΔEV by design.** PR authority and channel
  learning are handled separately; a naive reader could undervalue PR/Meta.
