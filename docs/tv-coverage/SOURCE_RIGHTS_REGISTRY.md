# Source rights registry

The authoritative record of what WatchVerd1ct is allowed to use. Nothing may
be ingested into production unless it is listed **PERMITTED** here with its
supporting authorization recorded.

## Classification

| Status | Meaning |
|---|---|
| `PERMITTED` | An API, feed, licence, or written terms clearly allow our use |
| `REQUIRES_PERMISSION` | A useful source exists, but commercial extraction or republication is not clearly authorized |
| `PROHIBITED` | The applicable terms expressly prohibit automated extraction or commercial reuse |
| `UNKNOWN` | Not yet reviewed |

## Two rules that this file exists to enforce

1. **robots.txt is not a licence.** It governs crawler behaviour. It grants no
   right to extract, store, or republish content commercially. A permissive
   `Disallow:` is not evidence of authorization and must never be recorded as
   the basis for `PERMITTED`.
2. **Administrator review does not create rights.** A human approving an
   extraction after the fact does not change the source's Terms of Use. The
   review queue is a DATA-QUALITY control, not a RIGHTS control. Routing an
   unauthorized source through review keeps it unauthorized.

Both rules are written down because both were got wrong once already, on this
project, in exactly these words.

## Current register

| Source | Status | Basis | Notes |
|---|---|---|---|
| **TVmaze API** | `PERMITTED` | CC BY-SA, stated at tvmaze.com/api: *"the data can freely be used for any purpose, as long as TVmaze is properly credited as source and your usage complies with the ShareAlike provision."* | Attribution mandatory (link back). **ShareAlike is copyleft** and attaches to derived data — an accepted obligation, not a resolved one. Rate limit ≥20 calls/10s. |
| TMDB | `PERMITTED` | Existing API terms, already in use | No channel schedules — episode air dates only. Enrichment, never a guide source. |
| Administrator-authored data | `PERMITTED` | Created by us | First-party. |
| Licensed API / authorized feed / supplier-provided CSV or JSON | `PERMITTED` on receipt | Per that supplier's contract | Record the authorization alongside the adapter. |
| **Lifetime / LMN (`mylifetime.com`)** | `REQUIRES_PERMISSION` | Schedule is retrievable and parses cleanly (verified 2026-08-04: 28 listings, full 24h grid). **No authorization for commercial reuse.** | Retrievability is not permission. Do not ingest. |
| **Investigation Discovery** | `REQUIRES_PERMISSION` | robots.txt permissive only | Explicitly may **not** be marked permitted on robots.txt or visible HTML alone. |
| **Oxygen True Crime** | `REQUIRES_PERMISSION` | robots.txt permissive only | As above. |
| **Hallmark Channel / Mystery / Family** | `UNKNOWN` | `hallmarkchannel.com` did not respond to our request | Not reviewed. Absence of a response is not a finding either way. |
| **Great American Family (`gactv.com`)** | `REQUIRES_PERMISSION` | `llms.txt` allows retrieval, disallows training | Says nothing about commercial republication of schedules. |
| **TCM (`tcm.com`)** | `REQUIRES_PERMISSION` | robots.txt permissive only | Not reviewed for commercial terms. |
| Schedules Direct | `PROHIBITED` for our use | Not licensed for our commercial use (per product owner) | Do not purchase or activate. |
| iptv-org/epg and community XMLTV grabbers | `PROHIBITED` | Operate by scraping sites whose terms forbid automated retrieval | Using them would launder a prohibited scrape through a third party. |
| Pluto TV / Samsung TV Plus / Plex / Tubi internal EPG endpoints | `PROHIBITED` | Undocumented internal APIs, no grant of automated access | |

## Engineering consequences

- The ingest layer must refuse any source not `PERMITTED`, as a code-level
  guard rather than a convention.
- No automatic URL fetching from Lifetime, Oxygen, Investigation Discovery,
  Hallmark, GAC or TCM is to be built while they sit above.
- The importer accepts licensed API responses, authorized feeds, supplier CSV
  or JSON, administrator-authored data, and files confirmed usable — and must
  not imply that pasting a copied network schedule confers reuse rights.
- TVmaze data stays tagged to its own source with provenance preserved, so its
  attribution and ShareAlike obligations remain traceable per row.
- Adapters are written so a licensed feed can be attached later without
  rebuilding the guide.
