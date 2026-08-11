# Commercial EPG alternatives for a public WatchVerd1ct

Written 2026-08-11, alongside the TV Media activation runbook, so that "TV Media
says no" has an answer ready rather than starting a search.

**Scope rule:** every option here must be capable of licensing listings for a
**public, commercial, distributable consumer product**. That single requirement
is what disqualified the cheap options, and it is the requirement that matters —
a source that cannot clear it is not cheaper, it is unusable.

**Excluded by owner decision, not re-litigated here:** Schedules Direct
(personal use / noncommercial software / natural persons), any scraping of
TVGuide, Zap2it, TitanTV or channel sites, community XMLTV grabbers, and
internal FAST-service EPG endpoints. See `SOURCE_RIGHTS_REGISTRY.md`.

---

## What is verified vs. what is not

**Verified in this environment:** TV Media is the incumbent, its v4 contract is
implemented, and it returned 66/66 requested channels on 2026-08-05 — so the
integration works and the account existed. Everything about *pricing and terms*
below is **unverified**: these are commercial agreements with no public rate
card, and I will not publish a number I cannot evidence. Where I know a figure
is not public, I say so rather than estimating.

| Provider | Commercial redistribution | Coverage type | Public pricing | Contact path | Attribution | Integration cost | Unverified |
|---|---|---|---|---|---|---|---|
| **TV Media** (incumbent) | Licensed commercial feed; **our specific public/distributable use is unconfirmed** | Full NA linear grid by lineup/postal code — movies, reruns, paid programming, FAST | Not public | Existing account/rep | Undetermined — see runbook §1.5 | **Already built** (`adapters/tvMedia.ts`, v4) | Whether the current contract covers public display, caching, derived data |
| **Gracenote** (Nielsen) | Yes — the industry standard for commercial EPG; powers most large guides | Global linear + streaming, deep metadata, images, series/episode identity | Not public; enterprise | `gracenote.com` → Contact Sales | Typically contractual; varies by tier | High — rich schema, most work of any option here | Price band, minimum term, whether a product our size is in scope |
| **Rovi/TiVo metadata** (same family as Gracenote via TiVo) | Yes — commercial licensing | NA linear grid + metadata | Not public | TiVo/Xperi corporate sales | Contractual | High | Whether it is distinct from Gracenote for our purposes post-merger |
| **XMLTV via a LICENSED aggregator** (e.g. a paid EPG provider with its own upstream licence) | **Only if the aggregator holds redistribution rights** — must be evidenced, not assumed | Varies; often full grid | Varies | Per vendor | Varies | Low — XMLTV is a well-understood format | Whether any given vendor's upstream licence actually permits our use. **This is the exact trap that disqualified community grabbers** |
| **Direct network feeds** (Hallmark/Lifetime press or affiliate feeds) | Per-network agreement; A+E press is explicitly closed (`Disallow: /`) | Only that network's channels | N/A | Per-network press/BD contact | Per agreement | Medium × N networks | Whether Hallmark press access can be granted for automated commercial use |

---

## The recommendation, if TV Media cannot clear §1

**Talk to Gracenote.** It is the only option in the table that is unambiguously
built for this — a public commercial product redistributing a full linear grid —
and it covers exactly the programming TVmaze structurally cannot: movies,
reruns, specials and paid programming on Hallmark, Lifetime and LMN.

Two things worth being honest about before that call:

1. **It is the most expensive and the most work.** The integration is
   provider-agnostic (`ScheduleAdapter`, priority-ordered registry), so adding
   it is a new adapter rather than a rewrite — but its schema is far richer than
   TV Media's and the mapping is real work.
2. **The cheap middle does not exist.** Every option between "free episode
   database" and "enterprise EPG licence" turned out to be either
   personal-use-only or an aggregator laundering someone else's prohibited
   scrape. That gap is why this document is short.

## What can ship meanwhile

What is live now: **"Live TV guide / Available channel listings for the next 6
hours / N channels with listings"**, with the coverage notice visible. It is
truthful, it is not apologetic, and it is backed by TVmaze's genuine strength —
first-run scripted and best-in-class cable-news coverage.

What must **not** ship meanwhile is any promise of a full channel guide, and any
Pack whose value depends on Hallmark/Lifetime 24-hour grids. `/api/health/providers`
now reports `claim: "partial_listings"` so that constraint is machine-readable
rather than a matter of memory.
