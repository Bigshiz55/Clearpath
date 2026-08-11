# THE TONIGHT MACHINE — execution state

**Branch:** `claude/tonight-machine`, cut from `origin/main` @ `ef50e76`.
**Status:** core intelligence built and green. UI not built.

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

## Remaining milestones

1. Stimulus model — title + diagnostic hook + four reactions.
2. Reel planner — information gain over stimuli, fatigue, diversity.
3. Final Cut + Reveal — three finalists with differing reasons; honest reveal.
4. UI for all five acts; mobile-first, keyboard, reduced motion, 200% zoom.
5. Artwork: `posterPath` static data. **Root cause of the empty rectangles is
   established** — the diagnostic titles carry `tmdbId` but no poster path, and
   this environment has no `TMDB_API_KEY` with `api.themoviedb.org` returning
   `CONNECT 403`. Not a CSS, Next/Image or domain-config fault. Branded
   fallback with title + year is built and is the current render path.
6. Deterministic user matrix (A–E).
7. Playwright journeys + visual proof.
8. Analytics events.
9. Migration behind a flag; remove customer-facing Showdown last.

## Known risks

- 20 axes across a 60–90s session is thin per axis; replay accumulation is the
  mitigation, and the Reveal must not overclaim.
- Poster coverage is 0 until TMDB access exists. Game is fully playable.
