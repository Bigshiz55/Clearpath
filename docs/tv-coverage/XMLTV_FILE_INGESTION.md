# XMLTV file ingestion — the file-fed full-grid architecture

Written 2026-08-15 against three REAL TV Media XMLTV deliveries (feeds
10733 / 10734 / 10735; a fourth, 10737, was referenced but not supplied).
Read `SOURCE_RIGHTS_REGISTRY.md` first — it remains authoritative on rights.

## The architecture

```
TV MEDIA XMLTV FILE (bytes/stream — any transport)
      ↓
ONE CONTROLLED IMPORTER          src/lib/viewing/ingest/xmltv/
      ↓                          (streaming, XXE-proof, zero HTTP)
CANONICAL TV TABLES              migration 0032 — unchanged schema
      ↓
LIVE TV / MOVIES / WHAT'S ON TODAY
      ↓
ALL USERS READ THE STORED TRUTH
```

The provider delivers the grid once. WatchVerd1ct imports it once. Filters,
searches, refreshes and personalization never cost another provider call.

## Source identity (decided)

Provider stays **`tv_media`** — the data's licensor, so attribution,
retention and licensing state follow the provider row. The TRANSPORT is
recorded at every level, so "where did this airing come from?" has an exact
answer:

| Level | Value |
|---|---|
| provider | `tv_media` |
| lineup | `tv_lineups.provider_lineup_id = 'xmltv:<feedId>'` |
| run | `tv_ingestion_runs.trigger = 'xmltv_file'` |
| airing | `tv_airings.source = 'xmltv_file'`, `provider_airing_id = 'xmltv:<feed>:<stationSrc>:<startIso>'` |
| metadata | `tv_programmes.metadata_source = 'tv_media_xmltv'` |

The metered API adapter is untouched and stays disabled
(`TVMEDIA_ENABLED` unset, egress denied). `hasLiveFullGridProvider()`
still answers for the API transport only; file-fed coverage carries its own
evidence (`src/lib/tv/xmltvCoverage.ts`): an enabled xmltv lineup + a
recorded successful import + **now inside the file's own proven coverage
window**. When the imported window ages out the claim expires on its own and
the guide's honesty states take over.

## What the three real files prove (measured, not estimated)

| | 10733 | 10734 | 10735 |
|---|---|---|---|
| channels | 177 | 87 | 58 |
| programmes | 31,830 | 15,138 | 12,529 |
| `Movie` rows | 2,707 | 764 | 742 |
| coverage | 08-15 00:00Z → 08-22 05:00Z (173h) | → 08-22 02:35Z (171h) | → 08-22 01:30Z (170h) |
| malformed | 0 | 0 | 0 |
| offsets | all `+0000` | all `+0000` | all `+0000` |
| in-file duplicate slots | 98 | 380 | 106 |

These are **distinct lineups over one global station universe** —
channel ids (`N.stations.xmltv.tvmedia.ca`) are shared (A&E, AMC, BBC
America appear in all three), 10734 carries Richmond, VA broadcast
affiliates, and the third `display-name` is the lineup-scoped channel
number (the same A&E is "10" in 10733 and "1" in 10735). Coverage is
**~7.1 days** — never claim 14 from these files.

## Images policy

Channel/programme icons arrive as `http://cdn.tvpassport.com/...` (TV
Media's own CDN — TV Passport is a TV Media property, not an independent
source). Policy: **never inject `http://` assets into the browser**
(`httpsOnly()` gates every rendered URL); https URLs may render; matched
catalogue titles prefer existing TMDB artwork via the existing enrichment
path; provider URLs are preserved in the import batch as source metadata.
Nothing invents artwork.

## Delivery transports (Phase 12)

`importXmltv()` takes a `StreamFactory` — any async byte source. The CLI
(`scripts/tv/importXmltv.ts`) is the local-file transport. A future SFTP
drop, object-storage download, upload endpoint or webhook is a new
factory, not a new importer; parsing is not coupled to a filesystem path.

## Health / coverage evidence (Phase 13)

Imported lineups surface through the EXISTING health path (`/api/health/tv`
reads `tv_lineups` coverage windows + `tv_ingestion_runs`). A UI may claim
full-grid coverage only with: current window includes the requested period
AND the lineup is enabled AND the last import succeeded AND the source is a
linear EPG (`xmltv:` lineups are). One successful import of one file is
evidence for exactly that file's window — nothing more.

## Source feasibility — updated classification (Phase 10)

**Network access was unavailable in the authoring session** (egress-
restricted sandbox), so rows marked ⚠ carry classifications from the
in-repo research verified on 2026-08-04 (`SOURCE_RIGHTS_REGISTRY.md`,
`SOURCE_AND_CHANNEL_REPORT.md`) and MUST be re-verified against current
official terms before any operational decision. No source below may become
an automated ingestion source merely because its schedule renders in a
browser. Lawfulness first.

| Source | Official API / feed | Automation | Classification |
|---|---|---|---|
| TV Media (API) | Yes — metered licensed API | Permitted under contract | **Licensed path** — disabled, future transport |
| TV Media (XMLTV files) | Yes — this delivery | Permitted for delivered files | **ACTIVE (this work)** — confirm redistribution/retention terms in writing |
| TV Passport | No public API; it is TV Media's consumer surface ⚠ | No | Not an independent source — same licensor; manual QA reference only |
| TitanTV | Consumer guide; a business/licensing contact path exists ⚠ | No (terms) | **Worth a commercial inquiry** — until then manual QA only |
| Zap2it / Gracenote | Gracenote is the licensed upstream; public grid WAF-blocked ⚠ | No | Commercial licensing path = Gracenote/Schedules Direct; no scraping |
| TVGuide.com | Consumer site ⚠ | No (terms) | Manual QA reference only |
| OnTVTonight | Consumer site ⚠ | No (terms) | Manual QA reference only |
| Schedules Direct | Yes (licenses Gracenote) | Yes under THEIR terms ⚠ | **Licensing-rejected for this product** (memberships to natural persons — see registry) |
| DIRECTV / DISH / Xfinity / Spectrum / Cox | Channel-lineup pages/PDFs, not programme feeds ⚠ | No | Lineup verification / manual QA only — a carrier PDF is not an EPG |

## Operator QA checklist (Phase 11 — manual, never automated)

Pick one time window (e.g. tonight 20:00–22:00 local). For each of ABC,
CBS, FOX, NBC, AMC, TCM, Hallmark, Lifetime/LMN, ESPN — where our imported
lineup carries the channel:

1. Open WatchVerd1ct `/app/tv?view=guide`, find the channel row.
2. Open ONE permitted public reference (e.g. the network's own schedule
   page) in a browser, by hand.
3. Verify: channel exists · programme title matches · start time matches
   (mind the feed's UTC offset vs. your zone) · a film slot is classified
   Movie in our guide.
4. Record pass/fail per channel in the QA log. Do NOT paste reference data
   into the product database — this is evidence of import fidelity, not a
   data source.

Discrepancies point first at feed vintage (the file is a snapshot; the
network may have changed its evening), then at import mapping — check
`tv_ingestion_runs` before suspecting the parser.
