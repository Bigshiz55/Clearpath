# WS4 — availability surface inventory & cross-surface contract

**Branch:** `claude/ws4-availability-proof` (based on PR #14 HEAD `f51b872`).
**Cannot merge until PR #14 lands** — it stacks on the Phase-1 + 0046 work.

The WS4 claim is **not** "`src/lib/availability` exists" or "N surfaces import
it." It is that every surface that shows availability reaches the *same*
decision for the same title, and that the decision never overstates the
evidence. This document is the honest inventory that backs that claim, plus the
one real gap found and closed on this branch.

## The single decision point

Every availability-showing surface renders the output of **one** function,
`resolveWatchPresentation` (`src/lib/availability/watchPresentation.ts`), fed by
**two** sanctioned adapters and one merge:

| Adapter | Source | Maps to |
|---|---|---|
| `optionsFromCardAvailability` | Watchmode cache rows (`watchmode_availability`) | `StreamingOption[]` (provenance `watchmode`) |
| `optionsFromTileProviders` | TMDB / report providers | `StreamingOption[]` (provenance `tmdb`) |
| `mergeProviderOptions` | both | Watchmode wins when present; `checked` = either looked |
| `liveOptionFromAiring` | schedule feed | `LiveOption` (carrying network, not original network) |

No surface constructs an availability claim any other way. `stateFromLegacyType`
and `stateFromTmdbType` both map ambiguous "subscription/flatrate" to
`included_with_base_subscription` **only** — never premium, add-on, or Prime.

## Surface inventory

| Surface | Component | Resolver / adapter used | Bypass raw TMDB/Watchmode? | Rental→included possible? | Amazon Channel→base Prime? |
|---|---|---|---|---|---|
| Title page — Where to Watch | `components/watch/WhereToWatch.tsx` | `resolveWatchPresentation` + both adapters + `mergeProviderOptions` | No | No | No |
| Title page — panel | `components/watch/AvailabilityPanel.tsx` | `resolveWatchPresentation` + `optionsFromCardAvailability` | No | No | No |
| Search result cards | `components/search/SearchResultRow.tsx` | `resolveWatchPresentation` + both adapters + `providerSummary` | No | No | No |
| Poster grid cards | `components/PosterCard.tsx` | `resolveWatchPresentation` | No | No | No |
| What to Watch / On TV list | `components/tv/WatchNowList.tsx` | `resolveWatchPresentation` | No | No | No |
| On TV guide | `components/OnTvGuide.tsx` | `optionsFromCardAvailability` → resolver | No | No | No |
| Ratings API (tile facts) | `app/api/ratings/[type]/[id]/route.ts`, `lib/tileFacts.ts` | `optionsFromTileProviders` / `providerSummary` | No | No | No |

Live Court, watchlist and share/preview surfaces do **not** assert streaming
availability (Court shows votes; watchlist shows saved titles; share shows a
verdict) — so there is nothing for them to get inconsistent. Where they *do*
show a "where to watch" affordance they route through the title page, i.e. the
same resolver.

## The gap this branch closes

`resolveWatchPresentation` worded and ordered options but **did not reconcile
two records for the same service.** So:

- a fresh *and* a stale "Included with Hulu" row printed **twice**;
- TMDB's "Amazon Prime Video" and Watchmode's "Prime Video" showed as **two
  rows** for one service — the exact cross-surface drift WS4 exists to remove.

Fix: `src/lib/availability/reconcile.ts` — a pure, deterministic
`reconcileOptions` applied inside the resolver before anything is worded. One
service → one claim, with evidence-first conflict rules:

1. rental/purchase is never promoted to included;
2. unknown is never collapsed into unavailable;
3. same-kind claims: the **fresher** record wins (a stale row can't override a
   re-verified one); if the winner is itself stale its freshness is preserved
   and still renders as stale;
4. freshness ties prefer Watchmode (deep links, precise source type), then a
   record that carries a watch link;
5. only genuine name variants of one service collapse (small explicit alias
   table); Amazon **Channels** are distinct products and never fold into base
   Prime.

## Cross-surface contract test — measured result

`src/lib/availability/crossSurface.contract.test.ts` freezes the 16 mandatory
fixtures (base Prime; MGM+ Amazon Channel; Acorn Amazon Channel; direct Acorn
subscription; Hulu included; Hulu add-on; Peacock; Tubi free-with-ads; rental
only; purchase only; conflicting fresh+stale; unknown; expired; duplicate
aliases; Watchmode empty; TMDB-only) and asserts the acceptance gate:

- **zero rental-as-included** — no rent/buy option ever produces "Included";
- **zero Amazon-Channel-as-base-Prime** — "Included with Prime" only when a
  Prime-keyed source is present;
- **stale stays visibly stale** (90-day record keeps its "Last verified…" label);
- **unknown stays unknown** (not confirmed ≠ none found);
- **source + fetched-time retained internally** on every claim;
- **no "Included" wording without a canonical inclusion state** behind it;
- **determinism** — same snapshot → identical presentation.

**Measured:** `vitest run src/lib/availability/ src/components/watch/` →
**97 tests passed** (contract 18 + watchPresentation 31 + providerOptions 14 +
cardSeparation 26 + WhereToWatch.reliability 8). Real exit code recorded in the
branch commit.

### Honest limitation (reported, not hidden)

TMDB data cannot distinguish an **add-on** (e.g. Hulu + STARZ) from base
inclusion — its `flatrate` bucket is one signal. The resolver **can** represent
the distinction (`included_with_addon` renders "Hulu — STARZ add-on"), and does
whenever the evidence carries an add-on name; but a title known only from TMDB
`flatrate` is shown as base inclusion, which is the conservative reading. Closing
this fully needs the add-on signal in the upstream feed, not a resolver change.
