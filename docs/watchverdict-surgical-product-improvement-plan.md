# WatchVerdict — Surgical Product-Improvement Plan

> Phase-1 deliverable. The sequenced, risk-assessed roadmap. Each item states:
> problem · improvement · brand preserved · components · protected logic · risk ·
> testing · UI-only-vs-behavior · now-vs-deferred · how it serves the decision
> promise · languages affected. **Nothing here is implemented yet.** Implement in
> small reversible commits, in this order, verifying gates + screenshots per step.

Legend — Risk: 🟢 low (UI-only, reversible) · 🟡 medium (touches data/format) ·
🔴 high (touches protected logic → requires a separate proposal + review).

## Guardrails (apply to every commit)

- Gate before each commit: `npm run typecheck && npm run lint && npm test && npm run build` (currently green: 210 tests).
- Reuse exact existing tokens/values (see visual-language doc). No new colors.
- No renaming of protected API/DB fields. No removal of working features.
- 🔴 items are **documented proposals**, not silent changes — pause for review.
- Every new user-facing string goes through the message catalog (no new hardcoded English).

---

## Commit group 1 — Audit & documentation ✅ (this phase)
5 docs + git-safety + baseline. Risk 🟢. Done before any code change.

## Commit group 2 — Internationalization architecture (foundation)
- **Problem:** zero i18n infra; `<html lang>` hardcoded; no locale detection.
- **Improvement:** add `next-intl` (App Router, cookie/header-driven, **no URL
  routing** to preserve routes); locale resolution (profile → cookie → Accept-
  Language → `en-US`); `messages/{en-US,es-419,zh-Hans}.json` (English populated,
  others stubbed); `<html lang>` per request; a `formatCurrency/Date/Number`
  helper module; additive `profiles` migration (`ui_locale`, `voice_locale`,
  `content_language`, `timezone` — all nullable).
- **Brand preserved:** all. **Components:** `layout.tsx`, `middleware.ts`, new
  `i18n/` module, new migration. **Protected logic:** none (additive).
- **Risk:** 🟡 (routing/middleware + migration). **Testing:** build + a locale-
  switch smoke test; verify existing routes/deep-links unchanged; migration is
  re-run-safe. **Scope:** infra/behavior-enabling. **Now.** **Promise:** enables
  the multilingual promise. **Languages:** all.

## Commit group 3 — English message extraction
- **Problem:** ~strings inline across 158 `.tsx` + server copy.
- **Improvement:** extract user-facing English into `en-US.json` by namespace
  (`nav`, `ask`, `verdict`, `dna`, `dials`, `badges`, `subscriptions`, `states`,
  `toasts`, `validation`, `share`, `notifications`); replace literals with `t()`.
  Do it area-by-area (aligns with groups 6–21), not one mega-commit.
- **Brand preserved:** all (same text, now keyed). **Protected logic:** none
  (presentation only; pure engine keeps emitting enums/keys — translate at display).
- **Risk:** 🟢 per area (🟡 for `verdict.ts` sentence refactor → see group 10/14).
  **Testing:** snapshot the rendered English is unchanged. **Now** (incremental).
  **Promise:** substrate for es/zh. **Languages:** all.

## Commit group 4 — Spanish core translations (`es-419`)
- **Improvement:** translate `es-419.json`; contextual for examples/banners;
  transcreate brand (Judge Verity, Chambers, DNA archetypes); ICU plurals; keep
  titles/trademarks. **Risk:** 🟢. **Testing:** ES render at 375/768/1440;
  overflow check on nav/pills/cards. **Now.** **Languages:** es.

## Commit group 5 — Simplified Chinese core translations (`zh-Hans`)
- **Improvement:** translate `zh-Hans.json`; suppress `uppercase`/`tracking` for
  zh; CJK-safe font fallback for `CourtroomDoors`; raise `leading-none` on labels
  paired with CJK. **Risk:** 🟡 (typography). **Testing:** zh render; glyph
  clipping check on badges/headings. **Now.** **Languages:** zh.

## Commit group 6 — Navigation hierarchy
- **Problem:** Ask absent from nav; primary under-weights Ask/Together; redundant
  `NavArrows` on every page; profile split.
- **Improvement:** primary nav → **Ask · Discover · On TV · Saved · Together ·
  Profile** (desktop) / **Home · Ask · Saved · Together · Profile** (mobile);
  move DNA/Friends/Subscriptions/Badges/**Language & Region**/Services/Account
  under Profile; **remove `NavArrows`** (keep a contextual Back only where a
  guided flow needs it). Preserve all routes as deep links.
- **Brand preserved:** nav styling, logo, tokens. **Components:** `Nav.tsx`,
  `nav/MobileNav.tsx`, `MoreMenu.tsx`, `NavArrows.tsx`, `app/layout.tsx`.
  **Protected logic:** none (labels/links only; no route deletion).
- **Risk:** 🟢. **Testing:** every old route still resolves; nav labels fit
  en/es/zh at 320–1440; no truncation. **Now.** **Promise:** makes **Ask the
  center**. **Languages:** all (label-fit critical).

## Commit group 7 — Recommendation-card responsive structure
- **Problem:** tight action groove + pink box + ratings can crowd on small
  screens and with longer labels.
- **Improvement:** verify/adjust `PosterCard`/`AlgorithmScore` reflow; allow
  For/Pass/Save labels to shrink-to-icon gracefully; ensure poster-forward
  hierarchy holds at 320px. **Brand preserved:** card visuals. **Protected:**
  save/pass/for behavior. **Risk:** 🟢. **Testing:** 320–1440 × en/es/zh. **Now.**

## Commit group 8 — Information hierarchy (Home + result density)
- **Problem:** Home ~10 CTAs; no single dominant action.
- **Improvement:** one dominant ask box; demote secondary CTAs to a calmer
  supporting tier; keep all sections but reduce competing prominence.
  **Brand preserved:** all. **Protected:** data unchanged. **Risk:** 🟢.
  **Testing:** visual + "one obvious primary action" check. **Now.** **Promise:**
  reduces decisions. **Languages:** all.

## Commit group 9 — Action-control refinement
- **Problem:** competing CTAs across screens; excessive button prominence.
- **Improvement:** one visually-dominant CTA per screen; standardize secondary
  actions to `.btn-secondary/.btn-ghost`. **Risk:** 🟢. UI-only. **Now.**

## Commit group 10 — Voice-result presentation
- **Problem:** two ask front-doors; result/parse display inconsistent; server
  reason sentences are concatenated (i18n-hostile).
- **Improvement:** unify the ask result presentation; show the interpreted query
  + ranked answers + honest "few qualify" state consistently. **The `verdict.ts`
  reason/one-liner refactor to structured `{code, params}` is 🔴** (touches the
  scoring presentation contract) → **separate proposal**; until then, localize the
  existing whole strings as contextual messages. **Components:** `AskTheJudge`,
  `FinderUI` results, `verdict.ts` (proposal only). **Risk:** 🟢 UI / 🔴 for the
  engine refactor. **Testing:** ask flows + the 7 scoring scenarios stay green.
  **Now** (UI) / **defer** (engine refactor). **Promise:** core "quality after you
  speak". **Languages:** all.

## Commit group 11 — New Releases filter refinement
Progressive-disclosure the `ReleaseWall` filters; i18n labels. Risk 🟢. Now.

## Commit group 12 — On TV refinement
- **Improvement:** relax fixed `w-[5rem] sm:w-28`/`whitespace-nowrap` for es/zh;
  keep the honest empty-state. **TV time localization (user timezone) is 🔴**
  (schedule is ET-sourced) → **separate proposal**. Risk 🟢 UI / 🔴 tz. Now (UI).

## Commit group 13 — Watchlist refinement
i18n statuses/labels; verify reflow. Protected: statuses. Risk 🟢. Now.

## Commit group 14 — Watch DNA summary
- **Improvement:** localize tier/personality/dimension labels via display-layer
  keys (engine unchanged); tidy summary hierarchy. **Protected:** DNA math + the
  pure engine (translate by `key`/`title`, never edit `src/lib/scoring/*`).
  Risk 🟢 (🔴 only if we alter engine outputs — we won't). **Testing:** 7 scenarios
  green. Now. **Languages:** all.

## Commit group 15 — Watch DNA detailed dials
i18n dial labels; verify slider + dealbreaker checkbox reflow es/zh. Protected:
`dimensionOverrides` write. Risk 🟢. Now.

## Commit group 16 — Tonight, Together entry screen
- **Problem:** four sub-features stacked → reads as four apps.
- **Improvement:** a clear entry screen with one dominant "Start" action and the
  jury/crew options as calm secondary choices; keep all sub-features. **Protected:**
  court/jury/QR/voting. Risk 🟢. **Testing:** start-a-court flow intact. Now.
  **Promise:** group decisions. **Languages:** all.

## Commit group 17 — Live Taste Court & Synced Jury refinement
Localize lobby/veto/verdict labels; keep waiting-room. **Protected:** sessions,
voting, QR. Risk 🟢. **Testing:** lobby→verdict flow. Now.

## Commit group 18 — Multilingual Jury support
- **Improvement:** each participant sees labels in THEIR uiLocale over shared
  language-neutral state (store enums/scores, localize on display — i18n arch §11).
  **Protected:** synced-jury data contract (no pre-localized text stored).
  Risk 🟡. **Testing:** two-locale session renders correctly per viewer. Now.
  **Promise:** each participant's own language. **Languages:** all.

## Commit group 19 — Friends & compatibility refinement
i18n; verify compatibility display. Protected: friend data, compatibility logic.
Risk 🟢. Now.

## Commit group 20 — Subscription-value refinement
- **Improvement:** `formatCurrency` (locale+region) replaces `$${n.toFixed(2)}`;
  i18n verdict labels. **US-only price DATA stays** and is flagged **product-
  review** (not localized values, only formatting). Risk 🟡. **Testing:** currency
  renders per locale; value logic unchanged. Now (format) / defer (price data).

## Commit group 21 — Profile & badge refinement
Profile hub linking Settings/Chambers/DNA/Friends/Subs + **Language & Region**;
i18n rank/badge names (transcreation). Protected: standing, badges, account.
Risk 🟢. Now.

## Commit group 22 — Accessibility
- **Improvement:** ensure `loading.tsx`/`error.tsx` boundaries + skeletons (none
  exist today); verify focus/contrast/tap-targets across locales; keep
  `prefers-reduced-motion` (already honored); CJK line-height. Risk 🟢. Now.

## Commit group 23 — Responsive & multilingual testing
Screenshot matrix (10 viewports) × 3 languages at the required subset; fix
overflow/clipping found. Risk 🟢. Now.

## Commit group 24 — Visual verification
Side-by-side before/after per language; confirm the app is immediately
recognizable in all three. Risk 🟢. Now.

---

## Deferred / separate-proposal items (🔴 — do NOT do silently)

1. **`verdict.ts`/`personality.ts` sentence refactor** to structured reason codes
   (i18n-correct word order). Touches the scoring presentation contract + the 7
   scenarios. → design doc + review before implementing.
2. **User-timezone TV times** (ET-sourced schedule → per-user display). Data/logic.
3. **Region-specific subscription price data** (currently US estimates). Product.
4. **Deep non-English NLU** in the deterministic parsers (LLM path handles it;
   detectors are English-centric). Larger workstream — pairs with live-mode eval.
5. **Rationalizing `/lite` + `/app/easy` + `/app/vintage` + ViewModeToggle** into
   one accessibility concept. Product decision; don't delete working routes now.

## Recommended execution order

Groups 2 → 3 → 6 → 8/9 → 7 → 4 → 5 → 10(UI) → 14/15 → 16/17/18 → 11/12/13/19/20/21
→ 22/23/24. i.e. **foundation → nav/coherence → English keys → translations →
per-screen polish → a11y/testing/verification**, with 🔴 items pulled out as
proposals.

## Baseline screenshots — status & limitation

Playwright + Chromium are available (`PLAYWRIGHT_BROWSERS_PATH`). However, the
authenticated product (`/app/**`) requires a live Supabase session + TMDB data to
render meaningfully, and the client requires `NEXT_PUBLIC_SUPABASE_*` at runtime —
**not available in this environment**. Public/marketing routes can be shot, but
the feature screens cannot be captured faithfully here. **Recommendation:** run
the group-23 screenshot matrix against a seeded staging deployment (or a local run
with real env + a seeded demo user). The matrix, viewports, and per-language
subset are specified in the brief and captured in group 23; directories
`docs/screenshots/baseline/` and `docs/screenshots/localized/` are reserved.
