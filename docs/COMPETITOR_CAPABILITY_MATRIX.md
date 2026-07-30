# WATCHVERD1CT — Competitor Capability Matrix

> Honest positions only: WatchVerd1ct is **not** claimed to lead a category
> without working, cited evidence. "Leads (offline-proven)" means the
> capability is implemented and test-verified but not yet validated against
> live market data at scale.

_Last updated: 2026-07-25_

| Category | Market leader | Why they lead | WatchVerd1ct position | Evidence / gap |
|---|---|---|---|---|
| Personalisation | Netflix (in-catalog), Criticker (cross-catalog) | Billions of signals / TCI rating math | **Competitive** — three-DNA model + 18-axis fingerprint + confidence | `src/lib/preference/*`, `scoring/dimensions.ts`; needs live user volume |
| Cold start | ChatGPT-style assistants | Zero-setup conversation | **Leads (offline-proven)** — a plain ask works before any account/quiz | home ask → `/api/ask`; no mandatory onboarding |
| NL understanding | ChatGPT / Perplexity | General LLM | **Competitive, more *enforced*** — LLM parse + deterministic fallback + hard validation an LLM alone lacks | `nlu/*` modules, 2,352 adversarial cases |
| Search accuracy / hard constraints | *(no strong leader — streaming search ignores constraints)* | — | **Leads (offline-proven)** — validate-before-rank, honest shortfall, no filler | `constraintValidator.ts`, media-type final guard, 20 mandated regressions |
| Similar-title discovery | Letterboxd (human curation), TMDB | Community lists | **Competitive** — seed-excluded similarity + contradiction penalty | `askSimilarTo`, calibration sweeps |
| Recommendation transparency | Criticker (shows TCI) | Simple visible math | **Leads (offline-proven)** — per-verdict rose/held-back/requirements/confidence | `verdictExplain.ts` (new); UI wiring pending |
| Streaming availability | JustWatch | Dedicated availability data ops | **Behind** — TMDB/JustWatch-attributed data, honesty labels, but no independent verification pipeline | `askJudge.ts` unverified-vs-absent; needs live audit |
| Live TV | TV Guide / YouTube TV | Licensed EPG feeds | **Behind on data, ahead on intelligence** — Worth Joining Late + personalised ranking exist; real EPG source missing | `tv/*` rules engines; honest empty states |
| Household matching | *(no real leader — most are single-profile)* | — | **Leads (offline-proven)** — floor-weighted non-average scoring with objections/fairness | `householdVerdict.ts` + 8 tests (new) |
| Group decisions | Swipe-match apps | Simple mechanic | **Competitive** — Court/jury flow + household engine; needs mobile polish | `court/*`, `TakeToCourtCard` |
| Ratings/reviews depth | IMDb / Letterboxd | Decades of UGC | **Behind by design** — we aggregate evidence, we don't host reviews | RatingsStrip multi-source |
| Watch history / tracking | Trakt / TV Time | Scrobbling ecosystem | **Behind** — watchlist + watched state exist; journal/insights not built | `watchlist` actions; journal on roadmap |
| Imports/portability | Trakt / Letterboxd | Open CSV/API culture | **Behind — not implemented**; roadmap: CSV → IMDb → Letterboxd/Trakt | none yet (honest) |
| Community intelligence | Letterboxd | Taste-community culture | **Behind** — deterministic critics panel only; Verd1ct Jury needs live users | `swarm.ts` |
| Alerts/reminders | TV Time | Episode pings | **Partial** — reminders route + VAPID push scaffolding | `app/reminders` |
| Mobile usability | Letterboxd | Native apps | **Competitive (web)** — 140-check overflow guard, 44px targets, PWA manifest | `tests/mobile/*` |
| Decision speed ("end the search") | *(category vacuum — everyone optimises browsing)* | — | **The bet: lead** — ONE verd1ct with reasons, honest constraints, group awareness | whole pipeline; must be proven with users |
| Trust | Common Sense (parents) | Editorial rigor | **Leads (offline-proven) on honesty mechanics** — no fabricated data, labelled uncertainty, no dark-pattern filler | data-honesty rules across codebase |
| Retention | Netflix (default app) | Catalog ownership | **Unproven** — weekly hooks (On TV tonight, new-for-you) exist; no live cohort data | — |

## Biggest exploitable market gaps (what nobody does well)
1. **Hard-constraint honesty** — every incumbent pads results; we refuse to.
2. **Group decisions as a first-class feature** — single-profile is the norm.
3. **"Should I join this late?"** — no product answers it; our rules engine does.
4. **Explained confidence** — everyone shows scores; nobody explains reliability.
5. **Cross-service ONE answer** — platforms are conflicted; aggregators only list.

## Where competitors still beat us (do not deny)
1. JustWatch: availability breadth/freshness.
2. Trakt/TV Time: tracking ecosystem + imports.
3. Letterboxd: community and reviews culture.
4. TV Guide/live-TV providers: licensed EPG data.
5. Netflix et al.: in-catalog behavioural signal volume.
