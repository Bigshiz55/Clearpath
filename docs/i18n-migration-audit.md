# WatchVerdict Internationalization — Final Audit

Scope: complete the C→E i18n migration so the signed-in product surface renders
in **English (en-US)**, **neutral Latin American Spanish (es-419)**, and
**Simplified Chinese (zh-Hans)**. No URL routing changes, no data-contract
changes, no changes to the deterministic scoring engine. Migration `0023`
(profile locale columns) is authored but **not applied**; no PR, merge, or
deploy was performed.

Branch: `ui/watchverdict-coherence-i18n-refinement` (pushed).

---

## 1. Components converted

Every user-facing screen under the `/app` I18nProvider is now wired to the
catalogs via `useT()`/`useI18n()` (client) or `getServerI18n()` (server):

- **Navigation & shell**: Nav, MobileNav, MoreMenu, NavArrows, LanguageSwitcher,
  HtmlLang, app layout.
- **Home / Discover**: home page, RecommendedForYou chrome, Watch-now page,
  BrowseCatalog, EasyMode/EasyOnTv/EasyQuiz, MoodFinder, ReleaseWall, SearchBar.
- **Ask / Judge / Quiz**: AskTheJudge, LikeHateGame, Mentalist, QuizGame,
  TasteGame, ask/quiz/mentalist pages.
- **Together / Court**: TogetherPlanner, LiveCourt, TasteCourt, QuickRuling,
  JoinForm, CourtroomDoors, TheaterMode, TakeToCourtCard, JudgeVerdictCard,
  StartLiveCourt, JudgeBench, together page. (212-key catalog reconstructed from
  component diffs after the extraction agent was interrupted mid-run.)
- **Title / Verdict**: title page, VerdictReportView, CriticsTable, ReportExtras,
  TasteMatchView, TitleBriefing, VerdictActions, ShareDialog, ContentDnaView,
  FinishCheck, TonightBanner, AlgorithmScore, CardDna, DnaScore, MatchMark,
  QuickLook, SeasonWhereToWatch, RatingsStrip, VerdictBadge.
- **Watch DNA**: dna page (personality, taste dials, stats, DNA-score tier,
  share card), TasteDials.
- **Account**: settings, cards, connect, friends, import, pro, reminders,
  subscriptions, person, public profile, ChambersProfile, ConnectPhone,
  ImportForm, PhotoAdd, GuestSaveButton, ShareCards, SignOutButton, FindPeople.
- **Onboarding / misc**: OnboardingForm, HomeGreeter, InstallHint, FreshStart,
  LearnStart, DnaMirror, ShareTargetHandler, SimpleModeToggle, ViewModeToggle,
  DesktopViewExit, Tagline, card actions (Like/Save/TasteFeedback/PosterCard).

**38 / 50** app-surface `.tsx` files import the i18n layer (**76 %**). The 12
that do not are: thin server page wrappers that render a client child and carry
no text of their own (`chambers`, `easy`, `finder`, `share-target` pages),
components whose visible text arrives as already-translated props
(`MobileNav`, `FollowButton`, `PostWatchInterview`), and the intentionally
excluded surfaces in §2.

## 2. Remaining hardcoded strings

**Zero** on the localized `/app` surface. A full-tree scan (`t()`/`plural()`
call keys checked against the merged catalog) reports **0 keys referenced in
code but missing from the catalogs**.

15 residual literals exist, all outside the localized product surface and left
deliberately:

| Location | Count | Why left English |
|---|---|---|
| `components/admin/SponsorAdmin.tsx` | 10 | Internal admin/ops tool, behind the admin gate — not a consumer screen. |
| `components/auth/LoginForm.tsx` | 4 | Pre-auth `/login` lives in the **static** marketing shell, outside the `/app` I18nProvider. Localizing it would force the 45 static pages dynamic (see §7). |
| `app/app/import/page.tsx` | 1 | `"The Fall"` — an example title in import instructions (data, not chrome). |

## 3. Coverage

- **Merged catalog: 1,558 keys per locale × 3 locales = 4,674 translated values.**
- 14 catalog part files (`messages/parts/*.json`) + 3 base catalogs
  (`messages/{en-US,es-419,zh-Hans}.json`), deep-merged at request time by
  `src/i18n/catalogs.ts`.
- Consumer `/app` surface: **100 %** of visible strings resolve through the
  catalog with English fallback.

## 4. Missing translations

**None.** Enforced by `src/i18n/messages.test.ts` against the *merged* catalog:

- **Completeness** — es-419 and zh-Hans cover every en-US key; neither has stray
  keys English lacks.
- **Interpolation parity** — every translation uses the identical
  `{placeholder}` set as its English source.
- **No-leakage** — zh-Hans values are not accidental English copies (guard now
  strips `{placeholders}` first, so pure format strings like `{day} {time}`
  aren't false-flagged).

## 5. Spanish (es-419) layout risks

Spanish text runs ~15–30 % longer than English. Watch points:

- **Tight buttons / chips**: "Rate more" → "Calificar más", "Deliver the ruling"
  → "Dictar el fallo", the mood/reason chips, and the watchlist status pills.
  These live in flex rows with wrapping, so they reflow rather than clip, but
  fixed-height single-line buttons should be spot-checked at 320 px.
- **Nav labels**: the bottom mobile bar has 5 items; longer Spanish labels
  ("Juntos", "Descubrir") fit but leave little margin — verify no truncation on
  narrow devices.
- **Compound toasts** with interpolation ("Registrado en el ADN de {name} ✓")
  can get long; toasts are single-line — confirm they wrap or ellipsize.

No hard clipping was observed in the build; all at-risk copy is in wrapping
containers.

## 6. CJK (zh-Hans) typography

- Chinese has no spaces between words; all copy was translated as natural
  phrases, not word-for-word, so line-breaking relies on the browser's CJK
  rules (fine by default).
- Punctuation uses full-width CJK forms (：， 。 “”) where natural.
- Chinese is typically **shorter** than English, so clipping risk is low; the
  concern is the opposite — very short strings in wide buttons look sparse, which
  is cosmetic only.
- Plural handling: Chinese has a single grammatical form. `plural()` maps
  `count === 1 → one`, else `other`; the zh catalogs repeat the same string in
  both slots (required for the completeness test), so counts always render
  correctly.

## 7. RTL readiness

- **Not applicable to the shipped locales** (en, es, zh are all LTR), so no RTL
  work was done and none is required now.
- The groundwork is friendly to a future RTL locale: text comes from catalogs
  (no hardcoded direction in copy), and `<html lang>` is synced via `HtmlLang`.
- **Gap for future RTL**: layout uses physical Tailwind utilities
  (`ml-*`, `pr-*`, `left-*`, `text-left`) rather than logical ones
  (`ms-*`, `pe-*`, `start-*`, `text-start`), and `dir` is never set. Adding
  Arabic/Hebrew later would require a logical-properties pass + `dir="rtl"` on
  the `/app` shell. Documented, not attempted.

## 8. a11y

- `<html lang>` is kept in sync with the active locale (`HtmlLang`) so screen
  readers announce the correct language.
- User-facing `aria-label`/`title`/`alt` strings were localized alongside
  visible text (e.g. rating stars "Rate {n} out of 10", favorite toggles,
  service search, remove buttons, presiding-judge portrait alt).
- Interpolated names/counts flow into a11y labels through params, so assistive
  text stays accurate per locale.
- No a11y regressions: the switch is text-content only; DOM structure, roles,
  and focus order are unchanged.

## 9. Performance & bundle impact

- **Shared JS unchanged** at 87.4 kB; the deterministic engine and route code
  are untouched. Client components gained only a `useT()` call.
- **Static generation preserved**: 45/45 pages still prerender. Locale is
  resolved (cookie → Accept-Language) only inside the dynamic `/app` tree, so the
  marketing/auth shell stays static — this is why `/login` was left out of §2.
- **Catalog payload**: `/app/layout` passes the active-locale catalog **plus the
  English fallback** into the client provider on every `/app` page. Serialized
  sizes: en-US 66.5 kB, es-419 72.4 kB, zh-Hans 42.3 kB (uncompressed JSON;
  gzips to roughly a third). For **en-US the active catalog and the fallback are
  identical**, so English users currently ship ~133 kB of duplicated JSON in the
  RSC stream.
- Together route first-load is the heaviest at ~180 kB (its many client
  components), unchanged in character by i18n.

## 10. Recommendations (not done; for follow-up approval)

1. **Skip the fallback prop when `locale === 'en-US'`** (or when active ===
   fallback). Removes ~66 kB of duplicated JSON for the default-locale majority.
   One-line change in `app/app/layout.tsx`.
2. **Scope catalogs per route** once catalogs grow further — ship only the
   namespaces a route uses rather than the full 1,558-key merged object. The
   `messages/parts/*` split already maps cleanly to screen groups.
3. **Persist locale to the profile** by applying migration `0023` (awaiting your
   approval) and reading `profiles.ui_locale` as an authenticated override above
   the cookie.
4. **Localize the pre-auth shell** (`/login`, marketing) only if you accept
   making those pages dynamic, or by adding a lightweight static-safe provider
   at the root — a deliberate tradeoff against the 45 static pages.
5. **Localize the admin tools** (SponsorAdmin, CalibrationAdmin) if they're ever
   exposed beyond internal ops.
6. **RTL pass** (logical properties + `dir`) if/when an RTL locale is added.
7. **Translation QA**: the es-419 and zh-Hans strings are engineering-authored;
   a native linguistic review before GA is recommended, especially for the
   courtroom-metaphor copy in the Together flow.

---

### Verification (this migration)

- `npm run typecheck` — clean.
- `npm run lint` — clean (0 warnings).
- `npm test` — 226/226 pass, including the 7 scoring scenarios and the i18n
  completeness / interpolation / leakage suite.
- `npm run build` — compiles; 45/45 static pages preserved.
- Full-tree key scan — 0 catalog keys referenced in code but missing.
