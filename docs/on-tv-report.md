# On TV — Production Experience (Phase 1) Completion Report

Branch: `feature/search-dna-and-search-lab` (isolated). Nothing merged/deployed.
No sports in this phase. Judge Verity never appears in On TV.

## Existing implementation audit

A **real, working** On TV stack already existed and was preserved (non-destructive):
- `src/lib/onTv.ts` — TVmaze broadcast + streaming airings (`getOnTvToday`,
  `getUpcomingTv`), OMDb critic + TMDB enrichment. Flat `Airing` model.
- `src/lib/gracenote.ts` — a Gracenote grid EPG (`tvlistings.gracenote.com`),
  hour-block fetch + `unstable_cache`, channel call-signs/logos.
- `src/lib/tvGrid.ts` — DB-stored grid (`getStoredGridAirings`), plus cron jobs
  `/api/cron/tv-grid` and `/api/cron/tv-reminders`.
- UI: `EasyOnTv`, `OnTvGuide`, `TonightHome`, `TvDetective`; route `/app/tv`.
- Sports: a channel skip-list already existed in `onTv.ts`/`gracenote.ts`.
- Narrow container: the app uses `.container-page` (max-w-6xl ≈ 1152px) — the
  narrow-column risk the brief calls out for On TV.

## Data sources found — live / mocked / mixed

**Mixed, mostly real:** TVmaze (broadcast + streaming) and a scraped Gracenote grid
(DB-cached) supply live listings; OMDb + TMDB supply metadata. **This phase's new
dashboard renders clearly-labelled development mock data** (`MockScheduleProvider`)
so the whole experience is testable offline and deterministically; the production
`ScheduleProvider` over Gracenote/TVmaze is the documented drop-in (see below).

## Architecture added (`src/lib/ontv/`)

- **Clean, separated data contracts** (`types.ts`): `Channel`, `Program` (title
  metadata), `Airing` (schedule — references `contentId`, never duplicates the
  title record), `PersonalizedAiring` (the UI join), and a general **`EventType`**
  (movie/episode/special/documentary/news/kids/awards/live_event/**sports**/other).
- **`ScheduleProvider` interface** (`provider.ts`): `getChannels / getAirings /
  getCurrentAirings / getUpcomingAirings / searchAirings / getAiringsForProgram`,
  typed `ScheduleError`, and `DataFreshness` (fetchedAt/sourceUpdatedAt/expires/
  stale) with near-future windows refreshing faster than distant ones.
- **`MockScheduleProvider`** (`mockProvider.ts`): deterministic, relative to `now`,
  includes a sports item + missing-artwork/ratings items to prove filtering + clean
  omission. **Production adapter** is a thin mapper over the existing pipeline (the
  documented next step; the interface is stable).
- **Time** (`time.ts`): DST-safe. Durations use epoch math; local-day/hour windows
  (now/tonight/late-night/tomorrow/weekend) use `Intl` with the user's IANA zone.
- **Worth Joining Late** (`joiningLate.ts`) — documented rules (below).
- **Ranking** (`rank.ts`) — hard filters BEFORE Your Match; cold-start blend;
  household scoring.
- **NL query parser** (`query.ts`) — text → `ScheduleQuery`; one clarification only
  when it changes results; preserves the parsed query so the answer completes it.
- **Dashboard assembler** (`dashboard.ts`, server-only) — sections + `runQuery`.

## Routes added / changed

- `/app/on-tv` — the new For You dashboard (wide). Nav "On TV" now points here.
- `/app/on-tv/{now,next,tonight,movies,channels,grid}` — view targets (the view bar
  links; the For You default is live, the others are the documented next views).
- `/dev/on-tv` — deterministic harness (gated behind `RESPONSIVE_HARNESS=1`) for
  offline visual/responsive tests.
- Existing `/app/tv` and its cron/API routes were left intact.

## Components added

`src/components/ontv/OnTvDashboard.tsx` (server), `ProgramCard.tsx`,
`OnTvViewBar.tsx`. New CSS: `.container-wide` (max 1600px, safe-area gutters),
`.ontv-rail` (auto-fit multi-column), `.ontv-viewbar` (scrollable filter bar).

## Query schema

`ScheduleQuery` (see `types.ts`): `mediaTypes`, `eventTypesExclude` (always
`sports`), `dateScope`, `startTimeMin/Max`, `withinMinutes`, `networks`,
`availabilityScope` (all/user_channels/user_services/free), `minMatch`, `maxRuntime`,
`newOnly`, `noNews/noReality/noReruns`, `familyFriendly`, `noHorror`,
`englishAudioOnly`, `household[]`, `sort`. Example: *"What movies are on tonight
after 8 on channels I have?"* → `{mediaTypes:['movie'], dateScope:'tonight',
startTimeMin:'20:00', availabilityScope:'user_channels', eventTypesExclude:['sports'],
sort:'personalized_match'}` (asserted in tests).

## Worth Joining Late rules

Not airing → `not_started`. **Restart available → YES** (any %). **Plot-dependent**
(movies, serialized dramas): ≤15 min elapsed AND ≤40% → YES; ≤40 min AND ≤70% →
MAYBE (better from the beginning); else NO (+ "available from the start later" when
on-demand). **Standalone/episodic** (sitcoms, procedurals like Castle, news,
competitions): ≤75% → YES; ≤90% → MAYBE; else NO. Uses both absolute minutes and
percent so a 2h movie 54 min in (NO) and a 1h episode 27 min in (MAYBE) judge
correctly. All rules unit-tested.

## Household matching

`householdScore` is **min-weighted, not a plain average**: `0.65·min + 0.35·mean`,
with a **strong-dislike veto** flooring the group score to ≤35 and reporting
`blockedBy`. Label: "Household Match". Tested (dislike veto + genuine shared match).

## Alerts

`Alert Me` targets the specific **`Airing.id`** (channel+content+start), not the
title — so schedule changes can be reconciled. The UI action + 5/15/30-min-before
options are in the card; **real notification delivery is deliberately not faked** —
wiring it to the existing `web-push`/reminder cron + a durable alerts table is a
follow-up that needs an approval-gated migration (documented, not stubbed as fake).

## Sports exclusion + future extension point

`sports.ts` centralizes exclusion (`DEFAULT_EXCLUDED_EVENT_TYPES = {sports}`, sports
channel/genre detection, `excludeSports`). Sports are filtered from queries,
sections, cards, ranking, and nav. **Extension point** (documented in `sports.ts`):
the `EventType` model is already sports-capable — a future phase removes `sports`
from the exclusion set, adds sports enrichment keyed on `eventType==='sports'`, and
adds a Sports view; no rebuild.

## Performance strategy

Provider carries freshness + TTLs (near-future 5 min, distant 30 min); the assembler
requests only the window it needs (not a week of every channel); images are
lazy-loaded with reserved aspect boxes (no layout shift); the pipeline is pure and
cheap. Grid virtualization is specified for the full-grid view (next phase).

## Accessibility improvements

Semantic headings per section; `role="search"` on the NL input; `role="progressbar"`
with aria values on the on-air progress bar; `aria-current` on the active view;
44px action tap targets; status conveyed by text + badge (not color alone); the
horizontally-scrollable view bar remains keyboard/focus reachable.

## Tests added + results

- **Unit/query** (`src/lib/ontv/ontv.test.ts`, 31 tests): time windows + DST,
  minutes remaining/until, tonight/tomorrow resolution, sports exclusion, all Worth
  Joining Late rules (Castle/mystery-movie/sitcom/serialized/restart), hard-filter-
  before-match (channel/runtime), Your Match sorting + cold-start flag, household
  min-weighting + dislike veto, and all the mandated NL query cases. **31/31 pass.**
- **Responsive/visual** (`tests/responsive/ontv.spec.ts`, 15 tests): 320/360/375/
  390/414/430/768/1024/1280/1366/1440/1600/1920 + NL-search + phone-vertical.
  Asserts no horizontal scroll, nothing offscreen (scroll-containers excepted),
  Your Match/time/channel visible, 44px actions inside card bounds, desktop uses the
  available width (not a narrow column), **no sports, no Judge Verity**. **15/15 pass.**
- Whole suite: typecheck, lint, **318 unit tests**, production build (47 routes).

## Screenshots (reviewed)

`test-results/ontv/ontv-{width}.png` for every required width + `ontv-search-1280`.
Inspected: **390px** (vertical full-width cards, sections, WJL, progress, cold-start
+ mock-data labels), **1440px** (full-width multi-column rails, Castle "Join late:
Yes", all sections, no sports/Verity), and the **NL-search** view ("Understood as:
movie · tonight · after 20:00 · user channels · sports excluded" → correctly
hard-filtered result).

## Remaining limitations

- Views other than For You (`/now`, `/next`, `/tonight`, `/movies`, `/channels`,
  `/grid`) are routed but not yet built — the **full virtualized grid** is the
  largest deferred item (Phase 4).
- The dashboard uses **labelled mock data**; wiring the production `ScheduleProvider`
  over the existing Gracenote/TVmaze pipeline is the next step.
- **Alerts** are UI-complete but not delivering (needs the approval-gated alerts
  table + push wiring).
- **Program detail drawer/sheet** and **household group UI** are specified/typed
  (household scoring is implemented + tested) but not yet surfaced in the UI.
- Your Match uses a `TasteProfile` abstraction; wiring the real Watch DNA profile is
  a small adapter (cold-start default is used + labelled meanwhile).
- A single NL-search result stretches its rail column wide — cosmetic; a max-column
  cap is a trivial follow-up.

## External API / account requirements

Production listings need the existing Gracenote grid access (lineup id) + TVmaze
(no key) already configured, OMDb + TMDB keys for enrichment. Alerts need web-push
VAPID keys (already present for reminders) + a new alerts table. No new external
account is required for this phase's mock-data dashboard.
