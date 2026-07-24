# Verdict Growth OS — Product Requirements (v1 foundation)

## Mission

Acquire, activate, retain, and monetize users for WatchVerdict and ReadVerdict —
efficiently, safely, and with every recommendation tied to a business metric.

## Core outcomes optimized

1. Qualified visitors 2. Account creation 3. Watch/Reader DNA completion
4. Successful first verdict 5. Recommendation acceptance 6. Return usage
7. Sharing & invitations 8. Paid conversion 9. Retention 10. Revenue
11. Sustainable CAC 12. Low AI/infra cost per active user

Each UI surface maps to one or more of these; each recommendation names the
metric it moves (rule 11).

## Non-goals (explicitly out of scope)

Generic business OS · personal productivity app · vanity analytics · autonomous
spam/outreach · fake engagement · unauthorized scraping · uncontrolled ad spend ·
auto public posting without approval · any duplicate of WatchVerdict/ReadVerdict.

## Users & roles

| Role | Capability |
| --- | --- |
| Owner | Full access; approves any action; sets budgets and emergency stop |
| Operator | Reviews queue, drafts campaigns, approves within delegated limits |
| Viewer | Read-only access to briefings, metrics, and audit log |

(Modeled in the `roles`/`permissions` tables; auth wiring is a next-phase item.)

## Functional requirements delivered in v1

### A. Executive Briefing (`/`)
Answers: what happened, what grew, what declined, what's broken, what
opportunities appeared, what threatens revenue, and the **5 highest-value
actions today**. Each action shows product, department, problem, evidence,
action, effort, expected impact, confidence, metric affected, owner, approval
requirement, status, and deadline.

### B. Growth Opportunity Inbox (`/opportunities`)
Normalized records across all 12 source types (community, social, creator,
journalist, podcast, newsletter, SEO, partnership, competitive weakness,
seasonal, complaint pattern, PLG). Each carries source, URL, discovery date,
relevance, audience, intent, reach, competitive density, channel, suggested
response, expected outcome, effort, risk, confidence, approval state, outcome —
and a single **0–100 impact score** with an explanation.

### C. Campaign Factory (`/campaigns`)
Stores every asset (objective → performance) and runs a draft → review →
approve → revise → archive workflow. **No automatic publishing in v1.**

### D. Conversion Laboratory (`/conversion`)
Models the full funnel (impression → subscription) per product, computes step
conversions, drop-off, overall conversion, and the **biggest leak**; hosts
experiments with variants, hypotheses, and guardrail metrics.

### E. Product & Engineering Command (`/engineering`)
PRs, deployments, incidents, and customer feedback via a provider-neutral
GitHub adapter (mock). Makes no unsupported claim about real deploy state.

### F. Revenue Engine (`/revenue`)
Plans, MRR/ARR, trial & free-to-paid conversion, churn, revenue per active user,
CAC, LTV, **LTV:CAC**, and **AI+infra cost per active user**, with the daily LLM
cost-ceiling bar. Mock billing adapter; connecting real billing needs approval.

### G. Approval Center (`/approvals`)
One unified queue. Every record shows the exact proposed action, evidence,
expected impact, risk, cost, reversibility, generated content, requested
approver, decision + reason, execution result, and audit trail. Approve/reject
is the one interactive write in v1; it records the decision but does **not**
execute the external action.

### H. Data Sources & Audit (`/integrations`, `/audit`)
Adapter health, product registry, scheduled-job ceilings; and an immutable log
of every automated action and human decision.

## Acceptance criteria (v1)

- `npm run typecheck && npm run lint && npm test && npm run build` all pass.
- Every seeded record is labeled `DEMO`; no mock data is presented as real.
- No adapter performs an external or financial write; no auto-posting exists.
- Approvals are default-deny and enforce a one-shot execution state machine.
- The 5-action briefing, opportunity scoring, funnel/revenue/cost math, and
  product separation are covered by unit tests.

## Explicitly deferred (see ROADMAP.md)

Real analytics/GitHub/billing/social adapters · Supabase persistence & auth ·
LLM-drafted content generation · scheduled job runner · execution adapters.
