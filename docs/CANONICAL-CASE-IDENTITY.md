# Canonical case identity — a data dependency, not a code task

**Status: BLOCKED on data acquisition. Not scheduled.**

Crime Case Files exists to make one promise:

> Know when you've already seen the case — even under a completely different title.

That promise is not implementable today, and no amount of application code
changes that. This document records exactly what is missing so the gap is a
tracked dependency rather than a recurring surprise.

## What the product needs to say

> You've already seen this case on Dateline.

> This *Snapped* episode covers the same murder you watched on *48 Hours*.

Both are claims about a **real-world event**, not about strings. The same case
appears as "The Staircase", "Death on the Staircase", "A Deadly Fall" and as an
untitled *Dateline* episode, on ID, Oxygen, Netflix and Lifetime, across twenty
years. Title matching cannot connect those and should not be made to look like
it can.

## The identity model that would be required

```
Case
 ├─ canonical name
 ├─ aliases            every title the case has been broadcast under
 ├─ people             victims, perpetrators, investigators
 ├─ location           jurisdiction, city, state
 ├─ date               offence date, and/or conviction date
 └─ retellings[]       → programme / episode / network / air date
```

The tables for the shape already exist (`cases`, `case_programmes`,
`case_subjects`, `case_timeline`). **They are empty.** `case_programmes` — the
join that makes the whole feature work — has no verified rows, so
`CaseBrowserView` finds zero cases and previously rendered the unmatched
programme inventory instead, which is a TV listing wearing a case-file heading.

## Why this cannot be inferred

Three plausible shortcuts, and why each is worse than the honest empty state:

**Title similarity.** "The Menendez Brothers" and "Menendez: Blood Brothers" are
the same case; "The Staircase" (2004 docuseries) and "The Staircase" (2022
drama) are the same case in different formats; "Snapped: Michelle Carter" and
"Conrad Roy" share no tokens at all. Similarity gets the easy third and is
confidently wrong on the rest — and a wrong "you've seen this" is worse than no
claim, because the entire value proposition is trust.

**LLM extraction at request time.** Forbidden by `CLAUDE.md`, and correctly:
extraction belongs in batch at ingest with results stored and read back
deterministically. It is also non-reproducible, which is unacceptable for a
claim the user is asked to rely on.

**Episode synopsis parsing.** Viable as a *candidate generator* for human
review. Not viable as a source of truth: synopses routinely omit victim names,
and a case identified from a summary cannot be distinguished from a case
hallucinated from one without a verification step that does not exist.

## What would unblock it

In rough order of cost:

1. **A licensed or public true-crime case dataset** with stable identifiers,
   aliases and people. This is the real answer and it is a licensing/procurement
   decision, not an engineering one.
2. **A batch extraction + human verification pipeline.** Episode synopses in,
   candidate cases out, an admin review queue that promotes a candidate to a
   verified `case` row. Reuses the existing tables. Needs an ingest budget and
   somebody's ongoing attention.
3. **Manual seeding of the top ~200 cases.** Covers the cases that actually
   recur across networks, which is a small set by definition — most cases are
   told once. Cheapest path to a demonstrably working feature, and it does not
   scale.

## What shipped instead, for now

- **Eligibility filtering** (`src/lib/packs/eligibility.ts`) so the page carries
  true-crime and documentary programming only. Storage Wars, K9 PD and
  infomercials are excluded by rule rather than by blocklist.
- **An honest unlinked state.** With zero verified cases the page says case
  linking is not live, states how many eligible programmes it does have, and
  lists them as *programming* — never under a heading that implies two shows
  have been matched to one case.
- **No inferred linkage anywhere.** `case_programmes` is read, never written by
  a heuristic.

The feature is therefore honest and incomplete, which is the only combination
available until the data exists.
