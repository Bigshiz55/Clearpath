# Changelog

## [Unreleased] — completion pass 2 (2026-07-14)
### Added
- **Headline verdict**: prominent `WATCH IT / MAYBE / SKIP IT` banner at the top
  of every report and share page (derived from the personalized tier).
- **Critic ratings**: optional OMDb adapter (`OMDB_API_KEY`) adds IMDb, Rotten
  Tomatoes, and Metacritic scores; blended transparently into the general score.
  Fully graceful when unset — no fabricated ratings.
- **More like this**: TMDB recommendations (with `/similar` fallback) shown on
  each verdict.
- **Voice search**: microphone button using the Web Speech API where supported.
- **Search resilience**: falls back to dedicated movie/TV endpoints when
  multi-search returns nothing, so search never dead-ends.
- Source-of-truth/state docs and `OWNER_INSTRUCTIONS.md`.
### Changed
- Health endpoint and `.env.example` document the optional `OMDB_API_KEY`.
- Migration now resets the app's own tables first so it applies cleanly over a
  prior/partial schema (fixes `42703 column "user_id" does not exist`).
### Tests
- 25 passing (added primary-call mapping, critic-rating integration, honest
  no-critic-data handling).

## [1.0.0] — initial build (2026-07-14)
Full WatchVerdict app: deterministic scoring engine (WatchVerdict + Personal
Match), TMDB integration, Supabase auth + RLS schema, verdict report, watchlist,
public shares, PWA, health, security hardening. 21 tests, build/lint/typecheck
green.
