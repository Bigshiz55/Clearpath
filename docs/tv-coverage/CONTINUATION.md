# Schedule acquisition — exact continuation point

Branch `claude/watch-verdict-app-wwbtbg`. Read
`SOURCE_RIGHTS_REGISTRY.md` first — it is authoritative on what may be used.

## Done

- Rights registry with Tiers A–E and live-verified evidence per source.
- Discovery sweep across the nine priority networks' press rooms, robots and
  feeds (findings in the registry).
- TVmaze measured: 7,476 future airings / 75 US networks via `/schedule/full`.
  **Only one endpoint has been harvested. The real ceiling is unmeasured.**

## Not started — build in this order

1. **Exhaust TVmaze.** `/schedule/full`, `/schedule?country=US&date=`,
   `/schedule/web`, `/shows/:id/episodes`, `/episodesbydate`, `/updates/shows`
   (incremental), full `/shows` index paginated. Cross-join network → show →
   episode. Report per-channel delta vs today's 12-channel allowlist.
2. **Schema + provenance.** Extend `tv_airings` (migration 0032 already has
   provider id, UTC times, `is_complete`, premiere/repeat/live,
   `start_confidence`, `raw_hash`, `source`). Add: `source_url`, `source_tier`,
   `review_state`, `match_confidence`, `risk_level`, TMDB/TVmaze ids.
3. **Rights gate in code.** Ingest refuses any source whose registry tier is E,
   or C without its feature flag on. Per-source kill switch. Not a convention —
   a guard with a test proving it refuses.
4. **Adapters** behind `SourceAdapter`: TVmaze (A, live), press/publicity (B),
   facts-only HTML (C, flag-off), CSV/JSON/ICS import (D), licensed feed (stub).
5. **Facts-only extraction pipeline.** AI normalizes/matches/dedupes; a
   deterministic validator rejects any row whose date, time, channel or title
   was not present in the source payload. AI may never invent a listing.
6. **Review queue**, low-confidence flagging, channel templates, dedupe across
   sources preserving provenance, last-known-good retention, coverage +
   freshness dashboard, correction/takedown workflow.
7. **Measure per network, separately:** premiere coverage, original-movie
   coverage, new-episode coverage, primetime coverage, full-grid coverage,
   future days covered, automated vs reviewed.

## Blocked — needs the product owner

- **A+E press (`press.aenetworks.com`) is `Disallow: /`.** Blanket explicit
  prohibition. This is the press route for **Lifetime and LMN**. Flagged per
  the standing instruction. Only written permission from A+E unblocks it.
- **Hallmark press portal** — press access **APPLIED FOR by the product owner
  (2026-08-04)**. Approval status not yet confirmed. Before Phase 5 TV work,
  ask whether access was granted; if it was, the credentialed portal becomes
  the primary Hallmark premiere source. Do not bypass the login under any
  circumstances, including while the application is pending.
- **WBD press (ID, TCM) returns 403** to us; re-check or apply for access.

## Standing constraints

No hiding/randomizing sources, no evasion, no bypassing logins, paywalls,
CAPTCHAs, rate limits or technical protections, no identity rotation, no
misrepresenting WatchVerd1ct. Do not purchase a commercial feed. Keep TVmaze
data tagged to its source with attribution and ShareAlike traceable per row.
Packs do not need a 24h grid — premieres, originals, franchises and new
episodes are the target; infomercials and overnight filler are not.
