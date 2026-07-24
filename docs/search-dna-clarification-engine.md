# WatchVerdict — Multilingual Clarification Engine

Branch: `feature/search-dna-and-search-lab` (isolated). Nothing merged or deployed.
Production wiring is behind a **feature flag** (`CLARIFY_ENGINE`, default OFF).

This document is the required deliverable set (12 items).

---

## 1. Existing architecture found (audit)

- The retrieval pipeline built earlier (`src/lib/search/retrieval/*`) already had
  English-only intent classification, expansion, confidence, and recovery.
- **Critical finding:** the app-wide **i18n message-catalog system is NOT on this
  branch** — it lives on the separate i18n PR branch
  (`ui/watchverdict-coherence-i18n-refinement`). On this branch, components render
  English literals and there is no `translate()`/catalog. Title identity
  (`titleMatch.ts`) already folds Unicode/diacritics (NFKD).
- Consequence: the Clarification Engine ships its **own self-contained, canonical
  localization** (complete keys + placeholders + fallback), structured to move into
  the shared catalog once that PR merges — rather than pretending a catalog exists.

## 2. English-only assumptions discovered

- Retrieval `intent.ts`/`expand.ts` used English-only regexes and English stop/greeting words.
- No canonical intent keys — intent names were display-ish (`title_lookup`, etc.).
- Cue/word matching in early drafts used raw `String.includes` (accent- and
  script-fragile). Fixed to uniform NFKD folding.
- No locale selection, no RTL handling, no title-vs-interface-language separation.
- Analytics had no schema; risk of logging translated labels as identifiers.

## 3. Files changed / added

**Engine (pure, canonical, language-independent):**
`src/lib/search/clarify/{canonical,locale,cues,entities,interpret,policy,localize,titleDisplay,engine,analytics}.ts`
**Tests:** `src/lib/search/clarify/{engine,localize}.test.ts` (26 tests).
**Shared pure helper:** `src/lib/askJudge.shared.ts` (already present).
**Route:** `src/app/api/ask/route.ts` (flag-gated `kind: 'clarification'` branch).
**Benchmark:** `eval/searchlab/clarify/{generator,metrics,clarify.searchlab,vitest.clarify.config}.ts`.
**Config:** `package.json` (`search-lab:clarify`).

## 4. Canonical intent & interpretation schemas

- Canonical intents (`canonical.ts`): `find_title, streaming_lookup,
  live_tv_schedule, upcoming_release, recommendation, similar_to, actor_lookup,
  director_lookup, franchise_lookup, genre_browse, mood_search, content_warning,
  group_watch, availability_by_service, release_date, watch_order, unknown`.
- Interpretations are canonical (`{ intent, meaningKey, entityType, entityRef,
  entityName, confidence }`) and only rendered to display text at the end. Meaning
  keys: `where_to_stream_title, title_airing_soon, new_franchise_release,
  show_franchise, find_the_title, similar_to_title, …`. Every language maps into
  these same values (e.g. "Where can I watch Rocky" / "¿Dónde puedo ver Rocky?" /
  "Wo kann ich Rocky streamen?" → `streaming_lookup + title Rocky`).

## 5. Localization keys added

`clarification.heading`, `clarification.one_quick_question`,
`clarification.which_did_you_mean`, `clarification.looking_for_something_else`,
`clarification.could_not_identify`, `clarification.try_one_of_these`,
`clarification.dismiss`, and `meaning.*` for each meaning key. Complete keys with
`{title}` placeholders — never fragment concatenation. Fallback chain
locale → base → English; missing keys are logged and never shown raw.

## 6. Locales completed

- **Shipped (fully translated):** `en`, `es`, `zh` (three families incl. non-Latin).
- **Scaffolded (architecture-ready, dictionary pending):** `fr`, `de`, `pt`, `ja`,
  and `ar` (RTL). `ar` has a full preview dictionary to prove RTL end-to-end. The
  cue lexicon covers en/es/fr/de/pt/ja/ar/zh so classification works before the UI
  dictionaries are completed.

## 7. Test coverage added

- 26 unit tests: policy bands, canonical vocabulary, cross-script entity resolution
  (Rocky = ロッキー = рокки = 洛奇 = روكي → `movie:1366`; Money Heist = La Casa de Papel =
  Haus des Geldes), title-vs-interface-language separation, query-language detection,
  RTL, localizer fallback + missing-key logging, and language-independence of the policy.
- A multilingual benchmark: 20 curated adversarial cases (all from the spec) + 1500
  generated ambiguous queries, with per-locale metrics and regression gates.

## 8. Test results by language

Benchmark (`search-lab-results/clarify/report.md`), shipped locales:

| locale | intent | top3 | entityRes | noResult | langMismatch | untranslated | recovery |
|---|---|---|---|---|---|---|---|
| en | 1.00 | 1.00 | 1.00 | 0 | 0 | 0 | 1.00 |
| es | 1.00 | 1.00 | 1.00 | 0 | 0 | 0 | 1.00 |
| zh | 1.00 | 1.00 | 1.00 | 0 | 0 | 0 | 1.00 |

**Regression vs English baseline: NONE.** All 20 adversarial cases pass (unambiguous
→ correct top-1 intent; genuinely ambiguous airing verbs → expected reading in
top-3 and a clarification is offered). "La Casa de Papel" with an English interface
answers in English; "The Dark Knight" with a Spanish interface answers in Spanish;
Arabic renders RTL with a mixed RTL+Latin title.

## 9. Known limitations

- Offline entity resolution uses a compact multilingual catalog; production must
  inject a TMDB-backed resolver (the resolution *contract* is identical). A title
  outside the offline catalog falls to a provisional `find_title` (medium
  confidence) rather than resolving to an id.
- `fr/de/pt/ja/ar` UI dictionaries are scaffolded (fall back to English) — cue
  classification works, but their clarification *text* is English until translated.
- The generated benchmark scales en/es/zh; other locales are covered by curated
  adversarial cases only.
- Display prefers the globally-recognized title (e.g. "Rocky"); a per-locale native
  primary (《洛奇》) is supported by `titleDisplay` but not enabled by default.

## 10. Performance & cost

- The engine is **pure and deterministic** — no model calls, sub-millisecond per
  query (1520 benchmark cases evaluate in well under a second). Locale selection is
  deterministic; strings are static; ids are universal. A larger LLM is only needed
  for genuinely hard ambiguity, which this layer avoids by design. No added
  production cost while the flag is OFF.

## 11. Rollback instructions

- The feature is OFF by default (`CLARIFY_ENGINE` unset). To disable after enabling:
  unset `CLARIFY_ENGINE` (or set ≠ `1`) — the route reverts to prior behavior with
  no code change.
- Full revert: `git revert <clarification commit>` on this branch. The engine
  modules are additive (`src/lib/search/clarify/*`, `eval/searchlab/clarify/*`); the
  only production touch is the flag-gated branch in `route.ts`.

## 12. Exact manual testing steps

```bash
# Unit + benchmark (offline, deterministic)
npm run typecheck && npm run lint && npm test        # 287 unit tests (26 clarify)
npm run search-lab:clarify                           # multilingual benchmark + report
cat search-lab-results/clarify/report.md

# Try the engine directly
npx tsx -e "import('./src/lib/search/clarify/engine.ts').then(m=>{
  for (const [q,o] of [['Rocky coming',{appLocale:'en'}],['Rocky viene',{appLocale:'es'}],
    ['洛奇什么时候播',{appLocale:'zh'}],['أين أشاهد روكي',{}],['The Dark Knight',{appLocale:'es'}]])
    { const r=m.clarify(q,o); console.log(r.locale, r.dir, r.decision.action, r.primaryLabel,
      (r.clarification?.options||[]).map(x=>x.label)); }
});"

# Exercise the flag-gated route (local dev)
CLARIFY_ENGINE=1 npm run dev
#   POST /api/ask  { "text": "Rocky coming", "locale": "es" }
#   → kind:"clarification", locale:"es", dir:"ltr", localized options
#   POST /api/ask  { "text": "where can I watch Rocky", "locale":"en" }  → normal flow (high confidence)
```

## Flow implemented

`query (+locale) → resolve response locale → normalize (Unicode-safe) → extract
language-independent entities (universal ids) → classify canonical intent (multilingual
cues) → generate canonical interpretations + confidence distribution → clarification
policy (HIGH answer / MEDIUM answer+alternatives / LOW one tap-clarification /
could-not-identify) → render in the user's language`. Reasoning is canonical; only
the final render is localized.
