# Security-advisor audit — classification (migration 0046)

Baseline: production after `0045` (user-view RLS, applied). Every item the task
enumerated was classified A/B/C/D. Only category-A items are changed by `0046`.

| # | Object | Class | Finding / justification | Action |
|---|---|---|---|---|
| 1 | `public.schema_migrations` | **A** | Migration ledger, no RLS, client-readable. | 0046: enable RLS, no policy, revoke anon/authenticated. |
| 2 | `pack_premiere_calendar` (view) | D | Schedule/premiere data only — no user_id, no private column. Read by the Pack loader. | none |
| 3 | `public_canon_titles` | B | Definer view exposing filtered public catalog columns only (`is_fixture=false`, verified sources). | keep anon SELECT |
| 4 | `public_dist_offers` | B | Definer view, public distribution offers, filtered. | keep anon SELECT |
| 5 | `public_linear_airings` | B | Definer view, public linear airings, filtered. | keep anon SELECT |
| 6 | `public_source_health` | B | Definer view, counts + timestamps of verified sources only. | keep anon SELECT |
| 7 | Mutable-search-path functions | D | All 13 SECURITY DEFINER migration files set `search_path = public`; a full scan found **zero** definer functions missing it. | none |
| 8 | SECURITY DEFINER fns executable by anon | B/A | Court RPCs + `growth_click` are intentional anon interfaces (B, below). The pack-ingest lock RPCs are **not** (A, item 11). | see 11 |
| 9 | SECURITY DEFINER fns executable by authenticated | B | Same set; user-scoped functions filter on `auth.uid()`. | none |
| 11 | `pack_try_start_ingest` / `pack_finish_ingest` | **A** | Server-only lock RPCs granted to anon+authenticated in 0038, and **dead** in the current code (synchronous lazy-ingest removed). Unnecessary privileged surface. | 0046: revoke anon/authenticated/public, grant service_role only. |
| 12 | Live Court RPCs (`court_join/vote/state/chat/react/claim_host/…`) | B | Guest Live Court **requires** anonymous participation. Each RPC gates on a room code + a participant token and/or host token; rows are isolated per court. Verified: no court RPC returns another court's private rows without the code, and host-only actions (`court_reveal`, `court_set_size`, `court_claim_host`) require the host token. | keep anon EXECUTE |
| 13 | Public user-history tables (`user_seen`, `user_tracking`, `watchlist_items`, ratings, `user_seen_programmes`, `user_tracking_matches`) | C→fixed | RLS `auth.uid() = user_id`; the two views were fixed in 0045 (security_invoker). | none (done in 0045) |
| 14 | Broad default grants on views/tables | D | No `grant … to public` on user tables; grants are explicit and role-scoped. | none |

**Leaked-password protection** (Supabase Auth → Settings → "Prevent use of
leaked passwords"): this is an **owner-only dashboard setting**, not
migratable. It is reported here as a separate owner action; do not treat it as
done until verified active in the dashboard.

## Cross-user / token security test matrix
Covered by `src/lib/security/userViewRls.test.ts` (0045) and
`src/lib/security/advisor0046.test.ts` (0046 text + classification). The live
transactional user-A/user-B isolation for both user views was already run and
passed against production during the 0045 application.
