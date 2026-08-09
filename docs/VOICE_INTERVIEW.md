# Voice DNA Interview — operations

The Verd1ct Voice DNA Interview is a spoken, adaptive taste interview. A warm
"interviewer" talks with the user, and everything it learns is folded into the
**same** append-only `preference_events` log the Watch DNA quiz writes — there is
exactly one model of the user.

It is a **normal product surface** and **works without any key** by degrading to
a keyless browser-speech fallback. Adding `OPENAI_API_KEY` is all it takes to
turn on real spoken voice.

## What the owner sets in Vercel Production

| Env var | Required? | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | for realtime voice | The server-only OpenAI key. Never `NEXT_PUBLIC_`, never returned to the browser. **Present → Realtime. Absent → fallback.** |
| `VOICE_INTERVIEW_ENABLED` | no | An explicit OFF switch only. `0`/`false`/`off` disables voice without pulling the shared key. Absent means ON. |
| `VOICE_INTERVIEW_VOICE` | optional | Realtime voice id. Default `sage` (warm). e.g. `alloy`, `verse`, `coral`. |
| `VOICE_INTERVIEW_MODEL` | optional | Realtime model id. Default `gpt-4o-realtime-preview-2024-12-17`. |

**The key is the switch.** This used to demand a second opt-in
(`VOICE_INTERVIEW_ENABLED=1`) on the theory that an incidental platform key
should not start spending on live voice. Under the current architecture the
spoken interview IS the product, and that second gate only produced deployments
which had every ingredient for real speech and silently served the degraded
browser path instead.

Where to get the key: <https://platform.openai.com/api-keys>. It is the same
`OPENAI_API_KEY` the rest of the app already reads — you do not need a second
key. Never paste a real secret into this doc or any client-visible file.

## Who can use it

The interview uses the **same session model as the Taste Quiz**: signed in, or
the anonymous guest session middleware mints (`/voice-dna` is in
`PROTECTED_PREFIXES`, so "no account needed to explore" holds here too). A
session is still required — the answers have to be saved against someone — so an
unauthenticated API call still gets a hidden `404`, and every read and write is
scoped to the caller's `userId` on top of RLS.

**Founder gating survives in exactly one place:** `/voice-dna/audition`, the
diagnostic that compares vendor voices. That page still uses
`isFounderOrAdminEmail` and returns a hidden `404` to everyone else.

## The two modes, end to end

**realtime** (key present, not switched off):
1. Browser `POST`s `/api/voice/session`.
2. The route verifies a session exists, then POSTs `https://api.openai.com/v1/realtime/sessions`
   with the server key, the interviewer system prompt, the `record_signal` /
   `acknowledge_contradiction` tools, input/output transcription, and server-VAD
   turn detection (for barge-in).
3. The route returns only the short-lived `client_secret` + `model` +
   `mode: 'realtime'`. The browser opens a WebRTC session with that ephemeral
   secret. The server key never leaves the server.
4. As the user talks, the client forwards the RAW TRANSCRIBED UTTERANCE to
   `recordScriptedTurn`, which parses it against the question actually asked,
   advances the engine and persists. The model's own `record_signal` output is
   ignored in this flow — acting on both would score one answer twice, from two
   different interpreters.

**fallback** (no key, or voice switched off — the keyless path):
1. Browser `POST`s `/api/voice/session`; the route returns `200`
   `{ mode: 'fallback' }` (never an error).
2. The client uses the browser's own Web Speech API (SpeechRecognition +
   SpeechSynthesis) and forwards the recognised text to the same
   `recordScriptedTurn` action. Interpretation lives on the server either way,
   which is why speech, the typed fallback and the tests behave identically.
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
  voice session itself, which requires a signed-in session and a configured key.
- The server key is never exposed; only the ephemeral `client_secret` reaches the
  browser.
- Env is read at request time, so `next build` succeeds with no secrets set.
