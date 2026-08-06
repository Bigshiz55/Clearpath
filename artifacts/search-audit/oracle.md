# The oracle — scoring rules, written before execution

Frozen with the corpus. Every rule below was written and typechecked **before**
any test ran, and no rule was changed after seeing a result. The executable
form is `scripts/searchAudit/oracle.ts`; this is the same thing in prose.

The governing principle: **something appearing is not success.** A result
passes only when it reflects what the person meant.

---

## Severity

| | Meaning |
|---|---|
| **P0** | Wrong or missing answer to a request that was not ambiguous; a secret, stack trace or file path leaks; ordinary input crashes the surface; a fact is fabricated and presented as verified. |
| **P1** | The right answer exists but is unreachable (buried, wrong rank); a stated constraint is silently dropped; conversation state is lost; an availability claim carries no source; hostile input returns 5xx. |
| **P2** | The answer is right but the handling is not: undisclosed normalisation, the right title in the wrong medium, poor ordering inside the top set. |
| **P3** | Cosmetic: a needless clarifying question on an already-clear request, wording, presentation. |

---

## Pass rules

**Exact title** (typed correctly). Passes only when the intended title is the
**first** result and its medium matches. Present but not first: P1 inside the
stated top-N, P0 beyond it. Absent: P0. Right title, wrong medium: P2.

**Person.** Passes when the named person appears within the top 3 of the
person surface. Outside it: P1. Absent: P0.

**Fuzzy title** — misspellings, fragments, punctuation and article variants.
Passes when the intended title is recovered within the stated top-N (3–8
depending on how mangled the input is). Not recovered: P1. Nothing at all: P0.

**Recommendation.** Passes when the request is answered *as a recommendation*.
Fails when it routes to an exact-title destination (P1), returns the reference
title itself as the top pick (P1), returns nothing with neither a question nor
an explanation (P0), or when more than half the typed/dated results violate a
stated hard constraint (P1).

**Multi-turn.** Later turns refine; they do not restart. Passes when every hard
constraint established earlier is still active after the final turn. Some lost:
P1. All lost: P0.

**Ambiguity**, judged against the classification the corpus assigned before
execution:

| Classification | Passes when | Fails as |
|---|---|---|
| **A. Safe normalization** | it proceeds *and states the assumption* | silent normalisation P2; nothing returned P0; needless question P3 |
| **B. Clarification required** | it asks, or answers with the interpretation disclosed | confident answer with neither P1; empty with neither P0 |
| **C. Enough information** | it answers directly | needless question P2; no answer P0 |
| **D. Impossible / contradictory** | it names the conflict | confident answer P1; silent empty P1 |

**Availability.** Passes when every claim carries a source and distinguishes
included from rent/buy/premium. Unsourced claim: P1. No claim at all is honest
and passes; no answer *and* no explanation is P0.

**Security.** Passes when hostile input is treated as literal text. Any leak of
a secret, stack frame, server path or database error is P0, as is a response
that acts on injected instructions. 5xx or no response: P1.

**Malformed / extreme.** Passes when the surface survives and returns an empty
or explanatory state. 5xx, hang, or crash: P1. Any leak: P0.

---

## What each layer is allowed to conclude

The three layers see different things, and each is confined to what it can
actually prove. Scope was decided before execution and is enforced in code.

**Layer A — live production API.** Judges result quality for lookups (exact,
fuzzy, person), and **routing** for recommendations. Routing is judged here
rather than in Layer B because the shipped decision needs real results:
`resolveSearchDestination` lets an exact title match win outright and falls
through to the Judge when nothing comes back. Landing at the Judge is a pass;
it is *not* a claim that the Judge answered well.

**Layer B — shipped interpretation modules, imported not recreated.** No
retrieval, so it may not issue routing or ranking verdicts. It judges
**constraint capture** for requests that state constraints in prose, and
crash-safety on every input. A bare title states no constraints, so lookups are
recorded as *deferred to Layer A* — not as passes.

**Layer C — browser, local production build of the deployed commit, replaying
frozen live responses.** Judges what a real Chromium does: where the submit
sends the browser, what renders, whether anything leaks or throws. This is
local browser verification of production data. It is **not** live browser
testing and is never reported as such.

---

## Constraints that count

The corpus records everything a request implies, including soft colour ("mood",
"occasion") that no filter is meant to encode. Only these keys are treated as
constraints whose loss is a defect:

`media_type` · `service` · `max_runtime_minutes` · `max_seasons` ·
`released_after` · `reference` · `genre` · `exclude_titles` · `exclude_genre` ·
`certification` · `decade` · `negative` · `available_now` · `exclude_seen` ·
`exclude_watched` · `country` · `topic` · `person` · `disambiguate` ·
`included_only` · `uses_history`

Everything else is reported as context, not scored. Scoring a system for
failing to persist "Sunday afternoon" as a hard filter would be marking it
against a requirement nobody made.
