# Source rights registry (Tiers A–E)

Authoritative record of what WatchVerd1ct may use. Posture set by the product
owner: **in genuine gray areas take the most aggressive defensible position,
implemented in the most conservative way.** Legal ambiguity is not a reason to
stop engineering — it is a reason to build the adapter, document the risk, and
leave production activation as a business decision.

Never permitted, regardless of tier: hiding or randomizing sources, removing
provenance, evading detection, bypassing logins/paywalls/CAPTCHAs/rate
limits/technical protections, rotating identities or IPs, or misrepresenting
WatchVerd1ct.

## Tiers

- **A — Clearly permitted.** API, open licence, authorized feed, written
  permission, or terms clearly allowing commercial use. Automatic in production.
- **B — Press & publicity.** Press rooms, programming highlights, media
  releases, premiere calendars, press kits. Extract *minimum factual fields
  only* (network, title, date, airtime, premiere status, episode name). Never
  promotional prose, layout, photography or artwork. Link back.
- **C — Public facts, ambiguous terms.** No account, no payment, no clickwrap
  accepted, no circumvention, visible in normal HTML/structured data, factual
  fields only, no source-specific prohibition on this exact use. Facts only,
  infrequent polling, aggressive caching, attribution, link-back, per-source
  kill switch, immediate removal support, risk recorded.
- **D — Administrator / partner supplied.** CSV, JSON, ICS, feeds, or data from
  admins, partners, distributors, publicists, networks, creators. Fast
  review-and-publish.
- **E — Explicitly prohibited / technically restricted.** Do not retrieve.
  Record exactly what blocks it and what permission would unblock it.

## Register — verified live 2026-08-04

| Source | Tier | Evidence |
|---|---|---|
| **TVmaze API** | **A** | CC BY-SA at tvmaze.com/api: *"the data can freely be used for any purpose, as long as TVmaze is properly credited as source and your usage complies with the ShareAlike provision."* Attribution mandatory; ShareAlike copyleft attaches to derived data. ≥20 calls/10s. |
| **TMDB** | **A** | Existing API terms. Enrichment only — no channel schedules. |
| **Administrator / partner supplied** | **D** | First-party or supplied under that supplier's terms. |
| **Hallmark press — `press.hallmarkmedia.com`** | **B (high priority)** | Redirects to `press-hallmark-1710766222.clipsource.com`, a press-distribution platform. Public `/post/…` press releases carry premiere and programming announcements (e.g. *The Way Home* final season, Christmas in July programming event) plus `/program/…` endpoints. **No valid robots.txt** (returns HTML). Also exposes `/login` and `/access/application` — a credentialed press portal. **Do not bypass the login.** Public posts only. **Best route: apply for press access — see continuation doc.** |
| **A+E press — `press.aenetworks.com`** (Lifetime, LMN) | **E — FLAGGED** | robots.txt is exactly `User-agent: *` / `Disallow: /`. A blanket, explicit prohibition on automated retrieval. **This is the press route for Lifetime and LMN and it is closed.** Unblocked only by written permission from A+E. |
| **WBD press — `press.wbd.com`** (ID, TCM) | **UNKNOWN / blocked** | Returns 403 to us. Not a stated prohibition; we simply cannot read it. Re-check from a normal browser session or apply for press access. |
| **NBCU press — `nbcumv.com`** (Oxygen) | **UNKNOWN** | Redirects to `/mediavillage`, 1.7 KB. Not yet characterised. |
| Lifetime / LMN site (`mylifetime.com`) | **C** | Full 24h grid verified parseable (28 listings, `data-starttime` + `show-name`). robots.txt allow-all. No account/payment/clickwrap. Facts-only extraction defensible; commercial republication not expressly authorized. Build behind flag. |
| Investigation Discovery site | **C** | robots.txt `Allow: /`. Not yet content-verified. |
| Oxygen site | **C** | robots.txt permits schedule paths (disallows are Drupal admin/user only). Not yet content-verified. |
| TCM (`tcm.com`) | **C** | robots.txt blocks `/search*` only. Sitemap returns 403. |
| Great American Family (`gactv.com`) | **C** | `Allow: /` plus `llms.txt` granting retrieval, `Disallow-Training: /`. We do not train — honour that. |
| Schedules Direct | **E — REJECTED, DO NOT RE-PROPOSE** | Owner decision, 2026-08-11. Their published terms restrict listings to PERSONAL use with NONCOMMERCIAL software, and memberships to NATURAL PERSONS — none of which fits WatchVerdict's public, distributable product. Do not create an integration, trial, proof of concept, schema, dependency, credential request, or fallback around it. The ~$35/yr price has made it look like an easy answer more than once; it is not an answer at this price or any other without written authorization for this exact use. |
| iptv-org / community XMLTV grabbers | **E** | Operate by scraping sites whose terms forbid it. |
| Pluto / Samsung TV Plus / Plex / Tubi internal EPG endpoints | **E** | Undocumented internal APIs, no grant of automated access. |

## Standing rejections — do not re-recommend these

Written out because each has been proposed at least once by someone reading
only the price or the robots.txt:

- **Schedules Direct — rejected on licence, not on cost.** See the table. An
  earlier report in this directory recommended it as "the cheapest credible
  path"; that recommendation is WITHDRAWN and the report carries a correction.
  Cheap and unlicensed is not a path.
- **Scraping TVGuide, Zap2it, TitanTV, or any channel website** in violation of
  its terms. Includes doing it indirectly through an aggregator: laundering a
  prohibited scrape through a third party does not change what it is.
- **Community XMLTV grabbers and internal FAST-service EPG endpoints**, for the
  same reason.

A source moves off this list only by written authorization for WatchVerdict's
actual public/distributable use — not by a permissive robots.txt, not by an
administrator approving an extraction after the fact, and not by the absence of
an explicit prohibition.

## Two rules this file exists to enforce

1. **robots.txt is not a licence.** It governs crawler behaviour and grants no
   commercial reuse rights. It may support a Tier C classification; it may
   never by itself justify Tier A.
2. **Administrator review does not create rights.** Approving an extraction
   after the fact changes nothing about a source's terms. The review queue is a
   data-quality control, not a rights control.

Both are recorded because both were got wrong once on this project.
