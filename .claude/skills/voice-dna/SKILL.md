---
name: voice-dna
description: >-
  Development guidance for WatchVerdict's Voice DNA interview — the pure
  interview engine, resumable session state, and how spoken taste flows into the
  ONE shared preference model. Use when editing src/lib/voice/*, the
  /api/voice/session route, or src/lib/actions/voiceInterview.ts.
---

# voice-dna — changing the voice interview

## Golden rules (do not violate)
1. **One model of the user.** Named-title reactions from the interview become
   ordinary graded `preference_events` via `signalsToPreferenceEvents`
   (`src/lib/voice/interview/dnaUpdate.ts`). Never invent a parallel taste store
   or write fake title rows for genre/axis claims.
2. **The engine owns the state shape.** `InterviewState` (the pure engine's
   single source of truth) is stored verbatim in `voice_interviews.state`
   (jsonb); `status` + `overall_confidence` are mirrored only for cheap
   resume queries. Don't split the state across columns.
3. **Resumable + idempotent.** The interview id (`interview:<userId>:<startedAtMs>`)
   is minted inside the state and round-trips on every turn; upserts are
   dedup-by-id. Re-completing must be safe (event ids are stable).
4. **No key ⇒ graceful fallback.** `/api/voice/session` returns
   `{mode:'fallback'}` (200) when the realtime key is absent. Never hard-fail.
5. **Migration 0033 (`voice_dna_sessions`) is retired** and deliberately
   excluded — do not revive it. The live table is `voice_interviews` (0047).

## Step 1 — Test the engine purely
Drive `InterviewState` transitions in a unit test; assert signals, claims,
contradictions, and confidence. No I/O.

## Step 2 — Verify the funnel
When taste changes, assert the resulting `preference_events` (source
`voice_interview`) — that is where voice enjoyment must land, and it triggers a
temporal taste snapshot (see taste-dna skill).

## Step 3 — Gates
`npm run typecheck && npm run lint && npx vitest run && npm run build`, plus the
voice product-flow E2E where the interview UI changed.

## Notes
- Genre/axis claims stay in the interview's confidence/reveal layer — they are
  not written as title rows. Keep that boundary.
