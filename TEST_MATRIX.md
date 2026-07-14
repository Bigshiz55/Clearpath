# Test Matrix

## Automated (run in-sandbox — all passing)
| Area | Method | Result |
|---|---|---|
| Scoring: 7 spec scenarios | vitest | ✅ |
| Trait defining-vs-secondary detection | vitest | ✅ |
| Score clamping (0–100), stacked penalties/boosts | vitest | ✅ |
| Verdict tiers + watchlist disposition boundaries | vitest | ✅ |
| Primary call WATCH IT / MAYBE / SKIP IT mapping | vitest | ✅ |
| Critic-rating integration + honest no-data handling | vitest | ✅ |
| Per-user independence (Scott vs another user) | vitest | ✅ |
| Type safety (strict) | `tsc --noEmit` | ✅ |
| Lint | `next lint` | ✅ |
| Production build (17 routes) | `next build` | ✅ |
| Boot + routing smoke | `next start` + curl | ✅ (`/`=200, `/app`→307, `/api/health`, `/share/<bad>`=404) |

## Required search set — verify LIVE after deploy (needs TMDB key)
For each: correct title + type, verdict renders, personalization explained,
missing data labeled honestly, no crash, no "No verdict found" dead-end.

- [ ] Jaws  · [ ] Breaking Bad · [ ] Dark · [ ] The Chestnut Man · [ ] Prisoners
- [ ] Mindhunter · [ ] The Godfather · [ ] The Office
- [ ] Misspelled title (e.g. "prisners") — fuzzy match resolves
- [ ] Punctuation (e.g. "WALL·E", "M*A*S*H")
- [ ] Same-name titles (e.g. "Dark") — year/type disambiguation in results
- [ ] Foreign-language title (e.g. "Parasite" / original title)
- [ ] Miniseries (e.g. "Chernobyl")
- [ ] New release from the configured provider
- [ ] Nonexistent title → helpful "no matches, try again" (never a dead-end)
- [ ] Provider timeout → precise error, app stays usable
- [ ] Missing ratings → labeled "Not available", score still computes
- [ ] Missing availability → "no legal option found for your region" note

## Required user journeys — verify LIVE after deploy
- [ ] Phone: search → verdict fast → understand why → audience/critic score shown
- [ ] Where-to-watch shows when provider data exists
- [ ] Save to list → refresh → still saved → mark watched → rate → add note
- [ ] Voice search (Chrome/Safari)
- [ ] Share a verdict → open link signed-out → renders
- [ ] Second user signs up → separate private data (RLS) → own match score
- [ ] Provider outage → graceful recovery
