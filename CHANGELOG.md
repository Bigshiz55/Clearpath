# Changelog

## [Unreleased] — completion pass 3 (2026-07-14)
### Added
- **Rating icons**: IMDb / 🍅 Tomatometer / 🍿-style audience / Metacritic / TMDB
  shown as branded pills on each verdict.
- **Recommendation consensus**: WatchVerdict call + a one-tap **Decider** "Stream
  It or Skip It" link-out + real Critics (RT) & Audience (TMDB) rows.
- **Language & episodes**: English-availability signal (native / dub available /
  subtitles) and TV episode progress ("6 of 6 released" / "4 out · ongoing").
- **Daily new-release digest**: a Vercel Cron scan (`/api/cron/daily-scan`,
  `CRON_SECRET`-protected) scores fresh releases against each user's taste and
  fills a **"New for you"** home section; Settings toggle + match threshold;
  optional email via `RESEND_API_KEY`. Migration `0002_digest.sql`.
### Notes
- No fabricated data: RT audience/Decider have no free API, so audience uses TMDB
  (labeled) and Decider is a link-out, not an invented verdict.
### Tests
- 33 passing (added English-availability, Decider URL, episode-summary helpers).

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
