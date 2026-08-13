# The Verdict Room entrance — visual review

Rendered screenshots of `/app/together`, captured through the
`MOBILE_HARNESS=1` harness route `/dev/together`, which mounts the real
`VerdictRoomEntrance` inside the same `main.container-page py-6` shell the app
layout provides. They are committed here rather than left in the gitignored
`test-results/` directory so the change can be reviewed from the pull request
without running anything.

| File | What it shows |
| --- | --- |
| `before-*.png` | The entrance at `0b90f04` — accepted architecture, abstract shadow room |
| `after-*.png` | The same screen after the final visual pass |
| `reduced-motion-desktop-1440.png` | `after` at 1440 under `prefers-reduced-motion: reduce` |

Widths are 1440×900, 1280×800, 834×1112 and 390×844.

## What changed between `before` and `after`

The architecture, the behaviour and the full-bleed composition are unchanged.
What changed is what is actually IN the room: the two blank gradient plates
became three original poster illustrations with a leading title, a contender
and one struck out by veto; the anonymous dots became people with reactions and
a ready state; the abstract far panel became a verdict board with a carried
title and struck-out rows; and a gavel inside a converging arc marks the moment
the room decides.

## Two positioning bugs this pass surfaced

Both were present in the `before` frames and are fixed in `after`:

- **`transform` collisions.** A Tailwind `-translate-x-1/2` and an inline or
  animated `transform` are the same declaration, and the later one wins — so
  the verdict board sat 250px right of where it was placed (behind the stage,
  effectively invisible) and the decision glow was offset off its own gavel.
  Anything that both moves and needs centring now uses margins.
- **Transform ORDER on the plates.** `rotateY` before `translateZ` applies the
  depth push in the rotated frame, adding `z·sin(θ)` of sideways travel. The
  flanking plates were sliding 50–70px outward, which on a 390px screen left
  them hanging off both edges as slivers. Depth first, then turn.

`tests/mobile/verdict-room-entrance.spec.ts` pins both, plus the artwork itself
("the shadow room is dressed, not a wireframe").

## Regenerating

```
npm run build:harness
AGENT_RUN=1 npx playwright test -c playwright.mobile.config.ts \
  tests/mobile/verdict-room-entrance.spec.ts
```

That suite writes the same four widths plus the reduced-motion frame to
`test-results/mobile/`. Copy them here if the composition changes.
