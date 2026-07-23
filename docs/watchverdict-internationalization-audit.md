# WatchVerdict — Internationalization Audit

> Phase-1 deliverable. The "before" state of i18n and the classified inventory of
> what must be localized to support English (`en-US`), Spanish (`es-419`), and
> Simplified Chinese (`zh-Hans`). No code is changed by this document.

## 0. Headline findings

1. **There is ZERO i18n infrastructure today.** No `next-intl`/`react-intl`/
   `i18next`, no `messages/` or `locales/` dir, no `[locale]` routing, no ICU. The
   only `Intl.*` use is a hardcoded ET timezone formatter (`gracenote.ts:144`).
2. **Region is already decoupled from language** — `profiles.region` drives TMDB
   `watch_region`/certs and is orthogonal to UI language. This is the right shape
   to build on. But there is **no `language`/`locale`/`timezone`/`currency` column**.
3. **The deepest structural risk is `src/lib/scoring/verdict.ts` (and
   `personality.ts`)** — user-facing sentences are built by string concatenation +
   `.toLowerCase()` on interpolated nouns. These must become parameterized ICU
   messages at a presentation layer (CLAUDE.md forbids editing the pure engine).
4. **TMDB is always called with `language: 'en-US'`** (~15 sites) and
   **SpeechRecognition `lang` is hardcoded `'en-US'`** in all 3 voice components.
5. Every user-facing string is an inline English literal (≈158 `.tsx` files,
   54 `toast.show` sites).

## 1. Existing infrastructure — NONE

- `package.json`: no i18n library. No `messages/`/`locales/`/`i18n/` dir. No
  `[locale]` segment; `next.config` has no `i18n` block; `middleware.ts` only
  refreshes Supabase session + gates `/app`.
- **Implication:** a locale framework, message catalogs, and locale detection must
  be built from scratch (see `docs/watchverdict-language-and-region-architecture.md`).

## 2. Locale / language / region today

| Concern | State | File |
|---|---|---|
| Browser-language detection | **none** | — |
| User language preference | **none** (no column/cookie/localStorage) | `profiles` schema |
| Voice locale | hardcoded `'en-US'` | `AskTheJudge.tsx:143`, `HomeGreeter.tsx:76`, `SearchBar.tsx:83` |
| Region | `profiles.region` default `'US'`, `regionFor()` | `migrations/0001:47`, `src/lib/profile.ts` |
| TMDB language | hardcoded `'en-US'` (~15 calls) | `src/lib/tmdb/client.ts` |
| Timezone | hardcoded `America/New_York` (ET) | `gracenote.ts:144`, `tvGrid.ts:35` |
| Currency | hardcoded `$`+`.toFixed(2)`, US-only price table | `subscriptions/page.tsx:12`, `subscriptionValue.ts` |
| Date/number | only `toLocaleDateString([])` (browser locale) | `MyReminders.tsx:21` |
| `profiles` locale columns | **only `region`** | `migrations/0001` |

**Region picker options** are themselves hardcoded English country names
(`OnboardingForm.tsx`, `SettingsView.tsx` `['US','GB','CA','AU','IE','DE','FR','IN','BR','MX']`).

## 3. String inventory by area (representative, not exhaustive)

| Area | Files | Examples | Classification |
|---|---|---|---|
| Nav labels | `Nav.tsx`, `nav/MobileNav.tsx`, `MoreMenu.tsx` | Home, Watch Now, New, On TV, Watchlist, Your Watch DNA, Subscription check 💸, Movie night together, Chambers, Settings | directly-translatable (+ Chambers/Watch DNA = transcreation) |
| Search/voice + examples | `BuildCaseBox.tsx:21-28`, `AskTheJudge.tsx:66` | "What's on TV tonight?", "The best movies on Netflix right now", Judge Verity greeting | contextual-translation; Judge Verity persona = transcreation |
| Verdict/tier/call labels | `scoring/verdict.ts` | WATCH IT / MAYBE / SKIP IT; Must Watch / Strong Watch / … | directly-translatable (at display layer, not in pure engine) |
| Verdict reason sentences | `scoring/verdict.ts` (`buildReasons*`, `buildOneLiner`) | "Long runtime (${n} min) — a real time commitment.", "${topPos.label.toLowerCase()} lands squarely in your wheelhouse." | **contextual + STRUCTURAL** (concatenation risk §5) |
| DNA dimensions/dials | `scoring/dimensions.ts:24-38` (15×3 labels) | Pace: Slow burn↔Fast-paced; Tone: Feel-good↔Dark & heavy; Moral clarity: Clear-cut↔Morally grey | directly-translatable |
| DNA personalities | `scoring/personality.ts:22-92` (11 archetypes+blurbs) | The Slow-Burn Noir, The Moral Gray-Zone, The Prestige Purist, Still Calibrating | transcreation (puns) |
| Ranks + badges | `chambers.ts:48-121` | Clerk/Bailiff/Juror/Counsel/Magistrate/Judge; Opening Statement, Sworn In, Critic's Pen, Time Traveler | transcreation (court metaphor) + plural risk in descriptions |
| Subscription value | `subscriptionValue.ts`, `subscriptions/page.tsx` | "Are your subscriptions worth it?", `$X.XX/mo est.`, worth/underused/cancel/free | locale-formatting + product-review (US-only prices) |
| Empty/loading/error | `EmptyState.tsx`, `finder.ts:319-337` | "Nothing cleared your match bar — here are the closest, honestly labeled." | contextual-translation |
| Toasts (54 sites) | across components | "Rated ${value}/10.", "Removed from your watchlist.", "Something went wrong." | directly-translatable + concatenation risk |
| Validation | `actions/*` (zod) | mostly default zod (untranslated); "Use 3–24 lowercase letters…" | product/legal-review + custom error map needed |
| Push/digest/share | `push.ts`, `digest.ts:160`, `ShareCards.tsx` | "New for you on WatchVerdict", "${n} new pick${n===1?'':'s'}…" | contextual + transcreation + plural risk |
| API-returned copy | `build-case/route.ts`, `askJudge.ts`, `finder.ts` | build-case summaries, finder relaxed, scoring oneLiner | must reach server strings, not just JSX |

## 4. Title / metadata localization

- **TMDB `language: 'en-US'` hardcoded** (~15 calls in `tmdb/client.ts`). Making it
  locale-driven yields localized titles/overviews AND localized posters "for free"
  (TMDB picks `poster_path` per `language`), with English fallback when a
  translation is missing (honor the "data honesty" rule) → **metadata-provider-localization**.
- **`original_title`/`original_name` are never read** — no original-vs-localized
  distinction today. Add when localizing so we can show original alongside.
- **`TITLE_ALIASES`** (`nlu/detectors.ts`) are English-community shorthands
  (`got`, `lotr`, `the shark movie`→Jaws). Spanish/Chinese need **locale-specific
  alias tables** (transcreation), not translation.
- Content certs/ratings are region-based already (independent of UI language).

## 5. Formatting & linguistic risks (structural, not just words)

1. **Ad-hoc pluralization** (`pick${n===1?'':'s'}`, `${v} days`, `/mo`) → needs ICU
   `plural`/`selectordinal`. Chinese has no plural inflection but needs measure
   words; Spanish needs number+gender agreement.
2. **String concatenation + `.toLowerCase()`** in `verdict.ts` sentence builders —
   the single biggest risk. Glued nouns and forced lowercase break word order
   (Spanish) and are meaningless (Chinese). **Must become parameterized ICU
   messages** keyed off stable enums, at a display layer (the pure engine stays
   English-emitting internally; presentation translates by `tier`/`key`).
3. **Units** (`min`, `/10`) and **currency/dates** need `Intl.*` with the active
   locale + region currency.
4. **Gendered adjectives** in Spanish (archetype/adjective copy) — provide gendered
   or gender-neutral variants; the app is mostly second-person "you" (low risk).
5. **Emoji embedded in labels** (`Subscription check 💸`) travel with the message —
   locale-safe.

## 6. Classification summary

| Classification | Where |
|---|---|
| directly-translatable | nav, tier/call labels, dimension labels, toasts, badge descriptions |
| contextual-translation | search examples, empty/finder banners, verdict reason sentences, push copy |
| branded-transcreation | VERD1CT, Judge Verity, Chambers/court/ranks, DNA archetypes |
| must-remain-title/trademark | movie/show titles ("Barbie", "Jaws"), franchises |
| locale-aware-formatting | currency, dates, TV times, plurals, units |
| metadata-provider-localization | TMDB overviews/cast/localized titles+posters |
| product/legal-review | auth/account validation, share/legal copy, US-only prices |

## 7. Highest-impact work (feeds the improvement plan)

1. Locale framework + message catalogs + locale routing/detection (none exists).
2. `profiles.language` (+ `locale`, likely `timezone`); `navigator.language`/
   `Accept-Language` detection; a Language & Region settings surface.
3. Refactor `verdict.ts`/`personality.ts` sentence output to parameterized ICU
   messages at the presentation layer (keep the 7 pure-engine scenarios passing).
4. Locale-drive TMDB `language` (~15 calls) and SpeechRecognition `lang` (3 comps).
5. Locale-aware currency/date/number formatting + region-specific price data.
6. Locale-specific `TITLE_ALIASES`.

See `docs/watchverdict-language-and-region-architecture.md` for the target model
and `docs/watchverdict-surgical-product-improvement-plan.md` for sequencing/risk.
