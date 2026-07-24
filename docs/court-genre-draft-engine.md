# Court "Genre Draft" — Engine Core (Phase 1 of the redesign)

Per the agreed sequencing ("engine core first"), this delivers the **server-only
proprietary heart** of the Genre Draft: pure deck generation and group scoring, with
the full mandated engine test suite. The DB migration, real-time RPC wiring, and the
8-step mobile UI are the **next phases** and are intentionally NOT in this change.

## Files added (this phase)

- `src/lib/court/types.ts` — shared engine types (candidates, participants w/ Watch
  DNA, decks, ranked picks, vetoes, per-candidate score breakdown, verdict).
- `src/lib/court/deck.ts` — pure per-participant deck generation.
- `src/lib/court/groupScore.ts` — **proprietary** group-scoring engine (weights are
  module-private; not exported, never imported by any client component).
- `src/lib/court/deck.test.ts`, `src/lib/court/groupScore.test.ts` — 15 unit tests.

No files were modified and **no database change** ships in this phase.

## Candidate-deck generation approach (`buildDecks`)

Each juror gets ~12 candidates from a shared, host-filtered pool:
- **6 shared** — highest mean affinity across the whole jury (identical for everyone).
- **1 divisive** — highest disagreement (variance of affinity), reserved first so it
  can't be claimed as another slot; measures willingness to compromise.
- **3 personalized** — best fit to *this* juror's Watch DNA (`dimensionMatch`).
- **2 wildcard/discovery** — decent personal fit but less obvious (novel to the rest
  of the jury), never a title the juror already loves.
- Top-up toward 12 only with real, eligible, non-dup fits.

Guarantees (all tested): every title satisfies the host's **media / genre / runtime /
availability** filters; **no duplicate** titles in a deck; **≤1 title per franchise**;
already-**watched** titles excluded when that filter is on; and **fewer than 12
rather than filler** when the reliable pool is small.

Affinity uses the existing Watch DNA (`dimensionMatch(title fingerprint, juror
profile)`), falling back to a neutral 0.5 nudged by explicit "loves" for cold-start
jurors. Everything is deterministic (stable score-then-key sort; no `Math.random`).

## Group-scoring approach (`deliberate`) — NOT majority voting

For every candidate we predict each juror's **satisfaction** (0..1) from their DNA
affinity + a **weighted** ranked-pick boost (rank 1 > 2 > 3, not equal) minus veto
drops, then compute separate values:

- `avgSatisfaction` — overall predicted group satisfaction
- `lowestSatisfaction` — the least-enthusiastic juror (fairness)
- `agreementScore` — 1 − normalized disagreement
- `vetoPenalty` — aggregate preference-veto penalty
- `discoveryBonus` — reward for a strong pick few explicitly chose
- `availabilityConfidence` — available+listed vs unlisted vs unverified
- `finalScore` — the blended Court score

The final score weights the **least-satisfied juror and agreement heavily**, so a
title everyone likes beats a title one juror loves and another dislikes (verified:
"balanced consensus beats polarizing", and a title with the majority of first-place
votes can still lose). Discovery value and confidence keep it from collapsing to the
blandest safe option. The verdict returns a **winner, a distinct runner-up, and a
distinct wildcard** (a less-obvious, high-potential pick).

**Vetoes:** a `preference` veto is a strong negative that lowers ranking (and can
eliminate in a hard-veto room); a `content` veto is a declared restriction that
**always eliminates** the title — even one that would otherwise win.

## Privacy behavior

The proprietary weighting constants live only inside `groupScore.ts` (module-private,
not exported). A grep confirms **no client component imports `court/deck` or
`court/groupScore`** — the engine is server-only by construction. When wired, it will
run inside a server action / `SECURITY DEFINER` RPC, and per-juror picks stay hidden
until all submit (the existing `court_state` RPC already withholds individual votes
pre-verdict; the deck phase will extend the same pattern).

## Automated test results

`src/lib/court/*` — **15 tests pass**. Covered: filters are hard; no duplicate deck
titles; shared-6 identical while personalized differs by DNA; wildcard + divisive
present; franchise cap; watched exclusion; honest shortfall (fewer than 12);
group-scoring is not majority; preference vetoes reduce ranking; content veto
eliminates; hard-veto rooms; availability discount; winner/runner-up/wildcard
distinct. Full suite: **387 unit tests**, typecheck, lint all green.

## Remaining phases (not in this change)

1. **DB / migration** — a `court_mode`, host `genre`/`filters`, per-participant deck
   snapshot + ranked selections + veto columns (or a `court_selections` table); new
   `SECURITY DEFINER` RPCs (`court_start_draft`, `court_submit_picks`,
   `court_progress`, `court_verdict`) mirroring the existing RPC-only access model.
2. **Real-time** — reuse the existing poll/subscription in `LiveCourt` to sync genre
   + filters, draft start, per-juror progress ("2 of 3 selected"), all-submitted, and
   the verdict, without exposing others' choices before submission.
3. **Mobile UI** — the 8-step flow (Choose the Case → deck → pick top 3 with sticky
   tray → optional veto → progress → verdict), iPhone-first, 2-column poster grid,
   44px targets, safe-area, no horizontal scroll; plus the "Search and nominate"
   fallback.
4. **Learning capture** — record the specified per-juror signals (weighting
   high-confidence behaviors over exposure).
5. **Game-mode architecture** — the engine already takes a mode-agnostic
   (candidates, participants, selections) shape, so Blind Jury / Speed Court /
   Elimination / Head-to-Head / Host's Choice slot in without reworking scoring.

Do not merge or deploy.
