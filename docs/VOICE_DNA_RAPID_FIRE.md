# Voice DNA — the rapid-fire interview (stages 1–4)

The shape of the conversation IS the product. This document is the specification
and the evidence that the implementation matches it.

Everything here runs offline: pure modules, a mocked transport, no key, no
socket, no database.

## Why it is shaped this way

An open prompt — "tell me about movies you like" — gets a vague answer, and a
vague answer is the worst possible first input to a recommender. So the
interview never asks one. It opens with a grouped, scored question anyone can
answer in three seconds, and spends every later turn on what those scores
revealed.

| Stage | What it asks | Why here |
| --- | --- | --- |
| 1 | Three genres at a time, 1–10 each (9 genres over 3 turns) | Broad and fast, and it produces the numbers every later stage needs |
| 2 | Sub-genre drill-down — **only** into genres scored ≥ 7 | Drilling a genre someone scored 2 spends a turn re-asking something already answered |
| 3 | Watching style: subtitles, slow burns, black-and-white, endings, length, bingeing | Hard preferences that gate titles regardless of genre |
| 4 | Named title anchors — **last** | "I loved Prisoners" means something different from someone who scored crime 10 than from someone who scored it 2. Asking first throws that context away |

## The loop

`ASK → LISTEN → PARSE → SAVE → NEXT`, and the client is not part of the
interpretation. It sends the **raw utterance**; the server parses it against the
question that was actually asked. That is why speech, the typed accessibility
fallback, and the tests behave identically — they differ only in how the string
is produced.

An unreadable answer does **not** consume the question. `needsReask` comes back
true and the same question stands, because recording a score the user never said
is worse than asking again.

## No parallel taste model

Answers become ordinary `TasteSignal`s and nothing else. They flow into the
existing confidence model, claim memory, contradiction detection, and the
`preference_events` bridge (`source: 'voice_interview'`) that the Watch DNA quiz
already writes to. There is exactly one model of the user; this is just a faster
way of collecting evidence for it.

## Adaptivity is derived, never stored

Stage 2 is recomputed from the stage-1 scores whenever it is needed, rather than
cached as a plan. A resumed interview therefore lands on exactly the turn it left
off on — there is no second source of truth to drift. Persisted state is only:
answered question ids, the genre scores, and the named anchors.

## The failure conditions, as code

`specAudit.ts` names the ways this interview would be wrong even while every
unit test passed, and checks them against a completed run:

- `vague-opening` — opens open-endedly, or the opener is not a scored question
- `ended-after-one-answer`
- `anchors-before-genre-calibration`
- `unearned-drill-down` — a drill-down into a genre scored below 7, or never scored
- `too-few-meaningful-turns` — fewer than 8

Adaptivity cannot be judged from one transcript (a fixed questionnaire and a
responsive interview look identical in isolation), so `isAdaptive` compares two
users and requires their question sets to differ.

Each guard is proved to **bite**: `specAudit.test.ts` feeds it deliberately
violating transcripts and requires the specific violation back. A guard that has
only ever seen good input is untested.

## Captured run — an enthusiastic user

Produced by `runInterview(typicalAnswerSource)`; reproducible offline.

```
interviewer: Quick gut check, one to ten each — crime, comedy, sci-fi.
user: 9, 4, 10
interviewer: Love that.
interviewer: Same again — horror, romance, documentaries.
user: two, six, seven
interviewer: Got it.
interviewer: Last three — fantasy, war stories, animation.
user: three, eight, five
interviewer: Got it.
interviewer: Sci-fi scored high — space opera, dystopia, time travel?
user: 8, 9, 10
interviewer: Love that.
interviewer: Crime scored high — serial killers, heists, courtroom?
user: serial killers ten, heists six, courtroom four
interviewer: Love that.
interviewer: War scored high — World War Two, modern conflict, war drama?
user: nine, five, seven
interviewer: Love that.
interviewer: How you watch, one to ten — subtitles, slow burns, black-and-white.
user: love it, 9, 2
interviewer: Strong opinions — good.
interviewer: Endings — twists, bleak endings, feel-good.
user: 10, 7, 3
interviewer: Strong opinions — good.
interviewer: Last one — long films, series you can binge, rewatching favourites.
user: 6, 9, 4
interviewer: Love that.
interviewer: Now name one you genuinely loved.
user: Prisoners
interviewer: Good one.
interviewer: And one you couldn’t finish.
user: Emily in Paris
interviewer: Noted.
```

- **11 meaningful turns**, 29 taste signals, spec audit clean (`[]`)
- **Drilled:** sci-fi (10), crime (9), war (8) — in score order
- **Skipped, correctly:** comedy (4), horror (2), romance (6), documentary (7 —
  qualified but beaten by three stronger genres), fantasy (3), animation (5)
- **Preference events:** `voice:prisoners` → `seen_liked/loved`,
  `voice:emily-in-paris` → `seen_disliked/disliked`, both
  `source=voice_interview`

The pathological user who rates everything low is also covered: they earn **no**
drill-downs and still reach the 8-turn floor, via a third anchor rather than a
drill-down they did not earn.

## Answer parsing

`numberParse.ts` handles how people actually answer a grouped question:

| Said | Read as |
| --- | --- |
| `10, 7, 3` | 10, 7, 3 |
| `ten ten seven` | 10, 10, 7 |
| `love it, six, absolutely not` | 9, 6, 1 |
| `crime ten, comedy seven, sci-fi three` | label-anchored |
| `sci-fi three, crime ten, comedy seven` | label-anchored — **not** positional |

That last row is the one that matters: read positionally, an out-of-order answer
inverts the user's taste. When two or more labels are named, labels win over
order. `se7en` is not read as a 7. Out-of-scale numbers clamp. A short answer
reports which items are missing rather than inventing values.

## Access model

`/voice-dna` is a **normal product surface**, not a founder tool. It uses the
same session model as the Taste Quiz: signed in, or the anonymous guest that
middleware mints because `/voice-dna` is in `PROTECTED_PREFIXES` ("no account
needed to explore"). A session is still required — the interview's answers have
to be saved against someone — but founder status is not.

Founder gating survives in exactly one place: `/voice-dna/audition`, the
diagnostic that compares vendor voices.

## Turning voice on

**The key is the switch.** A configured `OPENAI_API_KEY` means Realtime; no key
means the keyless browser-speech fallback. There is no second opt-in — requiring
one only produced deployments that had every ingredient for real speech and
silently served the degraded path. `VOICE_INTERVIEW_ENABLED` survives only as an
explicit OFF switch (`0`/`false`/`off`), so voice can be killed on a deployment
without pulling the key the rest of the app shares.

## What still needs live deployment

Nothing above does. These four do:

1. **Real speech in and out** — OpenAI Realtime over WebRTC, or the browser Web
   Speech fallback. Needs a deployed origin.
2. **Real persistence and `preference_events`** against a normal WatchVerd1ct
   session. Migration `0047` (`voice_interviews`) is **already applied** to the
   project, so this is a verification step, not a migration step.
3. **Hands-free behaviour in a browser** — microphone permission, auto-advance
   between questions, barge-in, and no-dead-air timing.
4. **Voice-quality audition** — picking the interviewer voice on real audio.
