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

## Browser suite — 85 tests, five viewports

`npm run test:tonight` (config `playwright.tonight.config.ts`, port 3220) drives
`/dev/tonight` across 320px, 390px, an iPad shape, desktop, and a 640x400
viewport standing in for 200% zoom. **85 passed, exit 0.**

Nothing asserts which act comes when: the driver asks what is on screen and
answers it, because a test that hard-codes a screen order is testing a script
the product does not have.

Covered: the session completes without stalling · no horizontal overflow · every
control >=44px and inside the viewport · the primary control is not covered by
global chrome (verified with `elementFromPoint`, since a covered button passes
every visibility assertion) · refresh loses and duplicates nothing · a resumed
session finishes · "None of these" recovers · the Reveal names the film rather
than its id · an all-unseen session claims nothing was learned · every image
request aborted and the session still completes · keyboard-only completion ·
visible focus · reduced motion · headings and accessible names.

**A numeric "is this screen empty" check was written and then deleted rather
than tuned.** The app paints a full-bleed background gradient, so every screen
counted as fully painted and the check could never fire — it passed for the
wrong reason. A threshold strict enough to fire would have failed the
no-artwork card, which is a known gap awaiting poster data, not a regression to
freeze into a green test. Emptiness is judged from the 25 screenshots the suite
writes to `test-results/tonight/`, one per act per viewport.

### What the browser found that the tests had not

- **The answers were below the fold at 200% zoom.** `min-h-[100dvh]` lets a
  container grow past the viewport, so on a 400px-tall screen the Final Cut's
  "None of these" and the Twist's answers were simply off the bottom. Acts are
  now exactly `h-[100dvh]` with a compressible middle and pinned answers.
- **Centred content inside a scroll container is unreachable.** With
  `justify-center`/`content-center`, overflow spills equally in both directions
  and the start edge cannot be scrolled back to. At 640x400 a finalist card's
  centre landed in that dead region, so the act container — not the card —
  received the tap, and the session could not be completed at all. Centring is
  now done with auto margins, which collapse to zero when space runs out.
- **A half-sliced chip reads as a rendering fault.** The Twist's held-constant
  block clipped rather than scrolled. It scrolls now, and gives way first: the
  changed attribute and the answers must survive any screen.

## Analytics — built, wired, and verified in a browser

`src/lib/tonight/analytics.ts`. Six events: started, move shown, move answered,
shortlist rejected, completed, left.

Two rules, both enforced by tests:

- **Nothing is invented.** Every field is copied from state the engine already
  computed. Events report the interaction the ENGINE RECORDED, not the tap — an
  ignored retry produces no event, because otherwise answer counts inflate by
  however impatient players are and that number then gets read as engagement.
- **Nothing goes anywhere by default.** The sink is a no-op until something
  installs one. Where a person's viewing taste is stored, and for how long, is
  an owner decision — not something a module makes by quietly defaulting to an
  endpoint. **No transport is wired. That is deliberate, and it is the one part
  of this milestone still open.**

The dev harness installs a sink into `window.__tonightEvents`, so a browser test
asserts on the stream a real session produces: complete, single-session,
monotonic, no duplicated answers, and a completeness figure that matches what
the Reveal displays. Unit tests prove the builders; that test proves the
wiring, which is the half that rots silently.

**95 Playwright tests, five viewports, exit 0.**

## Migration — the route exists and ships dark

`/app/tonight` renders the machine under `/app`, so `src/middleware.ts` has
already refreshed and gated the session; there is no second auth check here to
get subtly wrong. It `notFound()`s unless `TONIGHT_MACHINE` is set.

**A server variable, not `NEXT_PUBLIC_`.** A `NEXT_PUBLIC_` flag is inlined into
the client bundle at build time, so changing it needs a rebuild and a redeploy
— the wrong property for the switch you reach for when something is going
wrong. This one is read per request (`force-dynamic`), so it can be turned OFF
from the hosting environment without shipping anything.

Off is the default everywhere, including preview. Verified: unset, empty, `0`,
`false`, `off`, `no` all read as off; only `1`/`true`/`on`/`yes` enable it. The
page's own gate is tested directly — off throws `notFound()`, on renders.

Unauthenticated, both flag states return 307 to login, so the route leaks
nothing about whether the feature exists.

**There is no Showdown on this branch to remove** — it was never merged to
`main`, and this branch was cut from `main`. The flow this will eventually
replace is `/app/taste-quiz`, which is untouched and still canonical.

**Deliberately NOT done here:** no nav entry, and `taste-quiz` still points at
itself. Surfacing the machine in navigation and retiring the old flow change
what every user sees on their next visit, and belong with the decision to turn
the flag on — not smuggled in ahead of it.

## Remaining milestones

1. Artwork: `posterPath` static data. **Root cause of the empty rectangles is
   established** — the diagnostic titles carry `tmdbId` but no poster path, and
   this environment has no `TMDB_API_KEY` with `api.themoviedb.org` returning
   `CONNECT 403`. Not a CSS, Next/Image or domain-config fault. The branded
   composition above is the current render path and is complete on its own.
2. Choose an analytics destination and wire the sink (owner decision).
3. Turn the flag on: nav entry, retire `/app/taste-quiz`, owner sign-off.
4. PR into `main`, CI, preview verification, merge, production SHA check.

## Known risks

- 20 axes across a 60–90s session is thin per axis; replay accumulation is the
  mitigation, and the Reveal must not overclaim.
- Poster coverage is 0 until TMDB access exists. Game is fully playable.
