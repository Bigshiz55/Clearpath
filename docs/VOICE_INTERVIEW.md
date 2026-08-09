# Voice DNA Interview — operations

The Verd1ct Voice DNA Interview is a spoken taste interview on a deliberate,
scripted spine. A warm "interviewer" talks with the user, and everything it
learns is folded into the **same** append-only `preference_events` log the Watch
DNA quiz writes — there is exactly one model of the user.

It is **public** (open to everyone) and **works without any key** by degrading to
a keyless browser-speech fallback. Turning on the full OpenAI Realtime voice is a
deliberate, double-gated owner action.

## The scripted flow (Stage 1 → drill-down → prefs → anchors)

The interview walks a fixed shape (`src/lib/voice/interview/stages.ts`,
`planDirective`), while the pure engine still folds every answer into confidence
and the DNA:

1. **Genre triage** — rapid-fire grouped genre triples ("horror, comedy, or
   crime?"). Four quick triples map the broad landscape in under a minute.
2. **Adaptive drill-down** — reads what lit the user up in triage and digs into
   that corner (crime → heists vs. detectives vs. serial-killers).
3. **Viewing preferences** — pacing, tone, violence tolerance, subtitles.
4. **Title anchors** — one they loved, one they couldn't finish.

A live contradiction still preempts the script (the engine reconciles it), and
the hard turn cap still guarantees termination.

## Turn architecture (deterministic, race-free)

The **app authors every line**; the Realtime model is only the voice. The session
is minted with `turn_detection: { type: 'server_vad', create_response: false,
interrupt_response: true }`, so the model **never** speaks on its own — it speaks
only the exact scripted line the app hands it via `response.create`
(`speakLinePayload`), then stops and listens. The user's speech is transcribed;
the engine derives a taste signal from the transcript with the SAME pure
`deriveSignal` the keyless fallback uses, and drives exactly one turn per
utterance (`onUserTurn`) — an empty answer still advances to the next line, so the
loop can never dead-end after one answer. `interrupt_response` allows barge-in.
No tools are used in this path.

Defaults: model `gpt-realtime`, voice `marin` (both env-overridable via
`VOICE_INTERVIEW_MODEL` / `VOICE_INTERVIEW_VOICE`).

## What the owner sets in Vercel Production

| Env var | Required? | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | for realtime voice | The server-only OpenAI key. Never `NEXT_PUBLIC_`, never returned to the browser. Absent → fallback. |
| `VOICE_INTERVIEW_ENABLED` | for realtime voice | Set to exactly `1` to opt the Realtime path in. Anything else → fallback. |
| `VOICE_INTERVIEW_VOICE` | optional | Realtime voice id. Default `marin` (warm). e.g. `cedar`, `alloy`, `verse`. |
| `VOICE_INTERVIEW_MODEL` | optional | Realtime model id. Default `gpt-realtime`. |

The feature enters **realtime** mode only when **both** `OPENAI_API_KEY` is
present **and** `VOICE_INTERVIEW_ENABLED=1`. Either one missing → **fallback**.
This double gate means an incidental platform key can never silently start
spending on live voice sessions.

Where to get the key: <https://platform.openai.com/api-keys>. It is the same
`OPENAI_API_KEY` the rest of the app already reads — you do not need a second
key. Never paste a real secret into this doc or any client-visible file.

## Access

The interview is **public**. A signed-in user gets the full persisted, RLS-scoped
experience (state saved to `voice_interviews`); a signed-out visitor gets an
ephemeral, client-carried interview that persists nothing. The server actions
(`src/lib/actions/voiceInterview.ts`) resolve identity with
`supabase.auth.getUser()` and never throw — auth-unavailable simply means the
anonymous path.

## The two modes, end to end

**realtime** (key present + enabled):
1. Browser `POST`s `/api/voice/session`.
2. The route POSTs `https://api.openai.com/v1/realtime/sessions` with the server
   key, the verbatim-delivery instructions, `tool_choice: 'none'`, user
   transcription, and `server_vad` turn detection with `create_response: false` +
   `interrupt_response: true` (the app drives every turn; barge-in on).
3. The route returns only the short-lived `client_secret` + `model` +
   `mode: 'realtime'`. The browser opens a WebRTC session with that ephemeral
   secret. The server key never leaves the server.
4. The app speaks each scripted line via `response.create`; the user's transcript
   is turned into a `TasteSignal` by the pure `deriveSignal`, and each utterance
   advances exactly one turn through `recordInterviewTurn`.

**fallback** (no key or not enabled — the keyless path):
1. Browser `POST`s `/api/voice/session`; the route returns `200`
   `{ mode: 'fallback' }` (never an error).
2. The client uses the browser's own Web Speech API (SpeechRecognition +
   SpeechSynthesis). A lightweight interpreter derives the same `TasteSignal`
   shape from the recognized text and forwards it to `recordInterviewTurn`.
3. Everything downstream — the pure engine, persistence, the DNA reveal — is
   identical. Only the speech I/O differs.

An upstream OpenAI failure is also handled by degrading: the route answers `200`
`{ mode: 'fallback', error }` rather than a `500`, so the UI can always fall
back rather than dead-end.

## Resume

Interview state is one row in `voice_interviews` (migration 0047), keyed by the
engine's own `state.id`, with the full `InterviewState` in a `jsonb` column and
`status` / `overall_confidence` mirrored out for cheap querying. RLS restricts
every row to its owner.

`startOrResumeInterview()` loads the user's most recent `status = 'active'` row
and continues it exactly where it left off; only if there is none does it mint a
fresh interview. Each turn upserts the row, so a dropped connection or a page
reload never loses progress. `completeInterview` marks the row complete and
writes the taste into `preference_events` (idempotently — stable event ids,
upsert ignore-duplicates), and `abandonInterview` marks it abandoned.

## Cost & safety posture

- No LLM call in any listing/grid path. The only live model call is the Realtime
  voice session itself, gated behind founder + key + explicit enable.
- The server key is never exposed; only the ephemeral `client_secret` reaches the
  browser.
- Env is read at request time, so `next build` succeeds with no secrets set.
