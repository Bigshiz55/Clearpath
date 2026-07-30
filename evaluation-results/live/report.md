# Live-Data Audit — BLOCKED

- Commit `e85503e`
- **Status: NOT RUN — `TMDB_API_KEY` is not configured in this environment.**
- This is the one blocker between offline parse verification and live
  metadata verification. The harness is complete and ready; it will run a
  budgeted (120-call) cached audit the moment a key is provided.

## What it will verify (per returned title)
- Country of origin (production_countries) — verifiable
- Original language (original_language) — verifiable
- Runtime ceiling — verifiable
- Streaming provider (watch/providers for region) — verifiable
- English audio (dub) — **reported UNAVAILABLE from TMDB by design; needs a real audio-track source**

## To run
```
TMDB_API_KEY=… node eval/live/audit.mjs --budget 120 --region US
```