# Verified English-Audio Path — Completion Report

Scope: complete the **production audio-verification path** for the main
recommendation finder, so a strict request like *"I like 24 and Mindhunter. Find
foreign-language shows with English audio"* never **guesses** that an English audio
track exists. The finder now consumes the same normalized audio-availability
contract as On TV, evaluates eligibility by the specific title / season / provider /
region / requested language / verification status / verified date, and separates
verified results from unverified "possible matches" — never mixing the two.

---

## 1. Which real audio data source is used

| Tier | Source (`source` field) | Can emit `verified`? | Confidence | Used by finder |
|------|-------------------------|----------------------|-----------|----------------|
| **Verified** | `curated_registry` — a small, **human-verified** registry of *title × provider × region × season → English audio track present*, each row stamped with a `verifiedAt` date | **Yes** | 0.95 | Yes — this is the **only** path to `VERIFIED_ENGLISH_AUDIO` today |
| **Verified (interface-ready)** | `live_provider` — a `LiveProviderAudioSource` adapter interface for a real provider / JustWatch-style feed | Yes, once wired | (source-defined) | **Not wired** — `unavailableLiveSource()` returns `available:false` and no records, so it fabricates nothing |
| **Heuristic (fallback)** | `tmdb_heuristic` — the app's existing TMDB `englishAvailability` signal | **Never** | 0.35 | Yes — but capped at `LIKELY` / `UNAVAILABLE` / `UNKNOWN` |

The **verified data source that is actually connected and consumed by the main
finder is the curated registry** (`src/lib/lang/audioSources.ts` →
`CURATED_VERIFIED`). It is real, hand-checked data, not an inference. Its coverage
is intentionally small and honest (see §5). The live-provider adapter is the scale
path; it is defined but deliberately left unwired so nothing invents verified data
on its behalf.

The resolver (`src/lib/lang/audioAvailability.ts`) treats **only**
`curated_registry` and `live_provider` as the verified tier
(`VERIFIED_TIER = new Set(['curated_registry','live_provider'])`) **and** requires
`confidence ≥ 0.8`. `tmdb_heuristic` is in neither set and sits at 0.35, so it is
structurally incapable of producing a VERIFIED result — proven by unit test
(*"TMDB heuristic alone can NEVER produce VERIFIED"*).

## 2. What remains heuristic

- **Provider recommendation** — which provider a title is surfaced on comes from
  the existing TMDB/JustWatch availability options; audio is then verified *against
  that specific provider*.
- **The `tmdb_heuristic` source** — for any title **not** in the curated registry,
  the only signal is the old TMDB `englishAvailability` field. It now enters the
  system as a **low-confidence record** that can rise to `LIKELY_ENGLISH_AUDIO` at
  most. Such titles are **excluded from the strict primary list** and only ever
  appear under *"Possible matches — English audio not yet verified."*
- **Nothing else about audio is inferred.** The finder no longer treats
  `englishAvailability === 'native' | 'available'` as proof of English audio. That
  old gate (`if (q.englishAudioOnly && !(native|available)) return null`) has been
  **removed** and replaced by the resolver.

## 3. Exact confidence rules

For one title on one **recommended provider** in the user's **region** (+ season):

1. Filter records to **same `providerId` AND same `region`** (case-insensitive).
   Cross-provider / cross-region records are discarded, not borrowed.
2. Filter to the **requested season**: a record with `seasonNumber === null` is
   title-level (applies to any season); otherwise it must match exactly.
3. From the remaining records, the **verified set** = records whose `source` is in
   the verified tier **and** `confidence ≥ 0.8`.
4. Resolve, in order:
   - verified-yes **and** verified-no both present → **`CONFLICTING_DATA`**
   - any verified-yes → **`VERIFIED_ENGLISH_AUDIO`** (`verifiedAt` = latest verified
     date; `verifiedSeasons` recorded; `seasonUncertain = true` when a specific
     season was asked but only title-level verification exists)
   - any verified-no → **`ENGLISH_SUBTITLES_ONLY`** if English subs exist, else
     **`NO_ENGLISH_AUDIO`**
   - a `tmdb_heuristic` "likely" record → **`LIKELY_ENGLISH_AUDIO`**
     (confidence clamped to ≤ 0.4)
   - English subtitles only → **`ENGLISH_SUBTITLES_ONLY`**
   - otherwise → **`UNKNOWN`**

**Strict vs. loose split** (`splitByAudio`):
- **Strict** ("with English audio", "English dubbed", "no subtitles", "dub
  required", "listen in English", "have English audio"): primary = **VERIFIED
  only**; LIKELY + UNKNOWN → possible-matches; SUBTITLES_ONLY / NO / CONFLICTING do
  not appear at all.
- **Loose** ("dub preferred"): primary = VERIFIED + LIKELY (each labelled); UNKNOWN
  → possible-matches.
- **Never padded** — a requested count of 6 with only 4 verified returns 4 and sets
  `shortfall: true`.

**Not accepted as proof of English audio** (all excluded by construction): TMDB
original-language metadata, an English title/synopsis, English subtitles, US
availability, a provider's dubbing reputation, an English trailer, or a dub on a
*different* provider / country / season.

## 4. Provider and regional limitations

- Verification is **provider-specific**: a Netflix-verified dub does **not** verify
  the same title on Prime Video (unit test *"Netflix-verified does not make a Prime
  Video result verified"* → `UNKNOWN`).
- Verification is **region-specific**: a GB-verified dub does **not** verify a DE
  (or US) request (unit test → `UNKNOWN`).
- The card states the exact scope it was verified for:
  *"Verified on Netflix · checked for United States · 2023-11-01."*
- Current curated coverage: **Netflix / US** (plus one Netflix / GB row for Money
  Heist). Any other provider or region resolves to `UNKNOWN` and lands in
  possible-matches, never in the verified list.

## 5. Season-level limitations

- Records carry `seasonNumber`. A title-level row (`null`) applies to any season; a
  season-specific row verifies only that season.
- Example in the registry: **The Rain** is verified for **S1 only** on Netflix/US.
  `resolveEnglishAudio(..., {seasonNumber: 1})` → verified with
  `verifiedSeasons: [1]`; `{seasonNumber: 2}` → **`UNKNOWN`** (unit test).
- When a specific season is requested but only a **title-level** verification
  exists (e.g. Money Heist), the result is still VERIFIED but flagged
  `seasonUncertain: true` and the card reads *"Verified at the title level — may
  vary by season."*
- Current curated coverage is mostly title-level; per-season verification exists
  only where a row explicitly records it.

## 6. Search interpretation

`parseForeignAudioRequest` (`src/lib/lang/foreignAudioQuery.ts`) normalizes
*"I like 24 and Mindhunter. What foreign shows in languages like Nordic, Spanish,
and French have English audio and would fit my taste?"* into **exactly**:

```json
{
  "mediaType": "tv",
  "tasteAnchors": ["24", "Mindhunter"],
  "foreignOriginalLanguagePreferred": true,
  "internationalOnly": true,
  "englishAudioRequired": true,
  "englishSubtitlesOnlyAllowed": false,
  "desiredRegionsOrLanguages": ["Nordic", "Spanish", "French"],
  "sportsExcluded": true,
  "strict": true
}
```

"English audio" is never read as "originally produced in English"
(`foreignOriginalLanguagePreferred` stays `true`). Sports are always excluded.

## 7. Finder integration (the main recommendation path)

`src/lib/finder.ts`:
- For each candidate, the recommended provider is chosen (`included[0]` when the
  user's own services match, else the first streaming option) and audio is resolved
  through `resolveFinderAudio → gatherAudioRecords → resolveEnglishAudio` against
  that provider + region.
- For an English-audio request, titles resolving to `ENGLISH_SUBTITLES_ONLY`,
  `NO_ENGLISH_AUDIO`, or `CONFLICTING_DATA` are **dropped**; the surviving status is
  attached to the card (`audioStatus`, `audioStatusLabel`, `audioProvider`,
  `audioVerifiedAt`).
- For a **strict** request (`strictEnglishAudio`, set by `finderParse.ts` on "with
  English audio" / "English dub" / "no subtitles" / "listen in English" / "dub
  required"), the result splits into `items` = **verified only** and
  `possibleMatches` = LIKELY/UNKNOWN, with `verifiedAudio = { requested,
  verifiedCount, shortfall }`. The lists are never merged and never padded.

Every card carries exactly one visible status label (`AudioStatusBadge`), conveyed
by **icon + text** (never color alone).

## 8. Tests

- **`src/lib/lang/audioVerification.test.ts`** — 15 cases covering: verified-only
  from a verified source; heuristic → LIKELY never VERIFIED; subtitle-only excluded
  from strict primary; cross-provider non-transfer; cross-region non-transfer;
  season-specific accuracy; strict never mixes unverified; unknown → possible only;
  loose "dub preferred" includes LIKELY; counts honored, never padded;
  Nordic/Spanish/French eligible; English-original doesn't dominate; sports
  excluded; exact-JSON normalization; `gatherAudioRecords` shape.
- **`tests/responsive/audio.spec.ts`** — `/dev/audio` harness at 360 / 390 / 768 /
  1280 px: both sections render, exact "not yet verified" label present, one status
  badge per card with no clipping, verified section is VERIFIED-only, possible
  section is never VERIFIED, **Judge Verity never appears** (required test #14).
- Full suite: **352 unit tests pass**, **30 Playwright tests pass**, typecheck +
  lint clean, production build succeeds (`/dev/audio` compiled).

## 9. Screenshots (verified + unverified states)

Written by the Playwright run to `test-results/audio/`:
- `audio-1280.png` (desktop), `audio-768.png` (tablet) — two-column layout.
- `audio-390.png`, `audio-360.png` (mobile) — single-column.

Both show the **Verified — English audio** list (Money Heist / Spanish, Dark /
German, Lupin / French, Squid Game / Korean — each *"✅ English audio verified ·
Verified on Netflix · checked for United States · <date>"*), the honest shortfall
note (*"Only 4 verified matches … we don't pad the list"*), and the separated
**Possible matches — English audio not yet verified** section (Call My Agent /
French → *"≈ English audio likely"*; The Bridge / Swedish → *"? Audio availability
unknown"*, each with *"English audio not verified for Prime Video — shown only as a
possible match"*).

## 10. Honest limitations

- **Verified coverage is the curated registry only** (Netflix / US, a handful of
  titles). Most real catalog titles will resolve to `LIKELY` (heuristic) or
  `UNKNOWN` and appear under possible-matches, not verified — which is the correct,
  honest behavior, but it means the verified list will be short until a live
  provider feed is wired.
- **`LiveProviderAudioSource` is interface-ready but unwired.** Wiring a real
  per-provider audio-track feed (e.g. JustWatch/provider APIs) is the path to broad
  verified coverage; the contract, resolver, split, UI, and finder integration are
  already built to consume it with no further code changes to the verification
  logic.
- The heuristic remains as a **fallback only** and can never claim verification.
