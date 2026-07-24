# THE DNA CASE — architecture & honest status (increment 2: the game brain)

**Date:** 2026-07-24 · **Branch:** `claude/watch-verdict-app-wwbtbg`
**Builds on:** `docs/preference-engine-core.md` (increment 1 — the three DNA channels).

This increment builds the **pure, fully-tested decision logic** behind THE DNA CASE —
DNA Strength, Open Questions, Case Rounds, the Case Update reveal, progress stats,
levels, and response-quality. It is deliberately **logic before UI/DB**, so the game's
brain is proven correct before we render it or persist it. **This is NOT the finished
feature** — the mobile game screen, migrations, and live recommendation reranking are
the next increments, and are marked honestly below.

## Branding system (locked, single names)

WATCH DNA (profile) · THE DNA CASE (game) · CASE ROUNDS (sessions) · DNA STRENGTH
(progress) · NEW EVIDENCE (insights) · OPEN QUESTIONS (unknowns) · TITLES EXAMINED ·
RULED OUT · CONTINUE THE CASE. These are the only names used in the new modules and are
what the UI layer must use.

## New pure modules (`src/lib/preference/`)

| Module | Responsibility |
|---|---|
| `strength.ts` | **DNA Strength** — explainable, anti-gaming 0..100 |
| `openQuestions.ts` | **Open Questions** catalog + resolution + `nextMission` |
| `caseRound.ts` | **Case Round** assembly (info-gain toward a question, familiarity, diversify) |
| `caseUpdate.ts` | **Case Update** diff → New Evidence + Confidence Improved |
| `stats.ts` | **Case Stats** (titles examined / caught interest / ruled out / …) + **Levels** |
| `quality.ts` | **Response quality** — rapid/identical tapping ⇒ reduced confidence |

Plus increment 1: `types.ts`, `signals.ts`, `confidence.ts`, `engine.ts`, `infogain.ts`,
`explain.ts`. **All pure, no I/O**, so every behavior is unit-tested deterministically.

## DNA Strength formula (deliverable #5)

Seven weighted categories, each 0..1, **normalized over what is measurable** (a new user
with no post-watch outcomes isn't penalized for Outcome Calibration):

| Category | Weight | Source |
|---|---|---|
| Experience evidence | 30% | watched-title evidence (saturating) |
| Trait coverage | 20% | axis coverage × genre diversity — **the anti-gaming lever** |
| Response reliability | 15% | `quality.ts` |
| Attraction understanding | 10% | pre-watch evidence |
| Ruled-out confidence | 10% | confident negative traits |
| Outcome calibration | 10% | prediction accuracy (only ≥10 outcomes) |
| Discovery coverage | 5% | discovery signals / novelty |

`developed = Σ(weight·score over available) / Σ(weight over available) × 100`.

**Anti-gaming, proven by test:** 40 near-identical action ratings score **< 70%** (comedy,
romance, animation, pacing tolerance still unknown → trait coverage < 0.4), and a *broad*
profile beats a *narrow* one at the **same** number of taps.

## Verified in this environment (executed)

- **64 preference unit tests pass** (18 new this increment + 46 from increment 1).
- Full suite **274 pass**; `tsc` clean; `next lint` clean.
- Specifically proven: watched vs unseen stay separate; Skip = zero DNA; Undo restores
  prior state; DNA Strength is anti-gaming and excludes unmeasurable categories; Open
  Questions resolve when their traits become confident; Case Rounds pick informative
  (not neutral) titles toward the target question and diversify; Case Update reports only
  real improvements; post-watch Experience outweighs pre-watch Attraction; suspicious
  rapid tapping lowers reliability; mood signals decay.

## Honest status for the spec's requirements (deliverable #20)

**PASS = built and unit-tested here. NOT BUILT = not yet implemented. NOT TESTED =
needs live DB/app/device. Never inferred.**

| Requirement | Status | Evidence / note |
|---|---|---|
| Watched vs unseen captured separately | **PASS** | `engine.test.ts`, `signals.test.ts` |
| "Liked It" ≠ "Looks Interesting"; "Didn't Like It" ≠ "Not for Me" | **PASS** | channel routing tests |
| Skip creates no signal | **PASS** | `engine.test.ts` |
| Detailed outcomes (Loved…DNF / Must-Watch…Definitely-Not) | **PASS** | grades in `signals.ts` |
| Follow-up reasons; mood decays; poster = presentation-only | **PASS** | `signals.test.ts`, `engine.test.ts` |
| Information-gain title selection | **PASS** | `infogain.ts`, `caseRound.ts` + tests |
| Case Round purposes / missions / Open Questions | **PASS** | `openQuestions.ts` + tests |
| DNA Strength explainable + anti-gaming + normalized | **PASS** | `strength.ts` + tests |
| Case Update (New Evidence + Confidence Improved) | **PASS** | `caseUpdate.ts` + tests |
| Progress stats + Levels (by quality, not tap count) | **PASS** | `stats.ts` + tests |
| Response-quality / suspicious-tapping down-weighting | **PASS** | `quality.ts` + tests |
| Undo restores prior state | **PASS** | `engine.test.ts` |
| Explainability (reasons/concerns/confidence) | **PASS** | `explain.ts` + tests |
| Click DNA vs Enjoyment DNA distinction | **PARTIAL** | Attraction (≈Click) vs Experience (≈Enjoyment) modeled + merged with Experience-weighting; **click instrumentation (poster taps, dwell, trailer %) NOT BUILT** — needs client capture |
| Data model / migrations (`case_rounds`, `evidence_events`, `trait_confidence`, …) | **NOT BUILT** | designed (event log + confidence); Supabase migration is the next increment |
| Mobile-first DNA Case screen (2×2 actions, Undo, "% understood") | **NOT BUILT** | UI increment; will be Playwright-tested at 320–480px |
| Watch DNA profile page | **NOT BUILT** | UI increment |
| Recommendations actually rerank after a round | **NOT TESTED** | logic diff exists (`caseUpdate` formats counts); real rerank needs wiring into `rankByDna` + live data |
| Prediction Accuracy (≥10 outcomes gate) | **PARTIAL** | gate enforced in `strength.ts`; needs outcome capture + live data |
| Onboarding / re-engagement / group DNA / analytics | **NOT BUILT** | later increments |
| Playwright: start round, complete 10, actions, skip, undo, Case Update, profile | **NOT BUILT** | follows the UI increment |
| Accessibility (VoiceOver, keyboard, reduced motion) | **NOT TESTED** | applies to the unbuilt UI |
| Screenshots at 320/375/390/430/480 | **NOT BUILT** | follows the UI increment |

## Known limitations / what's explicitly not done

This increment is the **brain, not the face**. There is no screen, no database table, and
no live reranking yet — so the acceptance standard ("the user can see what was learned;
fast and enjoyable on a phone; recommendations actually rerank") is **NOT met yet**, and
I am not claiming THE DNA CASE is complete. What IS true: every decision the game will
make is now implemented as pure, verifiable logic with 64 passing tests, so the UI and
migration increments are wiring, not invention.

---

# Increment 3 — Migration + ranking wiring (load-bearing)

The three DNA channels now persist and **measurably rerank the production ranking
path** (`rankByDna`). No parallel engine, no test-only path.

## Files changed / added
- `supabase/migrations/0023_preference_dna.sql` (new) — persistent data model.
- `src/lib/pendingMigrations.ts` — registered `0023_preference_dna` (base64, idempotent) for `/api/admin/migrate`.
- `src/lib/preference/rank.ts` (new) — `preferenceNudge` (bounded ±10), `rankWithPreference`, `preferenceConfidence`, `hasPreferenceSignal`.
- `src/lib/preference/store.ts` (new, server-only) — `loadPreference` (1 indexed query), `recordEvents` (batched, dedup), `undoEvent` (soft-delete), `recordOutcome`.
- `src/lib/preference/engine.ts` — `deriveCorrections`; "just not in the mood" now decays the whole reaction.
- `src/lib/dna.ts` — **wired the preference nudge into `rankByDna`** (no-op without evidence; zero AI when there's no embedding Taste-DNA).
- Tests: `rank.test.ts` (8 property tests), `store.int.test.ts` (gated live), `rankReport.test.ts` (before/after report generator).
- `docs/dna-rank-report.md` (generated) — before/after ranking with per-title movement.

## Ranking formula (production)
`dnaFit = clamp( base + dimN + rerankN + prefN , 0..100 )`, where `base` = objective
Watchability (or the embedding Taste-DNA blend when available), `dimN`/`rerankN` are the
existing bounded content-fingerprint nudges, and **`prefN` = the new preference nudge**:

`prefN = clamp( agreement × 10 , −10..10 )`, `agreement = 0.7·dimSigned + 0.3·genreSigned`,
each `signed = direction × avgConfidence` (so higher-confidence beliefs move ranking more).

## Evidence weights (per observation, before info/decay scaling)
Experience: loved 1.6 · liked 1.1 · okay 0.35 · disliked 1.1 · hated 1.6 · DNF 1.3.
Attraction: must-watch 1.1 · interested 0.8 · maybe 0.3 · not-interested 0.8 · absolutely-not 1.2.
Discovery: 0.4–0.9. Experience merged at 1.0 vs Attraction 0.7. **Corrections override** inferred at confidence 1.0.

## Cost & scale (per `rankByDna` call, added by this wiring)
- **+1 DB query** (one indexed SELECT on `preference_events`, capped at 1000 rows, `undone_at is null`).
- **0 new external API calls** (uses already-fetched cached dims + metadata).
- **0 AI calls** — and *fewer* than before for preference-only users (the embedding is now skipped when there's no Taste-DNA).
- Pure ranking latency: **0.059 ms per 24-title shelf** (measured, 5000 iters). Bounded candidate set (`cap`), batched writes, request dedup via client id + `unstable_cache`, graceful empty fallback when the provider/table is unavailable.

## Strict status table (this increment)

| Requirement | Status | Evidence |
|---|---|---|
| Migrations + data model for all evidence types, provenance, corrections/undo, outcomes, calibration | **PASS (written)** / **NOT TESTED (applied live)** | `0023_preference_dna.sql`, idempotent, RLS; base64 round-trips exactly. Applying to clean/existing DB needs a live project. |
| Wire all three channels into the real `rankByDna` | **PASS** | `src/lib/dna.ts` diff; build + tsc green |
| Experience outweighs Attraction | **PASS** | `rank.test.ts (a)` |
| Corrections outweigh inferred | **PASS** | `rank.test.ts (b)` |
| Rejection / DNF lowers appropriate titles | **PASS** | `rank.test.ts (c)` |
| Temporary mood decays, core DNA unchanged | **PASS** | `rank.test.ts (d)` + engine |
| Low-confidence users → lower-confidence output | **PASS** | `rank.test.ts (e)` |
| Completing a round materially reranks | **PASS** | `rank.test.ts (f)`, `rankReport.test.ts`, `dna-rank-report.md` |
| Uses the real production path, no parallel engine | **PASS** | nudge lives inside `rankByDna`; report uses the same `preferenceNudge` |
| Core path works with zero AI calls | **PASS (by construction)** | embedding skipped when no Taste-DNA; nudge is pure |
| Before/after ranking report | **PASS** | `docs/dna-rank-report.md` (generated) |
| Cost/scale safeguards (1 query, no per-title AI/API, bounded, batched, indexed, dedup, fallback) | **PASS** | `store.ts`, indexes in `0023`, measured latency |
| A completed round persists / trait confidence changes / RLS isolation, live | **NOT TESTED** | `store.int.test.ts` written, gated; needs Supabase env + 0023 applied |
| Two users opposite DNA → different rankings | **PASS (pure)** / **NOT TESTED (live)** | `rank.test.ts` shows opposite DNA → opposite nudge; live variant in `store.int.test.ts` |
| Migration verified vs clean / existing schema / existing user | **NOT TESTED / BLOCKED** | no live Postgres in this environment |
| User sees what was learned; fast on a phone (acceptance) | **NOT MET** | needs the UI increment (not built, by your instruction) |

## Acceptance standard — honest verdict
**Not fully met yet, by design:** you asked me to stop after migration + ranking wiring and
NOT build the UI. So "a real user completes a round and *sees* it" awaits the UI increment,
and "evidence persists / shelves rerank live" awaits applying `0023` to a real project and
running `store.int.test.ts`. Everything that can be proven without a live DB/UI **is** proven:
the wiring is in the real path, the six ranking properties hold, the round reranks materially,
and the cost profile is one indexed query with zero added AI.

## Remaining blockers
1. Apply `0023` to the live project (`/api/admin/migrate` or `supabase db push`) and run `store.int.test.ts` against it (persistence + RLS + live rerank).
2. Wire `recordEvents`/`loadPreference` into an API route the client calls (trivial; deferred with the UI).
3. Backfill: existing `watchlist_items` ratings are not yet mirrored into `preference_events` (new signal starts fresh; the old dimension nudge still covers them).

## Recommended next increment

1. **Migration** — persist the event log + per-trait confidence (`preference_events`,
   `trait_confidence`, `dna_strength_history`, `open_questions`) with RLS mirrored from
   `dimension_signals`.
2. **Wire into `rankByDna`** so a completed round measurably reranks shelves (makes the
   game non-cosmetic — the spec's hard requirement).
3. **The mobile DNA Case screen** (2×2 actions + Skip + Undo + "% developed" + Case
   Update reveal) with Playwright at 320–480px and the Watch DNA profile page.
