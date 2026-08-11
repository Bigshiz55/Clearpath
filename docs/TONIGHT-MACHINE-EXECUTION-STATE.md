# THE TONIGHT MACHINE — execution state

**Branch:** `claude/tonight-machine`, cut from `origin/main` @ `ef50e76`.
**Status:** intelligence + all five acts built, green, and visually verified in
a real browser at phone and desktop.

---

## Devil's advocate — conclusions that changed the design

Run against DNA Showdown first, then against the Tonight Machine itself. The
findings that actually altered what is being built:

**Against Showdown (all conceded):**

- *A poster battle measures recognition as much as taste.* Conceded and fatal.
  A famous poster wins on fame. **Decision:** a poster is never the whole
  stimulus — every stimulus carries a short diagnostic hook, and recognition is
  captured as its own answer rather than inferred from a pick.
- *A choice is confounded.* Conceded, and the deepest problem. Six explanations
  fit every pick. **Decision:** the Twist — vary exactly one attribute of a
  title they already kept. This is the moat.
- *"Haven't seen either" creates dead rounds.* Conceded. **Decision:** unseen is
  a separate answer that retires the title and still advances the session, and
  a mostly-unseen session ends honestly rather than padding.
- *A rising DNA % does not prove anything was learned.* Conceded. **Decision:**
  completeness is allowed to stay flat, and the Reveal reports what moved
  rather than a number going up.
- *Tonight ≠ taste.* Conceded, and Showdown had no concept of it at all.
  **Decision:** `SessionContext` is a separate type that cannot write a profile.

**Against the Tonight Machine (risks neutralised before building):**

- *Five acts is a disguised questionnaire.* Real risk. **Decision:** acts are
  budgets, not steps. Context questions are asked ONLY when the answer would
  change the outcome; the engine may skip straight to the reel.
- *Twists could become gimmicks.* **Decision:** `NEVER_TWIST` bans axes a
  one-line counterfactual cannot hold constant (`grounded`, `psychological`),
  and a twist is only offered when its axis is genuinely open. Otherwise none
  is shown.
- *Familiarity dependence.* **Decision:** recognition gates stimulus selection,
  and the hook makes an unfamiliar title answerable without having seen it.
- *Too long.* **Decision:** no fixed length; the session ends when marginal
  information gain drops below a floor.

---

## Architecture

```
SessionContext (tonight)          TraitProfile (permanent)
  intent, company, attention        the 20 governed axes
  commitment, lean{}                confidence + evidence count
        │                                    │
        │ tonightPreference()                │ observeAll()
        └──────────► ranking ◄───────────────┘
```

The split is enforced by types, not discipline: `applyContextAnswer` neither
takes nor returns a `TraitProfile`, and `ContextEvidence.permanent` is present
but always empty so every call site can see it was considered and denied.

**Evidence ladder** (weight per answer):

| Interaction | Weight | Writes |
|---|---|---|
| Twist (controlled counterfactual) | `0.42` | one axis only |
| Showdown pairwise pick | `0.34` | contested axes, split-weighted |
| "Neither" | `0.22` | shared traits only |
| Context / mood | — | session only, never permanent |
| "Haven't seen it" | — | nothing |

---

## Built and green

- `src/lib/tonight/context.ts` — tonight vs permanent split, intent bank.
- `src/lib/tonight/twist.ts` — counterfactual selection and single-axis evidence.
- `src/lib/tonight/tonight.test.ts` — **18 tests, passing.**

Proven: a full night of context answers leaves the profile byte-identical and
`dnaKnown()` unchanged; tonight still bends ranking; every twist writes exactly
one axis; twists target the most open axis, never repeat, and return null
rather than perform when everything is settled; unseen has no path to negative
evidence.

Transferred from proven work (unchanged): `voice/quickdna/{traits,definition,
synthesis}`, `tastedna/{families,persist}`.

---

## Surface — built and visually verified

All five acts render from the orchestrator; there is no screen sequence in the
component. Verified in Chromium at Pixel 7 and Desktop Chrome: every act
reached, **no console errors and no failed first-party requests**.

Three defects were found by LOOKING at the screenshots, not by assertions —
each one passed its DOM test while being wrong on screen:

- **The Twist was a void.** One sentence pinned to the top of a tall phone, and
  the most valuable interaction in the product on the emptiest screen in it. It
  is now `TwistCard`: the anchor rendered as HELD with its attributes listed,
  and the single changed attribute stamped below a rule. The experiment is
  visible instead of described. The variable comes from `twist.change`, never
  from parsing the prompt, so the card cannot misreport which axis moved.
- **The no-art card was a poster with the picture missing.** Reserving poster
  space and filling it with gradient reads as a broken image however deliberate
  the colour is. With no artwork the card is now a different, complete
  composition — title large, attributes as chips — rather than a hole. The
  chips are `hookParts`, the same fragments the sentence is built from, so the
  visual and the screen-reader label cannot describe different films.
- **Global chrome ate the primary control.** The feedback FAB is fixed
  bottom-left and landed on top of "That, tonight". Fixed generically:
  a surface sets `body[data-wv-immersive]`, anything marked `data-wv-chrome`
  steps aside. No route list, no screen name in the chrome component.

## The Final Cut could not be answered — two defects, both found by looking

Both passed every test that existed and were visible the moment a real session
was played to the end.

- **A rejection pinned the session forever.** Every finalcut answer arrived with
  the literal subject `'finalcut'`, so "None of these" and the following pick
  produced the same idempotency key — the pick was discarded as a duplicate and
  the player tapped a live button that did nothing, indefinitely. The subject of
  a finalcut answer is now the CHOICE, which is unique and is also the honest
  description of what was answered. A rejection now also forces a real learning
  move before finalists may be shown again, and ends the session honestly when
  there is nothing left to learn, rather than re-offering the same three.
- **The Reveal printed a slug.** A player who chose *Dark* was shown "dark" as
  the headline result of the session. `chosenTitle()` resolves through the
  catalogue, so the surface cannot leak an internal id again.

## Remaining milestones

1. Artwork: `posterPath` static data. **Root cause of the empty rectangles is
   established** — the diagnostic titles carry `tmdbId` but no poster path, and
   this environment has no `TMDB_API_KEY` with `api.themoviedb.org` returning
   `CONNECT 403`. Not a CSS, Next/Image or domain-config fault. The branded
   composition above is the current render path and is complete on its own.
2. Playwright journeys: 320px, 390px, tablet, desktop, 200% zoom, keyboard
   only, reduced motion, refresh/resume, reject-all recovery, broken artwork.
3. Analytics events.
4. Migration behind a flag; remove customer-facing Showdown last.
5. PR into `main`, CI, preview verification, merge, production SHA check.

## Known risks

- 20 axes across a 60–90s session is thin per axis; replay accumulation is the
  mitigation, and the Reveal must not overclaim.
- Poster coverage is 0 until TMDB access exists. Game is fully playable.
