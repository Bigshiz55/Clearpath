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

## Recommended next increment

1. **Migration** — persist the event log + per-trait confidence (`preference_events`,
   `trait_confidence`, `dna_strength_history`, `open_questions`) with RLS mirrored from
   `dimension_signals`.
2. **Wire into `rankByDna`** so a completed round measurably reranks shelves (makes the
   game non-cosmetic — the spec's hard requirement).
3. **The mobile DNA Case screen** (2×2 actions + Skip + Undo + "% developed" + Case
   Update reveal) with Playwright at 320–480px and the Watch DNA profile page.
