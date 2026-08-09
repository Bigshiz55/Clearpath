---
name: taste-dna
description: >-
  Development guidance for WatchVerdict's taste/personalization — the
  event-sourced preference log, deriveDna, temporal taste memory, evidence
  weighting, and rankByDna. Use when editing src/lib/preference/*, src/lib/dna*,
  src/lib/scoring/dna.ts or dimensions, or when personalization ranks the wrong
  things or a couple clicks reshape someone's profile.
---

# taste-dna — changing personalization

## Golden rules (do not violate)
1. **Taste DNA ranks; it never gates eligibility.** Eligibility (hard
   constraints + subject centrality) decides WHO is in the set; Taste DNA only
   ORDERS the survivors. Never let a taste score include/exclude a title.
2. **The event log is the source of truth.** `preference_events` is append-only,
   timestamped, and provenance-rich; `deriveDna(events, now)` folds it. Never
   overwrite history — corrections and re-rates are new events, not mutations.
3. **Explicit outweighs weak inferred.** The weighting ladder lives in
   `src/lib/preference/signals.ts` (EXPERIENCE > ATTRACTION > DISCOVERY) and
   `deriveCorrections` applies explicit user statements at full confidence.
   A click/impression must never overpower a stated preference.
4. **Low-signal behavior is bounded.** Poster/description reactions are
   `presentationOnly` and route to click/attraction, never taste dims. Keep it
   that way — do not feed mere views into taste axes.
5. **Confidence is a function of accumulated evidence.** `evidenceConfidence`
   saturates on total weight; never fabricate confidence from a single event.

## Temporal taste memory
- The derived state is snapshotted by `src/lib/preference/snapshot.ts` +
  `snapshotStore.ts` into `trait_confidence` (per-trait cache) and
  `dna_strength_history` (a point per recompute). Snapshots are APPENDED at
  recompute boundaries (after `recordEvents`), never overwritten, and are
  best-effort/safe-absent — the event log stays authoritative and re-derivable.
- Snapshotting runs off the search path (in server actions), never in a grid.

## Step 1 — Reproduce with events
Build the failing case as a `PreferenceEvent[]` and assert on `deriveDna` /
`snapshotDna` output. That is the honest, isolated layer.

## Step 2 — Extend, don't replace
The three-channel model, signal weights, and correction override already exist.
Tune constants or add a signal — do not rebuild the engine.

## Step 3 — Prove weighting holds
Assert explicit > inferred (`src/lib/preference/snapshot.test.ts` pattern) and
that a few weak events cannot flip a well-evidenced trait.

## Step 4 — Gates
`npm run typecheck && npm run lint && npx vitest run && npm run build`.

## Notes
- `rankByDna` (`src/lib/dna.ts`) blends embedding DNA + dimension nudge (±8) +
  the three-channel preference nudge (±10). Bounds are load-bearing — keep them.
- The 7 spec scenarios in `src/lib/scoring/scoring.test.ts` must keep passing;
  the pure engine in `src/lib/scoring/` is authoritative and off-limits to AI/UI.
