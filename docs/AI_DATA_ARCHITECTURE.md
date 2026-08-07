# AI + Data Platform Architecture Audit

**Principle:** Claude = intelligence. WatchVerd1ct database + verified data
providers = factual truth. Claude interprets, reasons, orchestrates, ranks,
clarifies, and explains. Verified structured sources provide facts. Claude must
never become the source of truth for schedules, lineups, airing times, streaming
availability, entitlements, metadata, IDs, release dates, episode data, station
or network identities, subscription status, or any live-TV fact.

This document is the audit required before further AI work: it maps what exists
(with `file:line` evidence), the target, the gaps, and the safe changes made vs.
the ones that require an owner credential or a data-licensing decision.

---

## 1. CURRENT ARCHITECTURE MAP

```
USER
 │
 ├── Discovery (NL): /api/finder, /api/ask
 │     • classifySearch (deterministic mode router)              src/lib/nlu/searchMode.ts
 │     • [legacy brain] parseAskWithAI → FinderQuery  (OpenAI gpt-4o-mini)  src/lib/askParse.ts
 │     • [new brain, flag off] interpretDiscoveryRequest → CanonicalDiscoveryRequest (Claude)  src/lib/ai/*
 │     • conversation state (deterministic, per-turn merge)      src/lib/nlu/conversationState.ts
 │     • applyRequiredSubject (subject = hard constraint)        src/lib/finderSubject.ts
 │     • runFinder: discover → HARD FILTER → subject ELIGIBILITY → DNA RANK   src/lib/finder.ts
 │         - subject centrality: deterministic evaluator + bounded model adjudicator (OpenAI)
 │                                          src/lib/nlu/semanticEligibility.ts, subjectAdjudicator.ts
 │         - rankByDna: bounded ±8 nudge toward learned profile  src/lib/dna.ts (rankByDna)
 │     • similarity ("like X"): TMDB getSimilar/recommendations + keyword/genre overlap  src/lib/askJudge.ts
 │
 ├── On-TV guide: /app/tv  (NO LLM on this path — facts are DB-only)
 │     • live TVmaze fetch (Highlights/Movies)                   src/lib/onTv.ts
 │     • stored LEGACY tables (Full guide): tv_airings/tv_stations/tv_programmes  src/lib/tv/ingestedGuide.ts
 │
 ├── Streaming availability cards
 │     • watchmode_availability (+ 12 canonical states)          src/lib/watchmode/cardAvailability.ts
 │     • TMDB watch/providers overlay                            src/lib/tmdb/client.ts:1065
 │
 └── Ingestion (OFF the request path)
       • runGatedTvIngest (scheduled + self-heal)               src/lib/viewing/ingest/scheduledIngest.ts
       • egress guard (one door), DATA_MODE gating              src/lib/tv/egressGuard.ts, dataMode.ts
       • writers → LEGACY tv_* tables                           src/lib/viewing/ingest/tvmazeWriter.ts
       • watchmode sync (budget-capped) → watchmode_availability src/lib/watchmode/sync.ts

DATABASE (two parallel, non-integrated models)
  • LEGACY (shipped, live):  tv_* (0032), tv_grid (0022, dead), watchmode_availability (0041/0042)
  • CANONICAL (0044, DORMANT): canon_titles / dist_offers / linear_airings + full provenance,
      support-stage gating, DST flags — fed ONLY by an in-memory fixture generator; no
      production reader or writer.
```

## 2. TARGET ARCHITECTURE MAP

```
USER → AI CONCIERGE (Claude) → CANONICAL DISCOVERY REQUEST → APPROVED TYPED TOOLS
   → CANONICAL DATA LAYER → HARD-CONSTRAINT VALIDATION → SIMILARITY QUALIFICATION
   → VERD1CT DNA PERSONALIZATION → AI EXPLANATION → UI

FACTS: metadata + streaming + linear/EPG + network/station + supplemental
   → normalization/reconciliation → CANONICAL DB → query tools → AI orchestrator
```

## 3. GAP ANALYSIS

| # | Target requirement | Status | Evidence / gap |
|---|---|---|---|
| §1 Claude is not a data feed | **MET** | TV path has zero LLM calls; discovery LLM only fills filters/intent, never asserts catalog facts. `src/lib/askParse.ts`, new `src/lib/ai/*`. |
| §2 One canonical title identity | **PARTIAL** | Canonical identity exists in `canon_titles.canonical_key` + `canon_title_external_ids` (`0044:220-270`) but is dormant; production keys on TMDB id. |
| §3 Title ≠ airing | **MET (canonical), legacy thinner** | `linear_airings` separate from `canon_titles`/`canon_episodes` (`0044`). Legacy `tv_airings` also separate from `tv_programmes` (`0032`). |
| §4 Linear ≠ streaming | **MET** | Canonical: `linear_airings` vs `dist_offers` (`0044`). Legacy: `tv_airings` vs `watchmode_availability`. Never conflated. |
| §5 Rich streaming offer model | **MET (canonical), PARTIAL (legacy)** | `dist_offers.offer_type/price_cents/is_direct/via_service_id` (`0044:339-383`); legacy adds 12 canonical states on `watchmode_availability` (`0042:13-44`). |
| §6 Provider normalization | **MET** | `resolveSource` alias map + canonical provider ids (`src/lib/nlu/mediaOntology.ts:75`); rights registry `src/lib/ingest/sourceRegistry.ts`. |
| §7 Canonical station model | **MET (canonical, dormant)** | `linear_networks`+`linear_affiliates`(per-affiliate IANA tz)+`linear_lineups` (`0044:389-442`). Legacy `tv_stations`/`tv_markets` used in prod; live TVmaze path hardcodes `America/New_York` (`ingestedGuide.ts:20`). |
| §8 Real time / DST | **MET** | UTC authoritative; `tv_airings.start_at_utc` (`0032:249`); canonical `dst_ambiguous/dst_nonexistent/crosses_midnight` (`0044:465-493`). |
| §9 Provenance | **MET (canonical), PARTIAL (legacy)** | `source_id` FK + `match_confidence`+`ingested_at`+`first/last_seen_at` (`0044`); legacy `tv_airings.source/fetched_at/last_seen_at` (`0032:131-154`). |
| §10 Explicit freshness | **MET** | `tvHealthVerdict` healthy/stale/degraded (`src/lib/tv/health.ts:96-129`); `watchmode_fetch_state` (`0041:34-42`); canonical `coverage` fields (`platform/query.ts:82-91`). |
| §11 Normalization/reconciliation | **MET** | Adapters → `requestEgress` → writers → `reconcile.ts`; support-stage promotion `supportStage.ts`. |
| §12 Ingestion ≠ user search | **MET** | `runGatedTvIngest` scheduled/self-heal; user reads stored rows. TV path never scrapes at request time. |
| §13 Typed tool boundary | **PARTIAL → improved here** | AI layer previously reached data via `discoveryBridge` calling helpers directly. Formalized as `src/lib/ai/tools.ts` (named, bounded, telemetried) this change. Still no raw SQL to the model. |
| §14 One canonical request | **MET** | `CanonicalDiscoveryRequest` shared by Finder+Ask brain (`src/lib/ai/schemas.ts`). |
| §15 Hard-constraint validation | **MET** | Deterministic: media type guard, subject eligibility gate, provider/monetization/date filters in `runFinder` + route guards. |
| §16 Qualify first, personalize second | **MET** | `runFinder`: discover → hard filter → eligibility → `rankByDna`. DNA never manufactures eligibility. |
| §17 Semantic similarity | **PARTIAL** | Reference similarity = TMDB getSimilar/recommendations + keyword/genre overlap (`askJudge.ts`), not pgvector. `embed()` infra exists (`src/lib/embeddings.ts`) but powers DNA, not reference similarity. |
| §18 Combine, not invent | **MET (by construction)** | Every factual assertion derives from a tool/DB read; the interpreter returns intent only. |
| §19 Multi-turn state | **MET** | `conversationState.ts` canonical merge; Claude multi-turn via `continueDiscoveryConversation`. |
| §20 AI failure ≠ corrupt truth | **MET** | AI degrades to deterministic path; TV/streaming render from DB regardless of AI. |
| §21 Data-feed failure honest | **MET** | `degraded` keeps last dataset with honest label; health verdicts; no LLM backfill. |
| §22 Source priority matrix | **MET (documented)** | See §4 below + `src/lib/tv/sources/feasibility.ts`. |
| §23 Canonical serving layer consumed? | **NO (key gap)** | `public_canon_*/public_dist_*/public_linear_*` have **no production reader**; `platform/query.ts` returns `[]` for real modes (`:204-207`). Canonical corpus is fixtures-only. |
| §24 On-TV card data contract | **PARTIAL** | Card renders station from airing (good) but on the legacy path; canonical structured contract exists in `platform/query.ts` shape, unconsumed. |
| §25 Minimize card offers | **MET** | Availability presentation centralized (`src/lib/availability/watchPresentation.ts`). |
| §26 Availability ≠ entitlement | **MET** | Global availability stored separately from user providers; combined at read (`onMyServices`). |
| §27 Personalization its own layer | **MET** | `rankByDna` separate; factual title props not mixed with user prefs. |
| §28 Cost architecture | **MET (foundation)** | AI off the TV fact path; telemetry records AI tokens/cost separate from data-feed cost (`src/lib/ai/telemetry.ts`); TV reads are DB-only. |
| §29 Provider-independent AI | **MET** | `AiProvider` interface + Anthropic adapter; `AI_PROVIDER`/`AI_MODEL` env (`src/lib/ai/*`, `src/lib/env.ts`). |
| §30 Security | **MET** | Service-role never given to model; tools server-side; strict validation + injection scan is the trust boundary; model output never authorizes. |
| §31 Observability | **PARTIAL** | Finder `constraintReceipt` + founder `search-proof`; AI usage telemetry. Full raw→interpretation→tools→candidates→validation→DNA trace not yet a single founder view. |

## 4. CURRENT DATA SOURCE MATRIX

| Domain | Source (module) | Env / flag | Enabled? | Refresh |
|---|---|---|---|---|
| Title metadata / images / similar / keywords / credits / videos / **TMDB streaming providers** | `src/lib/tmdb/client.ts` (`image.ts` for client-safe images) | `TMDB_API_KEY` | **Enabled (required)** — app `degraded`+503 without it | fetch cache 1h; on-demand |
| Linear TV (premiere/listings/episodes) | TVmaze `src/lib/viewing/adapters/tvmaze.ts` (+ live `src/lib/onTv.ts`) | none (gated by `DATA_MODE` egress) | **Enabled — primary live source** (CC BY-SA, images hotlinked) | 30-min fetch cache; ingest ≤1×/UTC day; hourly GH workflow → `/api/tv/refresh` |
| Linear TV (licensed national grid) | TV Media `src/lib/viewing/adapters/tvMedia.ts` | `TVMEDIA_API_KEY` + **`TVMEDIA_ENABLED=1`** + `DATA_MODE=paid_live` | **Disabled (fails closed)** — needs licensing decision | ≤1×/2h ingest when enabled |
| Linear TV (alt licensed) | Schedules Direct `src/lib/viewing/adapters/schedulesDirect.ts` | `SCHEDULES_DIRECT_*` | **Registered, not configured** (~$25/yr account) | — |
| Streaming availability + deep links | Watchmode `src/lib/watchmode/*` | `WATCHMODE_API_KEY` | **Optional/dormant** — free tier non-commercial (licensing decision) | 12h cache; budget-capped cron sync (≤2000/mo) |
| Ratings (IMDb/RT critic/Metacritic) | OMDb `src/lib/omdb.ts` | `OMDB_API_KEY` | **Optional/dormant** | 6h cache; per-title |
| Ratings (RT audience/Trakt/Letterboxd/…) | MDBList `src/lib/mdblist.ts` | `MDBLIST_API_KEY` | **Optional/dormant** | 12h cache; per-title |
| Linear grid (Gracenote) | — | — | **DEAD** (`tv_grid` deprecated `0035`; never revive) | — |

Provider-neutral normalization: `src/lib/nlu/mediaOntology.ts` (`resolveSource`) + rights registry `src/lib/ingest/sourceRegistry.ts`. `DATA_MODE` (`fixture`/`free_live`/`paid_live`) fails closed in production; single egress door `requestEgress`.

## 5. CURRENT CANONICAL DATABASE STATUS

- **Defined:** migration `0044_tv_platform_core.sql` — the full canonical model (titles, aliases, external ids, seasons, episodes, genres; dist services/regions/offers; linear networks/affiliates/lineups/channels/airings/coverage; data_sources + capabilities + promotion evidence + runs + requests + quota; match_candidates; sim_clock) with public views `public_canon_titles`/`public_dist_offers`/`public_linear_airings`/`public_source_health` gated on `is_fixture=false` AND a user-visible support stage.
- **Populated?** **Only by fixtures.** `src/lib/tv/platform/query.ts` serves fixtures in `fixture` mode and returns `[]` for `free_live`/`paid_live` (`:204-207`, "Nothing is wired to them yet at a verified stage").
- **Consumed by production?** **No.** No production `from('canon_*'|'dist_*'|'linear_*')`; the only references are `.db.test.ts`/security tests. The user-facing guide + Packs read **legacy** `tv_airings/tv_stations/tv_programmes`; streaming cards read `watchmode_availability`.
- **Row counts (production):** cannot be verified from this environment (no production DB access). Must be confirmed by the owner via `/api/tv/coverage` and a direct count before any bridge migration.

**Conclusion:** the canonical model is correct, provenance-complete, and shipped-dormant. It awaits (a) a verified ingester writing real `canon_*/dist_*/linear_*` rows and (b) read surfaces switching to the public views. Both are gated on data-licensing/credential decisions (owner) and a careful, idempotent, provenance-aware bridge migration.

## 6. SPECIFIC CODE CHANGES REQUIRED

Done in this change set (safe, additive, no owner credential):
1. **Typed AI tool boundary** `src/lib/ai/tools.ts` — named, schema-bounded, server-side, telemetried wrappers (resolveTitle, resolvePerson, findSimilarTitles, searchBySubject, resolveProvider, getLinearAirings, getStreamingAvailability) over verified-data functions; `discoveryBridge` routed through it. No raw SQL to the model (§13).
2. **Architectural separation tests** (§32) — source-level assertion that TV/data fact paths import no LLM client (CASE A/E), canonical schema cannot carry invented airing facts, `runAiDiscovery` defers exact-title/person/live-TV to deterministic handlers.
3. **`.env.example`** — add missing `MDBLIST_API_KEY`.

Sequenced next (require owner data decision / production verification — NOT done here):
4. Wire a verified linear ingester into `canon_*/linear_*` (blocked on TVmaze-into-canonical bridge design or TV Media licensing).
5. Idempotent, provenance-aware, timezone-correct **bridge migration** legacy `tv_*` → canonical (only after confirming production row counts; never destructive).
6. Switch On-TV read surfaces + `/api/tv/watch-now` onto the public canonical views once populated at a verified stage.
7. Availability requirement (`linearTonight` / `userStreamingServices` / `mode`) in the canonical request + intersection tool (§14 example) once canonical linear+offers are live.
8. Semantic reference similarity via precomputed embeddings/pgvector (§17).
9. Single founder observability trace raw→interpretation→tools→candidates→validation→DNA (§31).

## 7. EXISTING COMPONENTS TO PRESERVE (do not rewrite)

- The deterministic scoring engine `src/lib/scoring/*` (authoritative, unit-tested, 7 scenarios).
- `runFinder` qualify-first pipeline + subject eligibility gate + `rankByDna`.
- `conversationState.ts` canonical multi-turn merge.
- The entire TV data platform: `DATA_MODE`/egress guard/support stages/fixtures/DST time handling/health verdicts/feasibility matrix. It is mature and compliant.
- The canonical model migration `0044` — it is the correct target; extend it, don't replace it.
- Watchmode availability + 12 canonical states; provider normalization.
- Frozen search/intent corpora and their oracle (evidence, never edited to pass).

## 8. MIGRATION / DATA RISKS

- **Do not** migrate legacy → canonical without first confirming production row counts and freshness (owner). A bridge must be idempotent, provenance-aware, correction-aware, timezone-correct, safe to rerun.
- No fixtures may ever reach a production user (two guards exist; preserve them).
- Legacy `tv_*` holds real production listings the canonical tables do not yet have — bridge, never discard.

## 9. AI COST RISKS

- Interpretation must stay bounded (short output, prompt caching, `claude-sonnet-5`); never call Claude for facts already in the DB (§28). TV "what time is this on" is answered from stored airings, no AI.
- Shadow mode must be time-boxed, not run indefinitely.
- Telemetry separates AI token cost from data-feed cost; watch cache-hit rate at scale.

## 10. DATA-FEED / LICENSING RISKS

- TVmaze is CC BY-SA — attribution required, images hotlinked never mirrored (enforced).
- TV Media, Watchmode, Schedules Direct, Gracenote all require commercial/credential decisions before their data can populate canonical linear/streaming. These are **owner actions**, not code.
- Metered adapters fail closed behind `DATA_MODE=paid_live` + their own enable flag.

## 11. IMPLEMENTATION SEQUENCE

P0 (shipped / in this line of work): AI-vs-truth separation; one canonical request; Finder+Ask unified brain; hard-constraint validation; provider-independent AI; security; **typed tool boundary**; architectural separation tests.
P1 (owner-gated data work): choose a licensed linear/streaming source → wire verified ingester into `canon_*/dist_*/linear_*` → bridge legacy → switch read surfaces → availability-intersection tool → semantic embeddings similarity → founder trace.
P2: cost optimization at scale; secondary AI providers; automatic source-conflict resolution.

**Honest end-state caveat:** the full live end-to-end proof (title identity + linear airing + streaming offer + provenance + freshness + AI interpretation + hard-constraint validation + VERD1CT personalization together) cannot be demonstrated from this environment. It requires both `ANTHROPIC_API_KEY` and licensed data-feed credentials populating the canonical tables — both owner actions. The engineering is built and tested against those seams with a mock provider and fixtures; flipping the credentials is what turns it on.
