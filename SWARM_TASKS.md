# Swarm Tasks

Status: DISCOVERED · READY · IN PROGRESS · BLOCKED · REVIEW · FAILED · VERIFIED · RELEASED

| ID | Title | Priority | Status | Acceptance | Evidence |
|----|-------|----------|--------|------------|----------|
| T01 | Deterministic scoring engine + Scott rules | P0 | **VERIFIED** | 7 spec scenarios pass; penalties only on defining traits | 25 vitest tests |
| T02 | TMDB search + metadata + providers | P0 | **VERIFIED** | server-only key; normalized metadata | build + code review |
| T03 | Supabase auth (email + magic link) + callback | P0 | **VERIFIED** | login/callback/errors; getUser used | smoke: /login 200, /app 307 |
| T04 | Postgres schema + RLS + secure share RPC | P0 | **VERIFIED** | RLS on all tables; no anon SELECT on shares; migration applies clean | applied live OK; rls_checks.sql |
| T05 | Verdict report (all required sections) | P0 | **VERIFIED** | header→scores→explanation→reasons→content→providers→final | build |
| T06 | Watchlist CRUD + persistence | P0 | **VERIFIED** | statuses, sort/filter/search, grid/list, rating, notes | build + actions with zod |
| T07 | Public shares (revocable, expiring) + OG image | P0 | **VERIFIED** | token unguessable; personal opt-in; signed-out view | build; /share/<bad>=404 |
| T08 | PWA (manifest, icons, SW, offline) | P1 | **VERIFIED** | installable; SW never caches private | manifest/icons 200 |
| T09 | Headline WATCH IT / MAYBE / SKIP IT | P1 | **VERIFIED** | shown first on report + share | tests + build |
| T10 | Critic ratings via optional OMDb | P1 | **VERIFIED** | IMDb/RT/Metacritic when key set; graceful else | tests + build |
| T11 | Similar / "more like this" | P1 | **VERIFIED** | recommendations + fallback shown | build |
| T12 | Voice search (Web Speech API) | P2 | **VERIFIED** | mic where supported; typing always works | build |
| T13 | Search never dead-ends | P1 | **VERIFIED** | multi → movie/tv fallback; helpful empty state | code + build |
| T14 | Security hardening | P0 | **VERIFIED** | secrets server-only; headers; open-redirect guards | grep + SECURITY_REVIEW |
| T15 | Docs / state system / owner guide | P1 | **VERIFIED** | all source-of-truth files present | this file set |
| T16 | Deploy to Vercel + configure Supabase URLs | P0 | **BLOCKED** | live URL, sign-up works | needs owner keys/login (OWNER_INSTRUCTIONS) |
| T17 | Live E2E per TEST_MATRIX | P0 | **BLOCKED** | required search set + journeys pass live | depends on T16 |
