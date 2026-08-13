# The Verdict Room — interior review frames

Rendered from the real `CourtRoom` on `/dev/court` with the Supabase RPCs
intercepted, so every frame is the shipped component driving the shipped engine
against a room whose state is stated in the spec rather than drawn.

| frame | what to look at |
|---|---|
| `join-narrow-320.png` | The narrowest screen the room supports. The identity line drops its "Verdict Room" label so the code chip fits; before this the header overflowed the viewport by 46px. |
| `lobby-phone.png` | Stages two and three on one screen. Mood and avoid chips are 44px here — they were 36px, the only controls in the app under the minimum. |
| `react-phone.png` · `react-narrow.png` | The stage the room spends its time in. The leading candidate is lit and the group's fit is a length as well as a number; both come from the engine's ranking, so the lighting cannot disagree with it. |
| `react-desktop-1440.png` | The same stage with room to breathe. The rail runs the full width; the reading measure does not. |
| `verdict-phone-390.png` | The reveal. One bloom, once, keyed to `winnerRevealed`. Jurors' scores are a histogram — the shape says whether the room agreed or out-voted somebody. |
| `verdict-reduced-motion.png` | Reduced motion: the same composition, complete and still, resolved on the first frame. Not a stripped-down version — the end state, immediately. |
| `zoom-200.png` | 200% browser zoom (720×450 CSS px). No horizontal scroll. |

## What is NOT in these frames

No poster artwork. The harness has no TMDB key, so every candidate falls to the
designed empty plate. That is the honest state for a title we have no image for
and it is what these frames show; with a key the same frame carries real
artwork in the same box.
