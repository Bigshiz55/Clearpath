# Decision Log

Foundational decisions (D1–D16) are in `WATCHVERDICT_DECISION_LOG.md`. This file
continues with completion-pass-2 decisions.

### D17 — Headline verdict as WATCH IT / MAYBE / SKIP IT, derived from the personalized tier
The owner wants the answer first. Added a `PrimaryCall` derived deterministically
from the personalized tier (Must/Strong→WATCH IT, Worth/Possible→MAYBE,
Low/Skip→SKIP IT) and rendered at the very top of every report and share page. It
mirrors the existing tier/score, so it can never disagree with the numbers.

### D18 — Critic ratings via OMDb as an OPTIONAL provider
Adds IMDb / Rotten Tomatoes / Metacritic when `OMDB_API_KEY` is set. Blended into
the general score transparently (60% shrunk-audience / 40% critic) and shown as
labeled sources. Absent key → no critic data, clearly labeled "Not available",
scores still compute from TMDB. No fabrication. Chosen over scraping (ToS/legal)
and over hard-requiring it (keeps the app free-to-run).

### D19 — Similar titles from TMDB recommendations, then /similar fallback
Uses `/recommendations` (personalized-ish, better quality) and tops up from
`/similar` when sparse. Poster-only, capped at 12, deep-links into the app.

### D20 — Voice search via the Web Speech API (client-only, no cost)
Feature-detected mic button; degrades silently where unsupported (e.g. Firefox).
Typing remains the primary path. No audio leaves the browser beyond the platform
speech service the user's browser already uses.

### D21 — Search never dead-ends
If `/search/multi` returns nothing, fall back to `/search/movie` + `/search/tv`
merged/deduped before showing the (still helpful) empty state. Removes the
"No verdict found" terminal condition the owner called out.

### D22 — Emulated swarm via sequential role passes (no parallel file-editing agents)
The spec permits emulating the swarm when true parallel subagents aren't the right
fit. To guarantee a coherent, always-green build, this pass was done as ordered
role passes (audit → engine → data → UI → QA/security → release) with a single
verification gate, rather than parallel agents editing shared files. No fabricated
multi-agent narrative; the state files (SWARM_TASKS, TEST_MATRIX, etc.) reflect
what was actually done and verified.
