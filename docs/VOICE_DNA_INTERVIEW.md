# Voice DNA Interview — architecture, vendor choice, owner actions

A hands-free, voice-first ~30–50s interview (60s hard ceiling) that builds a
starting VERD1CT DNA profile from a cold start. **Claude understands; WatchVerd1ct
verifies. Qualify first, personalize second.** Gated behind a flag; inactive
until the owner adds keys.

## Vendor choice (selected — swappable behind interfaces)

| Layer | Vendor | Why | Fallback |
|---|---|---|---|
| **STT** | **Deepgram** (Nova, streaming WS) | Lowest practical latency; best accuracy on **short numeric** answers ("10, 7, 3"); built-in endpointing/VAD for **barge-in**; strong mobile; ~$0.0043/min | Browser Web Speech (dev/local only) |
| **TTS** | **ElevenLabs** (Flash v2.5 streaming) | Best **natural voice quality**; real **British/Australian female** voices for the audition; ~75ms first-byte streaming; cancelable stream for barge-in | Browser `speechSynthesis` (dev/local only) |
| **Interpreter** | **Anthropic** via the existing `AiProvider` | Reuses the audited provider-neutral AI layer + typed tool boundary; no new LLM vendor | Deterministic quick-tap |

The heavy streaming runs **browser ↔ vendor directly** — Vercel serverless
cannot hold a long-lived audio socket. A short Vercel route mints a **scoped,
expiring token**; the long-term secret stays server-only and never reaches the
bundle. This mirrors the repo's existing "offload sockets to an external
service" pattern (Supabase Realtime for Court).

## Estimated cost per completed interview (~45s)

- STT (Deepgram, ~45s streamed): **~$0.003**
- TTS (ElevenLabs, ~250 characters spoken across prompts): **~$0.01–0.02** depending on plan
- LLM (Anthropic answer interpretation, ~6 short calls, cached system prompt): **~$0.01–0.03**
- **Total ≈ $0.03–0.05 per completed interview.** (Order-of-magnitude; confirm against your negotiated plan.)

## Owner actions (the feature stays gated until these exist)

Add as **server-only** environment variables (no `NEXT_PUBLIC_` prefix; never commit):

```
DEEPGRAM_API_KEY=...            # streaming STT
ELEVENLABS_API_KEY=...          # streaming TTS
ELEVENLABS_VOICE_ID=...         # the chosen voice AFTER the founder audition
DNA_VOICE_INTERVIEW_ENABLED=    # leave blank; founders are always enabled. "true" = global
# optional, only to pre-seed the audition shortlist with real vendor ids:
VOICE_AUDITION_ID_1=... VOICE_AUDITION_ID_2=... VOICE_AUDITION_ID_3=...
```

The founder **voice audition** (built with the key) lists ElevenLabs' real voice
library and lets you pick `ELEVENLABS_VOICE_ID` without touching product code.
Shortlist to compare: **Alice** (British, warm), **Matilda** (Australian-leaning,
natural), **Jessica** (British/international, cool). We never hardcode an
unverified vendor voice id.

## Architecture (separation of concerns)

```
Mic → Deepgram STT (browser WS, ephemeral token)
    → partial/final transcript + VAD  (two INDEPENDENT signals; mic level ≠ transcript)
    → Interview Orchestrator (Anthropic interprets the answer → validated scores)
    → Deterministic DNA updater  (WatchVerd1ct owns the profile)
    → Next-question selector (pure state machine, time-aware)
    → ElevenLabs TTS (browser stream, ephemeral token) → Speaker
```

- **DNA is written only through the existing choke point** `recordEvents` →
  `preference_events`, via the retired-but-kept `src/lib/taste` bridge
  (`toPreferenceEvents`, `source: 'voice_interview'`). No parallel taste model.
- **Claude interprets, never invents facts.** It maps "dubbed in English" → an
  English-dub requirement; it never claims a title *has* a dub — that is verified
  data. Title anchors resolve to canonical ids through the typed tool boundary
  (`resolveTitle`), never model-emitted ids.
- **Privacy:** raw audio is processed for transcription and discarded; only
  structured DNA signals + resolved anchors persist. Telemetry is metadata-only
  (durations, counts, enums) — never audio or transcript text.

## What is built in this PR (foundation, no key required)

- `src/lib/voice/numberParse.ts` (+ test) — natural-language 1–10 answer parser;
  passes every required numeric case ("10, 7, 3", "ten ten seven", "love it,
  six, absolutely not", "crime ten, drama seven, comedy three", …) plus
  count-mismatch repair and scale clamping.
- `src/lib/voice/questionBank.ts` — the typed four-stage question taxonomy.
- `src/lib/voice/interview.ts` (+ test) — the pure, time-aware state machine:
  adaptive drill selection, smart-skip of disliked genres, 60s ceiling / 55s
  anchor deadline.
- `src/lib/voice/providers/types.ts` — provider-neutral STT/TTS interfaces +
  ephemeral-token minting boundary.
- `src/lib/voice/config.ts` — server-only key reads, gating helper, founder
  audition shortlist, health snapshot (booleans only).

## Roadmap (subsequent PRs, still gated)

1. Vendor adapters: Deepgram STT stream + ElevenLabs TTS playback + ephemeral
   token routes; browser fallback adapters for local dev.
2. DNA mapping server action (`recordEvents`, zod boundary) + title-anchor
   resolution via `resolveTitle`.
3. Client interview UI: single ▶ button, live transcript (partial vs final),
   score animate-in, barge-in, no-dead-air states, quick-tap accessibility
   fallback, `prefers-reduced-motion`/SR/keyboard.
4. Founder audition page + AI-mode/voice health in founder diagnostics.
5. Telemetry events; adversarial interview fixtures; real-browser proof.
6. Rollout: founder → shadow → limited, only after real production proof.

**Status: AI foundation present. Not active.** No keys configured; the interview
is gated and degrades to quick-tap.
