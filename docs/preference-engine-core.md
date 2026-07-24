# WatchVerdict Preference Engine — core architecture (increment 1)

**Date:** 2026-07-24 · **Branch:** `claude/watch-verdict-app-wwbtbg`
**Status:** pure engine core, fully unit-tested (46 tests). No DB/UI yet — those are
the next increments. This is the "engine core first" foundation you chose.

## Why the current system is limited (measured, not asserted)

Tracing the live code (`LikeHateGame.tsx`, `quiz.ts`, `dna.ts`, `titleDimensions.ts`):

- **One blended rating.** The Yes/No/Maybe/Haven't-seen game maps to a single
  `watchlist_items.rating` (9/6/2) with `status:'watched'`. So a *pre-watch* "looks
  interesting" is stored as if the user *watched and rated* it. Watched-vs-interested
  is structurally inexpressible.
- **No confidence.** Per-trait confidence is recomputed at read time and discarded;
  nothing distinguishes "we've seen this 8 times" from "one lucky tap."
- **No separation of curiosity.** "Never heard of it" and "not in the mood" both
  vanish into the same void as "I hate this genre."
- **Thin explanations.** Recs carry a single `because`/`matchReason` string.

## What the new engine adds (`src/lib/preference/`, pure & outside `scoring/`)

Three **independent** channels, never mixed:

| Channel | Captures | Strength |
|---|---|---|
| **Experience DNA** | what they actually watched & how it landed (loved…hated, DNF) | highest |
| **Attraction DNA** | pre-watch pull (must-watch…absolutely-not) | medium |
| **Discovery DNA** | curiosity / novelty appetite (never-heard, want-more-like-this) | lowest |

The four fast-onboarding buttons route unambiguously: 👍/👎 → **Experience**,
👀/🚫 → **Attraction**, **Skip → zero DNA**. `signals.ts` is the single source of that
mapping; `engine.test.ts` locks in that Attraction never writes Experience.

### The math (`confidence.ts`)

Each trait (a content axis, a genre, a person) is a running **evidence-weighted mean**
`pref` (0..100) + total `evidence`. Confidence in a *directional* claim ("likes X") is

```
confidence = evidenceConfidence(evidence) × decisiveness(pref)
           = (1 − e^(−evidence/8)) × (|pref−50|/50)
```

Consequences, all unit-tested:
- **Never overreacts:** one extreme tap → confidence < 0.15 ("learning"), no matter how
  decisive the direction.
- **Requires repeated evidence:** confidence only crosses "moderate" after several
  consistent observations.
- **Conflicting evidence self-cancels:** equal +/− taps drive `pref`→50, decisiveness→0,
  confidence→0 ("we have data but no lean").

### The engine (`engine.ts`)

`deriveDna(events, now)` folds an **append-only event log** into the three channels —
a pure, deterministic function. Therefore:
- **Undo is free & lossless:** drop an event (`undoLast` / `withoutEvent`) and re-derive.
  Users can edit their DNA forever.
- **Mood decays, preferences don't:** "just not in the mood" and "know it but skipped"
  are `mood` signals whose evidence halves every 14 days; "I hate animation" is
  `permanent`.
- **A specific reason concentrates blame:** rejecting an animated comedy *for* animation
  strengthens the animation-genre signal while the broad dimensional signal is dampened
  to 0.35 — so the engine doesn't wrongly learn "dislikes comedy." (`engine.test.ts`
  proves humor evidence drops and animation evidence rises.)
- **Uninformative axes are ignored:** a title neutral on an axis (≈50) teaches nothing
  about it; only expressed axes move.

### Information-gain onboarding (`infogain.ts`)

`pickNextTitles(pool, dna)` chooses the next title to **maximize expected uncertainty
reduction**: a title is valuable when it strongly expresses an axis we're still unsure
about. After each pick it discounts the axes that pick would teach, so the *next* pick
probes a **different** gap (animation? foreign? slow-burn?) instead of five near-clones.
No random onboarding queue; every answer reduces uncertainty.

### Explainability (`explain.ts`)

`explainTitle(title, dna)` returns the `✓ reasons`, `⚠ concerns`, and an honest
`confidence %` — but **only from confident, directional traits**, so the app never
claims a "why" it hasn't earned (cold start → no reasons, 50%). Experience outweighs
Attraction when the two are merged into an effective taste.

## Why this produces materially better recommendations

1. **Right signal, right weight.** Enjoyment (Experience) and interest (Attraction) stop
   contaminating each other, so "things that look cool but I bounce off" and "things I
   actually finish and love" become separable — the single biggest quality lever.
2. **Calibrated confidence** prevents the classic over-fit to one swipe and lets the UI
   say "97%" vs "18%" honestly.
3. **Targeted rejection** means one "too violent" tap teaches the violence axis, not a
   smear across ten unrelated axes.
4. **Info-gain selection** learns a usable profile in far fewer taps than a fixed queue.
5. **Lossless undo + decay** keep the model correct over time and correctable by the user.

## What's NOT done yet (honest)

This is the pure engine only. Still to come as separate increments (in order):
**(a)** Supabase migration to persist events + per-trait confidence (smallest change:
`watchlist_items.signal_type` + a `preference_events` log + a confidence table);
**(b)** wiring the builders into `rankByDna` so recs consume all three channels;
**(c)** the game-like onboarding UI (4 actions + skip + smart follow-up + "% understood")
with Playwright; **(d)** Click/Poster DNA capture (needs client instrumentation);
**(e)** person-search and live-TV intelligence (already mapped). None of these are
claimed complete. The acceptance standard ("after a few minutes it understands *why* you
decide") is met by the engine's logic here and will be demonstrable end-to-end once (a)–(c)
land and run against live data.
