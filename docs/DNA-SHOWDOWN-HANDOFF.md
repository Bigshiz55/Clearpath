# DNA SHOWDOWN — build state and handoff

Status at `68aa4cc`: **intelligence layer complete and green. UI not built.
The old wheel is still the live experience and must stay until the replacement
works** — removing it first would leave the product with no calibration at all.

Nothing in this feature is wired into the app yet. `src/lib/showdown/` is
imported by its own tests and nothing else, so the branch is safe to deploy.

---

## What exists

`src/lib/showdown/matchup.ts` — pure matchup selection.
`src/lib/showdown/session.ts` — pure session state and the evidence model.
`src/lib/showdown/intelligence.test.ts` — 11 tests, the §14 evaluation.
`src/lib/showdown/session.test.ts` — 17 tests, the evidence contracts.

Both build on the EXISTING Taste DNA infrastructure rather than beside it:
`quickdna/traits.ts` (30 axes), `quickdna/definition.ts` (44 diagnostic titles
with trait vectors), `dnagame/families.ts` (`dnaKnown`), `dnagame/persist.ts`
(the cross-session DNA store). No schema change was needed.

### Proven (28/28 passing)

- Two simulated people with opposite taste get different profiles, different
  subsequent questions, and different top-5 recommendations (overlap ≤ 1 of 5).
- A settled profile is asked questions worth less than a blank profile is.
- No pair repeats; no title ever faces itself; every dealt pair separates
  something; obscure titles do not dominate the opening run.
- Left/right move the contested axis toward the winner and leave agreed axes
  alone. Weight is proportional to how hard the pair disagreed.
- `neither` condemns SHARED ground and takes no side on the contested axis.
- `markUnseen` moves no belief and retires both titles.

---

## What is NOT built

1. **The game surface.** `src/components/showdown/` does not exist.
2. **Poster art — the one genuine blocker.** `DiagnosticTitle` carries `tmdbId`
   but no `poster_path`, and `tmdbImage()` needs a path. Options, in preference
   order:
   a. Add `posterPath` to the 44 diagnostic titles (one-off, no runtime cost,
      no API in a user request path — consistent with the repo's rule against
      calling out on the request path).
   b. A server route resolving tmdbId → poster_path with caching.
   Until one exists the spec's "posters dominate the screen" cannot be met, and
   a typographic card would be a materially weaker product than asked for.
3. Route swap (`/voice-dna` still renders `<VerdictRush />`), dev harness,
   Nav label.
4. Wheel removal — see below.
5. Playwright E2E for a full 10–12 decision session; mobile/desktop proof.
6. Insight reveals mid-game and the payoff screen. `quickdna/synthesis.ts`
   already has `insightChips()` and `headline()`, which only make a claim when
   the evidence supports it — reuse them rather than writing new copy.

---

## Wheel removal — do this LAST, and only this

Genuinely obsolete once Showdown ships:

- `src/components/dnagame/` (Wheel, VerdictRush, RushReveal)
- `src/lib/dnagame/game.ts`, `rounds.ts`, `score.ts` and their tests
- `src/app/dev/verdict-rush/page.tsx`, `tests/verdictrush/`,
  `playwright.verdictrush.config.ts`

**KEEP — shared Taste DNA infrastructure the wheel merely used:**

- `src/lib/dnagame/families.ts` — the six-family projection and `dnaKnown()`,
  which the Showdown progress metric reuses.
- `src/lib/dnagame/persist.ts` + `persist.test.ts` — the cross-session DNA
  store (profile + everything already shown + play counts).
- All of `src/lib/voice/quickdna/`.

Both keepers should MOVE to a neutral home (`src/lib/tastedna/`) as part of
removal so nothing shared lives in a directory named after a deleted feature.

`persist.ts` currently stores `usedChoiceIds`/`usedTitleIds`. Showdown's
`seenPairs` is a different shape; extend `StoredDna` additively (`parseDna`
already tolerates missing fields, and `persist.test.ts` pins that).

---

## The one number to be careful with

`dnaKnown()` is legitimate — mean confidence coverage across the six families —
so the "21% → 34% KNOWN" readout should use it and nothing invented. Capture it
into `ShowdownState.openingKnown` at session start; the field already exists.

---

## Known limitation to state plainly when shipping

Thirty axes over 10–12 decisions is thin per axis. One session sharpens the
profile; it does not complete it. That is what the replay accumulation already
in `persist.ts` is for, and the payoff copy should not imply otherwise.
