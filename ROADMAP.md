# Roadmap

## Now (blocked on owner)
- Deploy to Vercel + configure Supabase Auth URLs → live public URL.
- Run the live TEST_MATRIX (required search set + user journeys).

## Next (safe, no new services required)
- Multiple named watchlists + move-between-lists UI (schema already supports it).
- "Because you liked X" home rails from verdict history.
- Richer content signals from TMDB keywords + external content-advisory sources
  (only where data is responsibly supported).

## Later (needs a decision/possible cost)
- Additional availability provider (Watchmode/JustWatch API) for broader,
  fresher streaming data.
- Franchise auto-detection to auto-seed "favorite franchise" boosts.
- Next.js 16 upgrade to clear remaining (non-applicable) audit advisories.
- Optional AI recommendation summaries (OpenAI) surfaced in the UI.

## Guardrails for all future work
Scoring stays deterministic and authoritative; secrets stay server-only; RLS on
every user table; never fabricate data; keep the app runnable and green.
