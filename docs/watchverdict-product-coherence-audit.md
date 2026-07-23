# WatchVerdict — Product-Coherence Audit

> Phase-1 deliverable. For every important screen: its job, its most important
> action, where it belongs, current problems, and what must NOT change. Findings
> are read from source (routes in `src/app/app/**`, nav in `Nav.tsx` /
> `nav/MobileNav.tsx`). No claim is made about a feature not found in code.

## 0. The core coherence problem

WatchVerdict already contains a best-in-class decision engine, but the shell
around it reads as **many parallel mini-apps** rather than one system. Concretely:

1. **"Ask" — the promised center — is split and buried.** Two different ask
   surfaces exist: Home's `BuildCaseBox` ("State Your Case" → `/api/build-case` →
   routes to `/app/watch` or an actionable screen) and the `AskTheJudge` chat
   (`/app/ask` → `/api/ask`). **`/app/ask` is in NO nav array.** The nav center is
   Home / Watch Now / New / On TV / Watchlist. Ask is not the unmistakable center.
2. **Six overlapping "find me something" front-doors:** Ask, State Your Case,
   Mentalist (`/app/mentalist`), Mood (`/app/mood`), Quiz (`/app/quiz`), Finder
   (`/app/finder`). Several are unlinked from nav.
3. **Redundant in-screen navigation on every page.** `NavArrows.tsx` (Back /
   Home / Forward) renders at the top of `<main>` on all `/app` screens — on top
   of the browser's own controls, the nav Logo→`/app`, the desktop "Home" link,
   and the mobile "Home" tab. **Home is reachable four ways on a phone.**
4. **Home has ~10 competing CTAs** with no single dominant action.
5. **Three+ parallel "simple" experiences:** `/lite` (a whole chrome-less second
   copy), `/app/easy`, `/app/vintage`, plus the `ViewModeToggle` desktop-viewport
   hack — overlapping and inconsistently surfaced.
6. **Profile is split** across `/app/settings` and `/app/chambers` with no
   hierarchy; the "account menu" is just an avatar linking to Settings.
7. **No `language`/locale surface at all** (see i18n audit) and **every label is
   hardcoded English**.

The refinement goal: make **Ask WatchVerdict the center**, collapse the redundant
navigation, group the six jobs, and localize — **without** removing features or
restyling the brand.

## 1. The six primary jobs (target grouping)

| Job | Screens that serve it today |
|---|---|
| **Ask** (get a decision) | `/app/ask` (Judge Verity), Home `BuildCaseBox`, `/app/mood`, `/app/mentalist`, `/app/quiz` |
| **Discover** | `/app/watch`, `/app/finder`, `/app/new` |
| **On TV** | `/app/tv` (+ embedded TV Guide Detective, `/app/reminders`) |
| **Saved** | `/app/watchlist` |
| **Together** | `/app/together`, `/court/[code]`, `/join/[code]` |
| **Profile** | `/app/settings`, `/app/chambers`, `/app/dna`, `/app/friends`, `/app/subscriptions`, `/app/pro` |

Current primary nav (`Nav.tsx`) exposes **Home / Watch Now / New / On TV /
Watchlist** and hides Ask, Finder, DNA, Together, Friends, Subscriptions, Quiz,
Mentalist, Mood in a More menu or nowhere. This under-weights **Ask** and
**Together** — the two most differentiated jobs.

## 2. Screen-by-screen audit

For each: **Job** · **Primary action** · **Nav?** · **Problems** · **Must-not-change**.

### Home — `/app` (`app/page.tsx`)
- **Job:** Discover hub / launch a decision. **Primary action:** the ask box.
- **Nav:** primary (Home). **Belongs:** Discover, but should foreground **Ask**.
- **Problems:** ~10 competing CTAs; two ask surfaces; "Decide Together" banner +
  7-tile grid + rails compete; the ask box is one of many, not THE center.
- **i18n:** promise banner, tile labels, CTA copy all hardcoded EN; tile labels
  will expand in ES.
- **Must-not-change:** `RecommendedForYou`/`TonightHome` data, recent-verdicts,
  brand visuals. Reduce CTA competition; elevate the ask box. UI-only.
- **Verdict:** feels like a *portal to mini-apps*, not one system.

### Ask the Judge — `/app/ask` (`AskTheJudge` = Judge Verity)
- **Job:** Ask. **Primary action:** "File it" (mic files on speech).
- **Nav:** **NONE** (major finding). **Belongs:** Ask — should be the center.
- **Problems:** invisible in nav; parallel to Home's `BuildCaseBox`; two ask
  engines confuse the mental model.
- **i18n:** Judge Verity greeting/persona = transcreation; voice `lang` hardcoded
  `en-US`.
- **Must-not-change:** `/api/ask` logic, Judge Verity persona, chat behavior.
  Promote to primary nav; unify the two ask front-doors conceptually.

### Watch Now — `/app/watch`
- **Job:** Discover/Saved. **Primary action:** tab into "Ready to watch" / save.
- **Nav:** primary. **Problems:** two tabs + `BrowseCatalog` provider/type picker
  read fine; mild overlap with New/Finder. **Must-not-change:** DNA ranking,
  save behavior. Mostly healthy.

### Forensic Search / Finder — `/app/finder` (`FinderUI`)
- **Job:** Discover (power). **Primary action:** "⚖️ Submit evidence".
- **Nav:** **NONE**. **Problems:** ~13 filter controls read as a standalone
  power-tool; unlinked from nav. **Must-not-change:** the finder query/scoring
  (protected; recently fixed). Present as an "advanced" mode under Discover;
  reduce visual weight of filters (progressive disclosure), UI-only.

### New Releases — `/app/new` (`ReleaseWall`)
- **Job:** Discover. **Primary action:** quick-look. **Nav:** primary (New).
- **Problems:** filter set (type/timing/platform/rating) is reasonable but shares
  purpose with Watch/Finder. **Must-not-change:** release data. Filter labels i18n.

### On TV — `/app/tv` (`OnTvGuide` + `TvDetective` + `MyReminders`)
- **Job:** On TV. **Primary action:** "Remind me" / "🔎 Scan the next Nh".
- **Nav:** primary. **Problems:** fixed `w-[5rem] sm:w-28` time column +
  `whitespace-nowrap` chips are ES/CJK-fragile; ET-only times (data concern).
  **Must-not-change:** schedule retrieval, reminders, the honest empty-state
  fallback (a strength). i18n time formatting is a **protected-logic proposal**
  (schedule is ET-sourced), not a silent change.

### TV Guide Detective — component in `/app/tv` (`TvDetective`)
- **Job:** On TV. **Primary action:** "🔎 Scan the next Nh". Healthy; keep as a
  section of On TV, not a separate app.

### Watchlist — `/app/watchlist` (`WatchlistManager`)
- **Job:** Saved. **Primary action:** manage/star. **Nav:** primary. Healthy;
  i18n labels + status names. **Must-not-change:** watchlist statuses.

### Watch DNA — `/app/dna` (+ `TasteDials`, `ShareCard`)
- **Job:** Profile (understand/improve taste). **Primary action:** "Rate more →".
- **Nav:** secondary (More). **Problems:** dimension/personality/dial labels
  hardcoded EN (45+ strings in the pure engine — translate at display layer);
  share card is a fixed-pixel canvas (ES/CJK overflow). **Must-not-change:** DNA
  calculations, `dimensionOverrides` write path, share-card visual style.

### Mentalist / Mood / Quiz — `/app/mentalist`, `/app/mood`, `/app/quiz`
- **Job:** Ask/onboarding taste. **Problems:** three more taste front-doors,
  mostly unlinked. **Must-not-change:** their logic. Consolidate as entry points
  *into* Ask/DNA rather than standalone destinations (IA grouping, not deletion).

### Tonight, Together — `/app/together`
- **Job:** Together. **Primary action:** "🌐 Start a live Court".
- **Nav:** secondary ("Movie night together"). **Problems:** **stacks four
  sub-features** (`JudgeBench`, `StartLiveCourt`, `CloudCrews` synced juries,
  `TogetherPlanner` on-device jury) on one page → reads as four apps. **Together
  is a top differentiator and deserves primary nav.** **Must-not-change:** court
  sessions, synced-jury data, QR joining, private voting.

### Live Taste Court / Synced Jury — `/court/[code]`, `/join/[code]`, `CloudCrews`
- **Job:** Together. **Primary action:** host "⚖️ Deliver the ruling".
- **Problems:** spans together→court→join with its own public chrome; multilingual
  group support not yet possible (store enums, localize per viewer — see i18n
  arch §11). **Must-not-change:** the lobby/veto/verdict phases, voting, waiting
  room — all strengths.

### Friends — `/app/friends`
- **Job:** Together/Profile. **Primary action:** `FindPeople` search.
- **Nav:** secondary. Healthy; i18n. **Must-not-change:** friend relationships.

### Subscription Value — `/app/subscriptions`
- **Job:** Profile/Discover. **Primary action:** "Pick my services".
- **Nav:** secondary. **Problems:** **currency hardcoded USD + US-only price
  table** (locale-format + product-review); verdict labels i18n.
  **Must-not-change:** the value logic; localize presentation, flag price data.

### Chambers (Court Standing + Badges) — `/app/chambers`
- **Job:** Profile. **Problems:** a self-contained gamification app disconnected
  from the core loop; splits Profile with `/app/settings`. Court/rank/badge names
  = transcreation. **Must-not-change:** Court Standing, badge progress, ranks.

### Settings — `/app/settings` (`SettingsView`)
- **Job:** Profile. **Primary action:** save preferences. **Problems:** region
  options hardcoded EN country names; **no Language & Region control exists**
  (must be added). **Must-not-change:** service-selection data, account fields.

### /lite, /app/easy, /app/vintage, ViewModeToggle
- **Problem:** overlapping "simple/big-text/desktop" modes, inconsistently
  surfaced (Home copy even claims "Vintage lives in top nav" but the nav shows the
  Desktop-view toggle). **Recommend:** rationalize into one accessibility/"Simple
  view" concept (the `data-simple` Senior mode already exists) — **propose
  separately**, do not delete working routes in this phase.

## 3. Cross-cutting problems

- **Redundant `NavArrows` on every screen** → remove/reduce (Nav principle #4–6).
  UI-only, low risk, high coherence payoff.
- **Ask not central** → promote `/app/ask` to primary nav; make the ask box the
  single dominant Home action.
- **Six ask front-doors** → keep the engines, group them under one "Ask" job with
  clear secondary entry (Mood/Mentalist/Quiz as ways to feed DNA).
- **No loading/error boundaries** (`src/app` has no `loading.tsx`/`error.tsx`/
  `Suspense`) → add consistent skeletons/error states (matches the honest-empty
  strength already present). UI-only.
- **Everything hardcoded English** → i18n foundation (separate architecture doc).

## 4. Proposed information architecture (from the brief, validated against routes)

**Desktop primary:** Ask · Discover · On TV · Saved · Together · Profile
**Mobile primary:** Home · Ask · Saved · Together · Profile
**Under Profile/More:** Watch DNA · Friends · Subscription Value · Badges ·
**Language & Region** · Service Settings · Account Settings

Mapping (preserve all existing routes as deep links):
- **Ask** → `/app/ask` (promote) with Home's ask box as the fast path; Mood/
  Mentalist/Quiz as secondary "teach your taste" entries.
- **Discover** → `/app/watch` (default) with New (`/app/new`) and Forensic Search
  (`/app/finder`) as tabs/advanced.
- **On TV** → `/app/tv` (+ Detective + reminders).
- **Saved** → `/app/watchlist`.
- **Together** → `/app/together` (promote to primary).
- **Profile** → hub linking `/app/settings`, `/app/chambers`, `/app/dna`,
  `/app/friends`, `/app/subscriptions`, plus a NEW Language & Region surface.

**Do NOT** implement nav changes until routes/deep-links are confirmed preserved
(they are, per the route map) and each label is verified to fit en/es/zh.

## 5. What stays exactly as-is

Brand visuals (all of `docs/current-watchverdict-visual-language.md` §9), all
protected business logic (search/finder/DNA/court/jury/badges/friends/save/pass),
all existing routes and deep links, the honest empty-states, the poster-forward
cards, Judge Verity, the DNA burst, share cards. This is coherence + i18n, not a
redesign.
