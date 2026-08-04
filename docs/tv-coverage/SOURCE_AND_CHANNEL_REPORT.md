# TV guide coverage — source and channel report

Generated 2026-08-04 against live APIs. Every number below came from a real
request made while writing this, not from memory. The raw inventory is in
`tvmaze-us-inventory.json` next to this file.

---

## The headline, before the detail

**The binding constraint is not licensing, not rate limits, and not
engineering. It is that the only clean free source is an episode database,
not an EPG.**

TVmaze indexes *episodes of series it tracks*. It does not model a channel's
24-hour grid. So it has excellent coverage of first-run scripted and news
programming, and near-zero coverage of movie blocks, reruns and syndicated
filler — which is most of what a cable channel actually airs.

That lands hardest on exactly the channels this product is built around:

| Channel | TVmaze future airings |
|---|---|
| Hallmark Channel | **absent entirely** |
| Hallmark Mystery | **absent entirely** |
| Hallmark Family | **absent entirely** |
| Lifetime Movie Network / LMN | **absent entirely** |
| Great American Family | **absent entirely** |
| Turner Classic Movies | **absent entirely** |
| Lifetime | 5 |
| Investigation Discovery | 18 |
| Oxygen True Crime | 7 |

Hallmark Universe and Lifetime Movie Vault cannot be filled from free sources.
Not "thinly" — at all. Crime Case Files is partly servable (ID + Oxygen +
the broadcast newsmagazines already configured).

---

## 1. Sources identified

| Source | Type | Status |
|---|---|---|
| **TVmaze** | Free public API | **USABLE** — see §2 |
| TMDB | Free API (already in use) | Usable, but has **no channel schedule** — episode air dates only. Enrichment, not a guide. |
| PBS TV Schedules API | Official, free, key required | Usable in principle; covers PBS member stations only |
| Schedules Direct | Non-profit, licenses Gracenote | **PAID (~$35/yr)** — not activated, per your instruction |
| Gracenote / TV Media / Rovi | Commercial | **PAID** — not activated |
| iptv-org/epg + community XMLTV grabbers | Aggregators | **REJECTED** — these work by scraping listings sites whose terms forbid automated retrieval. Using them would launder a prohibited scrape through a third party. |
| Pluto TV / Samsung TV Plus / Plex / Tubi EPG endpoints | Undocumented internal APIs | **REJECTED** — no published API, no grant of automated access; their terms prohibit it |
| Individual network websites | — | **REJECTED** — automated retrieval prohibited |

## 2. TVmaze terms, verified live at tvmaze.com/api

- **Licence: CC BY-SA.** Quote: *"the data can freely be used for any purpose,
  as long as TVmaze is properly credited as source and your usage complies
  with the ShareAlike provision."*
- **Commercial use is permitted.** This is better than I expected going in.
- **Attribution is mandatory** — satisfied by linking back to TVmaze from the
  app, using URLs the API itself returns.
- **ShareAlike is a real obligation, and it is yours to accept, not mine.**
  Copyleft attaches to the data and, arguably, to a derived schedule database.
  For a commercial product that is a genuine legal consideration and I am
  flagging it rather than quietly building on it.
- **Rate limit: at least 20 calls / 10 seconds per IP**, with 429 back-off.
  Generous — the *entire* US future schedule is a single call.

## 3. What TVmaze actually contains (measured, not estimated)

`GET /schedule/full` — one call, 14.7 MB:

- **7,476** future airings
- **75** distinct US networks
- Date span **2026-08-03 → 2028-03-05**, but only **187 distinct dates** across
  19 months — i.e. sparse, not a continuous grid

Depth distribution across those 75 networks:

| Airings per network (18-month horizon) | Networks |
|---|---|
| ≥100 | 10 |
| 20–99 | 17 |
| 5–19 | 28 |
| 1–4 | 20 |

**Roughly 60% of all US airings are cable-news talk programming** — Fox News
(364), MS NOW (317), Newsmax (288), NewsNation (255), CNBC (241), CNN (232),
Fox Business (216). Those seven alone are 1,913 of 7,476.

A 14-day day-by-day pull (`/schedule?country=US&date=`) returned **1,362
airings across 61 networks**, averaging ~97/day for the *entire country*. For
scale: one real cable channel airs roughly 20–48 slots a day on its own.

## 4. Coverage by requested category

| Requested category | Free-source verdict |
|---|---|
| Major broadcast networks | **Good** — NBC 164, CBS 139, ABC, FOX 43, CW 26, PBS 53 |
| General cable | **Partial** — TBS 43, USA 23, TNT 19, FX 14, AMC 13, Syfy 11 (first-run only) |
| News & business | **Excellent** — by far the strongest category |
| Hallmark / Lifetime / LMN | **Effectively none** (see headline) |
| True crime & mystery | **Partial** — ID 18, Oxygen 7, + newsmagazines already wired |
| Movie channels | **None** — no TCM, no movie-channel grids |
| Documentary / factual | **Partial** — History 37, Discovery, Smithsonian 2, Vice 4 |
| Lifestyle / home / food / travel | **Partial** — HGTV 45, Food 22, TLC 20, Magnolia 6, FYI 4 |
| Children's | **Thin** — Nickelodeon 19, Disney Channel 8, Disney Junior 5, Cartoon Network 1 |
| Sports | **Thin & first-run only** — ESPN 68, NFL Network 17, SEC 9, ESPN2 3, NBA TV 1 |
| Spanish-language | **Thin** — Telemundo 25, Las Estrellas 9 |
| FAST / free streaming | **None legally available** (see §1 rejections) |
| Digital & specialty | **Thin** — Me-TV 7, TV One 4, Ovation 4, REELZ 8 |

## 5. Where a paid plan starts paying — the exact point

Immediately, and specifically for **movie-programmed channels**: Hallmark
Channel, Hallmark Mystery, Hallmark Family, LMN, Great American Family, TCM,
and the movie blocks on Lifetime. These are structurally absent from every
free source, and they are the channels your three Packs depend on.

Schedules Direct (~$35/yr, non-profit, licenses Gracenote) is the cheapest
path to real 24-hour grids with movie-level detail. **Not activated — your
call.**

## 6. What is worth building for free anyway

Raising the allowlist from **12 configured channels to the ~40 US networks
that carry genuine recurring data** is real, honest improvement — broadcast,
news, and the first-run cable slate. It costs no extra API calls: the current
ingest already downloads the whole national dump and discards everything
outside the 12-channel allowlist.

What it will not do is make the guide look like a cable EPG, and any channel
listed with an empty grid must be labelled unavailable rather than shown as a
blank schedule — the existing code comments already set that rule.
