# WatchVerdict — Language & Region Architecture

> Phase-1 deliverable. The target model for multilingual support (en-US, es-419,
> zh-Hans) on the EXISTING single app + single business logic. Design only — no
> code changed here. Implementation is sequenced in the surgical improvement plan.

## 1. Core principle — language ≠ region

Six independent concepts, never collapsed into one `language` field:

```jsonc
{
  "uiLocale":        "es-419",            // interface strings + formatting
  "voiceLocale":     "es-MX",             // SpeechRecognition lang
  "contentLanguage": "es",               // TMDB title/overview/poster language
  "marketRegion":    "US",               // provider availability, certs, catalog
  "timezone":        "America/New_York",  // TV schedule display
  "currency":        "USD"                // subscription pricing
}
```

Why: a Spanish speaker in the US watches the US catalog with US prices in US
timezone, but wants a Spanish interface, Spanish voice recognition, and Spanish
titles where TMDB has them. Language must not imply market. **`marketRegion`
already exists** as `profiles.region` and stays the availability driver.

Supported this phase:
- **uiLocale:** `en-US` (default), `es-419`, `zh-Hans`
- **voiceLocale:** `en-US`, `es-US`, `es-MX`, `zh-CN`
- **contentLanguage:** `en`, `es`, `zh` (TMDB), English fallback when missing
- **marketRegion:** `US` first (architecture allows adding GB/CA/MX/… later)

## 2. No URL-locale routing (preserve routes & deep links)

**Constraint:** existing routes and deep links must be preserved (no `/es/…`
prefixes). Therefore locale is resolved **out of band**, not from the path:

**Resolution order (first hit wins):**
1. Signed-in user's `profiles.ui_locale`.
2. `wv_locale` cookie (set on explicit choice; readable in Server Components +
   middleware).
3. `Accept-Language` header (server) / `navigator.language` (client) negotiated
   against supported locales.
4. Default `en-US`.

Set the resolved locale on a cookie so SSR and the client agree. `<html lang>`
is set per request from the resolved uiLocale (currently hardcoded `"en"`).

## 3. Library choice

**Recommended: `next-intl` in App Router "without i18n routing" mode.**
- ICU MessageFormat (needed for the plural/gender/number work the audit flagged).
- App Router server+client support; locale supplied via `getRequestConfig` reading
  our cookie/header (no `[locale]` segment).
- Small, well-maintained; one dependency.

Alternative if we want zero new deps: a minimal custom provider + `Intl.*` +
`intl-messageformat` for ICU. Not recommended — reinvents next-intl. **Decision:
next-intl, cookie/header-driven, no URL routing.**

## 4. Message catalogs

```
messages/
  en-US.json        # source of truth (English)
  es-419.json
  zh-Hans.json
```
Namespaced by area to keep diffs reviewable and lazy-loadable:
`nav`, `ask`, `verdict`, `dna`, `dials`, `badges`, `subscriptions`, `together`,
`court`, `friends`, `profile`, `states` (empty/loading/error), `toasts`,
`validation`, `share`, `notifications`.

ICU examples (from the audit's risk list):
```json
{
  "digest.body": "{count, plural, one {# new pick that fits your taste just landed.} other {# new picks that fit your taste just landed.}}",
  "share.expiry": "{days, plural, one {# day} other {# days}}",
  "verdict.reason.longRuntime": "Long runtime ({minutes} min) — a real time commitment."
}
```

## 5. Server-emitted / engine strings

Two categories need care because they're produced server-side, not in JSX:

**A. Pure scoring engine (`src/lib/scoring/*`).** CLAUDE.md forbids changing it and
requires the 7 scenarios to keep passing. So the engine keeps emitting **stable
enums/keys**, not localized prose:
- Tiers/calls (`WATCH IT`, `Must Watch`), dimension `key`s, personality `title`s,
  and reason **codes** — all already stable identifiers. The presentation layer
  translates by key (`t('verdict.tier.mustWatch')`, `t('dims.pace.high')`).
- The concatenated reason/one-liner sentences (`buildReasons*`, `buildOneLiner`)
  are refactored so the engine returns **structured reason objects**
  `{ code, params }` (a UI-only, behavior-preserving change to the presentation
  data, NOT the scoring math), and the client renders them via ICU messages. If
  the engine must keep returning strings for back-compat, add a parallel
  `reasonCodes` field the UI prefers — documented as a separate protected-logic
  change proposal, not done silently.

**B. API routes returning display copy** (`build-case`, `finder`, `ask`). These
resolve the request locale (cookie/header) and either (preferred) return
**message keys + params** for the client to format, or localize server-side with
the same catalog. New APIs use keys; existing ones get a compatibility layer.

## 6. Metadata (TMDB) localization

- Thread `contentLanguage` into the ~15 `tmdb/client.ts` calls as the `language`
  param. Localized titles/overviews/posters come back automatically; **fall back
  to English when TMDB lacks a translation** (never fabricate — data-honesty rule).
- Add `original_title`/`original_name` to `TitleMetadata` so we can show the
  original alongside a localized title.
- Locale-specific `TITLE_ALIASES` tables (transcreation), keyed by contentLanguage.

## 7. Voice

Drive SpeechRecognition `lang` from `voiceLocale` (default derived from uiLocale:
`es-419`→`es-US`, `zh-Hans`→`zh-CN`) in `AskTheJudge`, `HomeGreeter`, `SearchBar`.
The downstream NLU is English-centric today; **cross-language query understanding
is a separate, larger workstream** (flagged as deferred — the LLM parse path can
handle non-English, the deterministic detectors cannot). This phase ships
localized *interface + voice capture*; deep non-English NLU is a follow-on.

## 8. Formatting

Centralize `Intl.*` helpers keyed by uiLocale + region:
- `formatCurrency(amount, {currency, uiLocale})` → replaces `$${n.toFixed(2)}`.
- `formatDate`/`formatTime`/`formatRelative` → replaces `toLocaleDateString([])`
  and ISO slicing; TV times formatted in the user's `timezone` (the ET hardcode
  becomes a display concern, tracked as a protected-logic proposal since schedule
  data is ET-sourced).
- `formatNumber`, `formatList` for locale-correct joins.

## 9. Data model changes (minimal, additive)

New migration (additive, nullable, back-compatible — no rename of protected
fields):
```sql
alter table profiles
  add column if not exists ui_locale text,        -- e.g. 'es-419'
  add column if not exists voice_locale text,      -- e.g. 'es-MX'
  add column if not exists content_language text,  -- e.g. 'es'
  add column if not exists timezone text;          -- e.g. 'America/New_York'
-- marketRegion stays `region`; currency derived from region for now.
```
All nullable with app-level defaults so existing rows/behavior are untouched.

## 10. What stays out of scope this phase

- Additional market regions beyond `US` (architecture supports; data not added).
- Machine translation at render time (never — catalogs only).
- Separate apps/codebases (never — one shared app).
- Deep non-English NLU in the deterministic parsers (deferred to the LLM path).
- Real-time localized pricing feeds (US price table localized-formatted for now;
  real per-region prices flagged as product-review).

## 11. Group-session multilingual note

Live Taste Court / Synced Jury must let each participant use their own uiLocale +
voiceLocale independently while sharing one session's data (verdicts are
enums/scores, not prose) — so a session renders per-viewer localized labels over
shared language-neutral state. No shared-session text should be stored
pre-localized; store keys/enums, localize on display.
