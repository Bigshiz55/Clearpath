# Known limitations — what is real, mocked, or blocked

Honesty matrix. "Real" = works end-to-end locally with no credentials.

## Fully implemented (real)

- Canonical data model (Work/Edition), provenance & confidence, conflict
  resolution, ISBN utilities, entity resolution/dedup.
- Provider abstraction + **Open Library** (real, keyless) + labelled mock;
  registry with cache/retry/fallback/health.
- Imports: Goodreads/StoryGraph CSV, title/ISBN lists, preview + dedup.
- Reader Interview → Reader DNA (evidence + confidence + explanations +
  correction).
- Book Trial: charges, prosecution, defense, evidence (status-tagged),
  witnesses, jury (modeled-similarity), verdict (13 calls), sentence,
  cross-examination (spoiler-gated).
- Predicted DNF / finish probability (transparent heuristic, honest confidence).
- Local persistence (Reader DNA, library, appeals, events, consent); My Books;
  Reading Appeal; micro-feedback; share verdict; data export/reset/delete.
- Analytics taxonomy (+ consent gating), feature flags, env validation.
- Search Lab evaluation harness with regression guardrails.
- Responsive, accessible, mobile-first shell; literary visual identity.

## Implemented with mock/dev providers

- **Search fallback** uses a labelled mock fixture set when Open Library is
  unreachable (UI shows a "sample data" chip). Not presented as real.
- **Book DNA** is currently **inferred** from subjects/genre keywords (labelled
  `inferred`, low–moderate confidence). Editorial/AI-authored DNA can override it
  through the provenance layer later.

## Partially implemented

- **Persistence/auth**: local-only today. Supabase migrations + server/browser
  clients exist and are inert until keys are set; a server repository behind the
  same store interface is the production path (needs Supabase credentials).
- **Discovery shelves** seed a search; personalized ranking grows with Reader
  DNA and a candidate-retrieval pass.
- **Search DNA** normalization is basic (title/author/ISBN); full intent/seed/
  constraint parsing is a later pass (optionally LLM-assisted).

## Blocked by credentials / third-party agreements

- **Screenshot import / “Judge My Shelf”** — needs a vision model
  (`OPENAI_API_KEY` or equivalent). Interfaces/flows are specified in
  [`IMPORT.md`](./IMPORT.md); no fabricated identifications.
- **Connected accounts & email-receipt analysis** — OAuth where officially
  supported; strictly opt-in; no password collection. Not implemented.
- **Availability (library/retail/audiobook)** — needs licensed providers; the
  model supports it, but we never assert current availability without verified
  data.
- **LLM interview free-text parsing** — behind `READVERDICT_AI_INTERVIEW` +
  `OPENAI_API_KEY`. The structured interview works fully without it.
- **Real cohort data** (jury tallies, completion/DNF rates, similar-reader
  stats) — requires a user base. Until then these are honestly `insufficient` /
  `modeled-similarity`, never fabricated.

## Not built (planned)

Read Together / group decisions, browser-extension API, service-value analysis,
full i18n (EN/ES/zh-Hans locale plumbing), trained ML models (current models are
transparent heuristics and labelled as such).
