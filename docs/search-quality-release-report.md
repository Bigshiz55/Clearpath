# WatchVerdict — Search-Quality Verification Report

**Commit:** `6f7c690` · **Branch:** `claude/watch-verdict-app-wwbtbg` (production/default) ·
**Version:** v1.0.0 · **Schema:** 0025_founder_test

> This report scores each area **separately**. It does **not** claim full
> production-proven search, because the live-data audit has not been run — the
> environment has no `TMDB_API_KEY`. Offline behavior is proven; live metadata
> accuracy is explicitly outstanding.

---

## 1. Shipped version

| Field | Value |
|---|---|
| Commit SHA (local == remote) | `6f7c690` |
| Branch | `claude/watch-verdict-app-wwbtbg` (this is the default **and** Vercel production branch) |
| Pull request | PR #9 merged (21:14Z); these verification commits sit on top of it on the production branch |
| Deployment URL | Vercel builds this branch automatically; the live URL is owned by the Vercel project (not visible from CI) |
| Production URL | `clearpath-pearl-chi.vercel.app` (per repo docs) |
| Visible version | Build badge on **every** screen (mounted in the root layout) |
| Deployed == tested | The tested commit `6f7c690` is what was pushed to the production branch. Whether Vercel has finished deploying it is confirmed on-device via the badge — see below. |

**Build badge (every screen, all environments):**
- Production → `WatchVerdict v1.0.0` (clean, no internals).
- Preview / Test / Development / Founder routes → `env • branch • sha • v1.0.0` (full identification), tap for the full sheet (env, version, branch, commit, build time, deploy id, schema). Auto-populated from build metadata — nothing hardcoded.

---

## 2. Separate scores (no single inflated number)

| Area | Score | Basis |
|---|---|---|
| **Build health** | **A** | typecheck ✓, lint ✓ (0 warnings), `next build` ✓ (54 pages), 437 unit tests pass / 4 skipped |
| **Offline test coverage** | **A** | 437 unit + 3,000-case campaign + 23 curated critical + 18 independent adversarial + 12 difficult-search inspections, all green and reproducible |
| **Constraint enforcement (parse)** | **A−** | One unified pipeline (`augmentInternational`) now on both NL retrieval routes; architectural test fails if any route bypasses it; origin/language/audio-flag/runtime/platform/exclusion/media-type all captured at scale |
| **Ambiguity handling** | **B+** | Contradictions (year, audio, catalog) flagged; safe fallbacks for ambiguous providers & same-name titles (never fabricates); one-follow-up confidence policy wired |
| **Similarity quality** | **B / incomplete** | Similar-to path unified with hard constraints; trait transfer/replace decomposition authored for the hard cases — but live fingerprint scoring needs the classifier cache + TMDB |
| **Live metadata accuracy** | **NOT RUN (blocked)** | Harness complete (`eval/live/audit.mjs`), budgeted + cached, honest labels — but no `TMDB_API_KEY` in this environment |
| **Streaming accuracy** | **NOT RUN (blocked)** | Same blocker; `watch/providers` verification is in the harness, un-run |
| **Audio accuracy** | **Parse-only** | English-audio is captured as a requirement but is **`unavailable` from TMDB** (no dub-track data). Only verifiable against a real audio source — never faked |
| **Mobile behavior** | **A− (prior work)** | Responsive rebuild + badge on every screen; final on-device fit confirmed via the badge |
| **Overall production readiness** | **CONDITIONAL** | Ship-ready for parse/intent quality; **not** certifiable as live-accurate until the TMDB audit runs |

---

## 3. What was fixed this phase (each now a permanent regression test)

1. **Vacuous campaign gates** — per-dimension pass rates counted only *failed* checks (denominator 0/0 → fake 100%). Now real denominators (origin 1,646 · audio 1,016 · runtime 920 · media 3,000 · platform 1,473 · exclusion 920 · reference 1,049).
2. **Pipeline non-unification** — the finder/Forensic-Search route dropped origin/audio/runtime. Now routed through the same `augmentInternational`; an architectural test enforces it.
3. **Misspelled Netflix** ("Netflx" etc.) now resolves offline.
4. **BritBox** added to the platform table.
5. **Movie-vs-TV negation** — "the movie, not the series" now narrows an uncommitted query.
6. **Worded runtime** — "under two hours" was lost to the 150-min default; the ceiling now takes the tighter value (120).
7. **QA honesty** — the default runtime cap no longer masquerades as a user constraint.

## 4. Known weak areas (honest)

- **Live audio/availability unverified** — the single gate to "production-proven." Run: `TMDB_API_KEY=… node eval/live/audit.mjs`.
- **Same-name titles** (Fargo film vs series) need live disambiguation + a clarifying prompt; offline we only guarantee nothing false is invented.
- **Bare ambiguous providers** ("Paramount", "Apple" without "on"/"+") are intentionally not resolved (avoids wrong-platform), so they neither filter nor clarify — a future improvement is to detect the *intent* and ask.
- **Trait-translation ranking** (Hallmark × Silence) is specified, not yet scored against a live catalog.

## 5. Definition of done — status

- [x] One unified retrieval pipeline + architectural guard
- [x] Thousands-scale validation with real per-dimension denominators
- [x] Per-query verification (offline) for the mandated difficult searches
- [x] Every fixed bug is now a permanent regression fixture
- [x] Confidence scoring with a single-follow-up policy
- [x] Independent adversarial suite (generator does not grade itself)
- [x] Search QA dashboard (dev / authorized-test only)
- [ ] **Budgeted live-data audit executed** — blocked on `TMDB_API_KEY`
- [ ] Live similarity-quality scoring — blocked on the same key
