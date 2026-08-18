# BRIEFING SCORE CONSISTENCY — SHIP LEDGER

One user + one title = ONE canonical WatchVerd1ct headline score, on every
surface. Continuation state across sessions: read this, execute **NEXT ACTION**.

WORKSTREAM: `p0-briefing-score-consistency`

MISSION: End the split where Today's Case Briefing and QuickLook printed
different headline numbers for the same user and title, and end the practice of
labelling an objective score "Your Verdict" from an account-level fact.

CURRENT BRANCH: `claude/p0-briefing-score-consistency`
CURRENT SHA: see LAST UPDATED SHA below
CURRENT MAIN SHA: `314623ef0e2e17492708830ebe1afeb308846be6` (PR #75 merge)
BASE / MERGE-BASE: `314623e` — the branch is cut from CURRENT main, 1 ahead,
0 behind. No rollback risk; no integration required.
STATUS: PR #76 open against `main`, all CI green, NOT merged. Verifier role
complete including rendered QA. Awaiting Adversarial Review.

---

## USER-OBSERVED PROBLEM

1. Today's Case Briefing showed **“Your Verdict 79”** for The Golden Girls.
2. Tapping the same title opened QuickLook, which showed **“83 · STREAM IT”**.
3. The briefing explained its 79 as **“Quality base 79”** — an objective number
   presented as a personalized one.
4. The briefing could flood personalized editorial sections with repeated
   episodes of one series (several Golden Girls episodes in separate slots).

## ROOT CAUSE — **VERIFIED** (three independent defects)

**1. Two foundations for one question.** `buildVerdict` personalized off
`general.score` (the legacy blend); `/api/quicklook`, `/api/dna`,
`/api/ratings` and `rankByDna` all read `general.standardScore ??
general.score` (the calibrated Standard Score). Nothing reconciled them.
Reproduced on a Golden Girls fixture before any fix: `general.score = 82`,
`standardScore = 87`, `buildVerdict` based on **82** — a five-point split with
no user-visible cause.

**2. Personalization claimed from an account-level fact.** The briefing page
ran one query — has this ACCOUNT rated ≥ `DNA_PERSONAL_MIN` titles — and that
single boolean both gated the editorial sections and licensed the words "Your
verdict" on every badge in them. Having rated things somewhere is not evidence
that *this* title's number moved.

**3. QuickLook never personalized at all.** It rendered `RatingsStrip` without
`mediaType`/`tmdbId`, taking the branch that prints `ratings.standardScore`
raw instead of the branch that renders `WatchCall`.

**Dedupe (separate).** Editorial sections deduped on `airstamp|showName` (which
collapses an East/West simulcast pair but not one series at three times) and
tracked used rows by `a.id`, the TVmaze **episode** id. `applyScores` spreads
one title's score onto every airing of it, so all episodes carried the
identical number and sorted adjacently.

## ACCEPTANCE CONTRACT

The same final headline WV score for a signed-in user/title drives and appears
in: (1) Today's Case Briefing, (2) QuickLook, (3) card WatchCall, (4) full
title verdict — from one shared contract, not four coincidences.

Canonical flow:

```
Standard Score            objective foundation
  → Taste-DNA blend       only when real qualifying taste signal participates
  → deterministic         explicit preference / hard-rule adjustments (LAST)
  → clamp                 final canonical WatchVerd1ct score
```

Honesty: a title may be labelled "Your Verdict", or claimed as personal, only
when real TITLE-SPECIFIC signal participated in that title's canonical score.
Otherwise it is labelled "Standard score" and says so.

Dedupe: personalized editorial sections hold at most one slot per TITLE
(`mediaType:tmdbId`, conservative normalized-name fallback), representative
airing = on-now else earliest upcoming, title-level score unchanged. Schedule
sections keep individual airings.

## GATES

| Gate | Result | Exit |
|---|---|---|
| G1 focused — `src/lib/scoring/` | 109 passed | 0 |
| G2 focused — `caseBriefing` / `guideScoring` | 27 / 15 passed | 0 |
| G3 full `npx vitest run` | 4701 passed, 24 skipped, 0 failed (338 files) | 0 |
| G4 `npm run typecheck` | clean | 0 |
| G5 `npm run lint` | no warnings or errors | 0 |
| G6 `npm run build` | production build completed | 0 |
| G7 `playwright.searchrouting` | 21 passed | 0 |
| G8 `playwright.mobile` — `case-briefing.spec.ts` | 13 passed | 0 |
| G9 `playwright.mobile` — FULL suite | see NEXT ACTION | — |
| G10 GitHub CI on PR #76 | 10/10 checks success | 0 |

## COMPLETED PROOF

**RED, taken against shipped code before each fix (not manufactured):**
- `crossSurface.test.ts` — 3 failed: `expected 82 to be 87` (foundation),
  `expected 82 to be 87` (cross-surface), `expected 62 to be 67` (hard rule).
- `caseBriefing.test.ts` — 2 failed on the episode flood.
- `tests/mobile/case-briefing.spec.ts` — rendered RED: the lead case displayed
  `Standard score 94` above `Why it's in your briefing: … +8 Courtroom dramas ·
  +5 Slow-burn pacing` — a badge contradicting its own arithmetic on screen.

**Causal proof:** changing ONLY the user's rules changes the score AND the
label (`crossSurface.test.ts`); removing the title-specific vector removes the
personal claim while leaving a 500-rating account (`canonical.test.ts`); a
0-point rule is not participation.

**Desync proof:** `matchWhy` and `matchPersonalized` have exactly one
production writer, `guideScoring.ts:91-92`, in a single object literal sourced
from one `canonicalScore` result — they cannot disagree in production. The
observed contradiction existed only in the dev harness fixture.

## RENDERED QA

`/dev/case-briefing` (MOBILE_HARNESS=1), captured and visually inspected at
**1440 / 1280 / 834 / 390**. Horizontal page overflow ≤ 1px at every width.

- Lead case renders pink **YOUR VERDICT 94** with a matching why
  (`Standard score 81 · +8 Courtroom dramas · +5 Slow-burn pacing`).
- An objective-only row renders grey **STANDARD SCORE 84** and carries
  `data-personalized="false"`.
- The "Worth watching" heading drops "for you" when no row under it is
  personalized.
- Both badge states appear on one page; a browser test asserts each badge's
  claim matches its own arithmetic.

## KNOWN LIMITATIONS

1. **The headline deliberately excludes the per-title Taste-DNA embedding
   blend.** Resolving it costs a paid per-title embedding the briefing's bulk
   path may never spend, so a headline including it would be a number one
   surface could produce and another could not. The deterministic contract is
   the one every surface can honour identically. Taste remains the DNA panel's
   own number and still drives ranking via `rankByDna`. The contract accepts
   and tests a taste contribution, so wiring it later is a change of input,
   not of shape.
2. **The AI adjustment (`?ai=1`) is not the headline** — it stays on the deep
   view and no longer produces a different headline elsewhere.
3. **Behaviour change:** signed-in readers below the old DNA floor now see
   editorial sections built from real engine scores, labelled "Standard
   score", instead of seeing none. Guests are unscored and still get none.
4. **Mobile density:** "STANDARD SCORE nn" is a wider badge than the old
   "Verdict nn", so titles in the Top Cases column truncate a few characters
   earlier at 390px. No overflow; wording is the contracted wording. Logged to
   BACKLOG rather than changed here.
5. No signed-in **production** run was possible from this environment; proof is
   unit + integration + browser-harness + CI.

## BLOCKERS

None.

## NEXT ACTION

Complete G9 (full `playwright.mobile` suite) and record its exact result here.
Then proceed to ADVERSARIAL REVIEW of PR #76 at its head SHA. Do not merge
without explicit owner authorization.

LAST UPDATED SHA: `e4488f678a51cf27d9cf778e9c56828e4a0b1684` (+ uncommitted
harness-fixture and rendered-proof changes pending commit)
