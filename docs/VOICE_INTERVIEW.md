# Voice DNA Interview — operations

The Verd1ct Voice DNA Interview is a spoken, adaptive taste interview. A warm
"interviewer" talks with the user, and everything it learns is folded into the
**same** append-only `preference_events` log the Watch DNA quiz writes — there is
exactly one model of the user.

It is **founder-gated** for now and **works without any key** by degrading to a
keyless browser-speech fallback. Turning on the full OpenAI Realtime voice is a
deliberate, double-gated owner action.

## What the owner sets in Vercel Production

| Env var | Required? | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | for realtime voice | The server-only OpenAI key. Never `NEXT_PUBLIC_`, never returned to the browser. Absent → fallback. |
| `VOICE_INTERVIEW_ENABLED` | for realtime voice | Set to exactly `1` to opt the Realtime path in. Anything else → fallback. |
| `VOICE_INTERVIEW_VOICE` | optional | Realtime voice id. Default `sage` (warm). e.g. `alloy`, `verse`, `coral`. |
| `VOICE_INTERVIEW_MODEL` | optional | Realtime model id. Default `gpt-4o-realtime-preview-2024-12-17`. |

The feature enters **realtime** mode only when **both** `OPENAI_API_KEY` is
present **and** `VOICE_INTERVIEW_ENABLED=1`. Either one missing → **fallback**.
This double gate means an incidental platform key can never silently start
spending on live voice sessions.

Where to get the key: <https://platform.openai.com/api-keys>. It is the same
`OPENAI_API_KEY` the rest of the app already reads — you do not need a second
key. Never paste a real secret into this doc or any client-visible file.

## Founder gate

Every server action (`src/lib/actions/voiceInterview.ts`) and the session route
(`src/app/api/voice/session/route.ts`) re-verify the caller with
`supabase.auth.getUser()` and `isFounderOrAdminEmail(user.email)`. A non-founder
gets a hidden `404` from the route and an `ok: false` from the actions. The
allowlist lives in env (`ADMIN_EMAILS`, `FOUNDER_*_EMAIL`) — there is no database
flag a user could flip.

## The two modes, end to end

**realtime** (key present + enabled):
1. Browser `POST`s `/api/voice/session`.
2. The route founder-gates, then POSTs `https://api.openai.com/v1/realtime/sessions`
   with the server key, the interviewer system prompt, the `record_signal` /
   `acknowledge_contradiction` tools, input/output transcription, and server-VAD
   turn detection (for barge-in).
3. The route returns only the short-lived `client_secret` + `model` +
   `mode: 'realtime'`. The browser opens a WebRTC session with that ephemeral
   secret. The server key never leaves the server.
4. As the user talks, the model calls `record_signal`; the client forwards those
   signals to `recordInterviewTurn`, which advances the engine and persists.

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
