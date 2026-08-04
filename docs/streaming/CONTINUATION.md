# Streaming Intelligence Engine — continuation

Branch `claude/watch-verdict-app-wwbtbg`. Sibling system to the TV guide, but
a DIFFERENT shape: streaming is release/window intelligence, not a grid.

Rights posture and Tiers A–E are inherited from
`../tv-coverage/SOURCE_RIGHTS_REGISTRY.md`. Same standing constraints: no
hiding or randomizing sources, no evasion, no bypassing logins, paywalls,
CAPTCHAs, rate limits or technical protections, no identity rotation, no
misrepresenting WatchVerd1ct. Facts only from Tier B/C, provenance retained,
per-source kill switches, attribution and link-back.

## BUILD ON WHAT EXISTS — do not duplicate

WatchVerd1ct already has an availability layer that must be EXTENDED, not
replaced:

- `src/lib/watchmode/cardAvailability.ts` — already models
  `subscription | free | rent | buy | available | none | unconfirmed`.
- `src/components/CardAvailability.tsx` — already renders the honest
  "Availability not currently confirmed" state (reliability sprint item 3).
- `src/lib/tileFacts.ts` — one availability fetch per title, shared by every
  card, with cache eviction on failure.

The canonical model in the brief (included-with-base / premium tier / add-on /
free-with-ads / library / rent / buy / coming-soon / leaving-soon / not
available / unverified) is a SUPERSET of the existing states. Widen the union
and migrate; keep `unconfirmed` as the default so nothing is ever asserted
without evidence.

**Prime Video is the hard case and drives the model.** Never infer inclusion
from a title appearing in Amazon search results. `included_with_prime`,
`prime_channel_addon` (with add-on name), `free_with_ads`, `rent`, `buy`,
`unavailable` and `unverified` must be distinct, separately evidenced states.
The same applies to any service mixing tiers, add-ons, live channels and
transactional content.

## Discovery findings — verified live 2026-08-04

| Service press source | Result |
|---|---|
| `paramountpressexpress.com` | **200.** robots disallows only image extensions (`*.gif$`, `*.jpg$`). Text/press content permitted. **Tier B, strong — start here.** |
| `press.hulu.com` | **200.** WordPress robots, `/wp-admin/` only. Content permitted. **Tier B.** |
| `britbox.com` | **200.** Disallows account paths only (`/us/account/`, `/ca/ac…`). **Tier B/C.** |
| `press.amazonmgmstudios.com` | **403** to us. Not a stated prohibition — unreadable. Re-check; consider press-access application. |
| `peacocktvpresssite.com`, `press.acorn.tv`, `press.max.com` | **Connection failed (no response).** NOT characterised. Do not record any classification for these until actually retrieved. |

## Build order

1. Widen the canonical availability model (superset above) + migration, with
   `source_url`, `source_name`, `retrieved_at`, `last_verified_at`,
   `confidence`, `region`, `tier_required`, `addon_name`, `cadence`,
   `episode_count`, `all_episodes_available`, TMDB/IMDb/TVmaze ids, raw payload.
2. Per-service `StreamingAdapter` interface — one adapter per service so one
   breaking does not disable the system.
3. Adapters for Paramount+ press, Hulu press, BritBox (permitted above).
4. Conflict handling: when sources disagree, **preserve both claims**, rank by
   source authority, and queue for review. Never silently pick one.
5. Review queue, dedupe, region validation, expired-release cleanup,
   last-known-good, freshness status, retries, unexpected-drop detection,
   takedown + manual correction.
6. Streaming Coverage Dashboard (per service: known titles, upcoming, new this
   week/month, leaving soon, weekly series tracked, last refresh, future days,
   source quality, automation %, awaiting review, stale, unverified
   availability, unmatched to TMDB).
7. Wire to New Releases, Watch Now, Search, Forensic Search, title pages,
   homepage, alerts, watchlists, Subscription Check, the three Packs, Daily
   Docket.
8. New Releases filters + **"What's new on your services"** + **"Services you
   may be missing"** (must not fabricate savings or read as an ad).
9. Upgrade Subscription Check to keep/pause/rotate guidance from real data.

## Rule for AI in this engine

May normalize, match and dedupe verified facts. May NOT invent release dates,
availability, subscription inclusion, episode counts, cadence, leaving dates,
add-on requirements, countries or watch links. A deterministic validator must
reject any field not present in the source payload.

## Prove first

Prime Video, Paramount+, Peacock, Acorn TV, BritBox — then continue until every
listed service is integrated, flagged, admin-import-only, or rejected with the
exact reason recorded.
