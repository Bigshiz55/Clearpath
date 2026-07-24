# Live Court reliability — autonomous hardening report

Owner pass on the end-to-end Live Court journey (host creates → shares → recipient
joins → synchronized progression → verdict → recovery). Every item is labeled with
its verification status.

## Root causes found

1. **Cross-deployment invite links.** The invite URL had briefly preferred a
   hardcoded `NEXT_PUBLIC_SITE_URL`, which can point at a *different* deployment than
   the one where the room was created → the room isn't there → **friends can't join.**
2. **A double duplicate-tap lock** in the invite button swallowed the tap (share
   never fired). (Fixed earlier this session.)
3. **Ghost/duplicate participants possible.** No stable device identity and no DB
   uniqueness — a refresh or reconnect with cleared local state created a new
   participant row.
4. **Infinite loading + generic errors.** `court_state` failures returned silently →
   the recipient sat on "Connecting to the room…" forever; all failures looked the
   same (no distinction between not-found / expired / migration-missing / network).
5. **No expiry / closed state, no distinct error contract** in the schema.
6. **Missing-migration deployments were undiagnosable** — nothing reported whether a
   given deployment actually had the Court tables/functions.

## Exact fixes implemented

| Area | Fix | Status |
|------|-----|--------|
| Canonical URL | `lib/court/inviteUrl.ts` — one builder; default = host origin (same-deployment guarantee), optional `NEXT_PUBLIC_COURT_ORIGIN` canonical; validates absolute/https/room-id, normalizes, preserves token, marks localhost non-shareable | **Verified** (12 unit tests) |
| Share sheet | Synchronous `navigator.share` from the tap; never-disabled button (time-bounded lock); clipboard→modal(`sms:`)→visible error fallback | **Verified** (Playwright, Chromium) / **needs iPhone** for the real sheet |
| Idempotent join | Stable per-device guest id (`lib/court/guestId.ts`) → `court_join(…, p_guest_id)` upserts on `unique(room_id, guest_id)`; returns the existing seat on re-join; graceful fallback to the legacy 5-arg signature on un-migrated deployments | **Verified** (code + migration) / **needs live Supabase** for true 2-device idempotency |
| Distinct states | `lib/court/joinState.ts` classifier → not-found/expired/closed/already-started/full/name-required/config-missing/migration-missing/permission-denied/connection-failed/unexpected, each with message + recovery + transient flag | **Verified** (8 unit + Playwright gallery) |
| No infinite loading | Bounded, visibility-aware polling with exponential backoff; 10s first-load timeout → retry; terminal errors → `CourtErrorCard` recovery screen | **Verified** (code) / **needs live** for real network cases |
| DB hardening | `0023_court_hardening.sql` (idempotent): `expires_at`, `closed` status, `guest_id` + unique index, idempotent `court_join` with DISTINCT raises, `court_state` effective status + `expiresAt`, `court_close`, secretless `court_health()`; registered in `PENDING_MIGRATIONS` (+`0004`) so `/api/admin/migrate` can self-apply | **Implemented** / **needs apply** on each deployment |
| Health/diagnostics | `/api/court/health` (secretless readiness) + `/dev/court-states` Court Doctor (origin/canonical/invite URL/room id/health/state gallery) | **Verified** (Playwright) |

## Files changed / added

- `src/lib/court/inviteUrl.ts` (+test), `joinState.ts` (+test), `guestId.ts`
- `src/components/court/CourtErrorCard.tsx`
- `src/components/LiveCourt.tsx` (URL service, guest-id idempotent join + legacy
  fallback, bounded polling, classified terminal states, no infinite loader)
- `src/app/api/court/health/route.ts`
- `src/app/dev/court-states/{page,Harness}.tsx`
- `supabase/migrations/0023_court_hardening.sql`; `src/lib/pendingMigrations.ts`
  (regenerated with 0004 + 0023)
- `tests/responsive/court-states.spec.ts`; updated `court-invite.spec.ts`

## Database migration

`0023_court_hardening.sql` — idempotent, defensive, preserves data (only `add column
if not exists`, `create or replace`, guarded constraint swap, partial unique index).
Testable on a fresh DB (after 0004+0014) and on a partially-migrated one. **Apply
path:** it's embedded in `PENDING_MIGRATIONS`, so an admin can POST `/api/admin/migrate`
(authorized by `ADMIN_EMAILS` or `MIGRATE_SECRET`) to self-apply on any deployment.
Rollback: the additions are non-destructive; to revert, `alter table … drop column`
`guest_id`/`expires_at` and restore the 5-arg `court_join` from 0004 — no data loss.

## Environment-variable matrix

| Variable | Scope | Prod source | Preview source | Browser-safe | Redeploy to change | Behavior if absent |
|----------|-------|-------------|----------------|--------------|--------------------|--------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase → Settings → API → Project URL | same (or a preview Supabase) | ✅ yes | ✅ (inlined at build) | Court can't reach DB; `/api/court/health` → `config-missing`; join shows config error |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Supabase → API → anon/publishable key | same | ✅ yes | ✅ | same as above (no client calls) |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | Supabase → API → service_role | same | ❌ NEVER | ✅ | `/api/admin/migrate` and server writes disabled; Court join/state still work (anon RPCs) |
| `NEXT_PUBLIC_COURT_ORIGIN` | public (optional) | your canonical domain (e.g. `https://watchverdict.app`) | leave unset | ✅ yes | ✅ | falls back to the host's own origin (recommended default) |
| `ADMIN_EMAILS` | server-only | your admin emails | same | ❌ | runtime | `/api/admin/migrate` can't be authorized by email (use `MIGRATE_SECRET`) |
| `MIGRATE_SECRET` | server-only | a random secret | same | ❌ | runtime | migrate endpoint needs an admin email instead |

**Supabase project setting (not an env var):** Court's `/court/[code]` route is
public and its RPCs are granted to `anon`, so **anonymous sign-ins are NOT required
to join a Court.** (They're only used to guest-gate `/app`.) The one requirement is
that the deployment's Supabase project has the Court schema (migrations applied).

## Canonical URL strategy

Default the invite base to **the host's current origin** — this guarantees the
recipient opens the exact same deployment/database. Set `NEXT_PUBLIC_COURT_ORIGIN`
only if you have a single canonical production domain and want every invite pinned to
it (do **not** set it to a domain backed by a *different* Supabase project).

## Realtime / reconnect behavior

Court uses **authoritative polling** (not Supabase Realtime): `court_state` every
~1.5s, paused when the tab is backgrounded, exponential backoff on failure, and a
full authoritative re-fetch on foreground — so reconnect always converges on DB
truth and there are no stale-event races. Bounded (no infinite/high-frequency loop).

## Security / RLS

Tables stay RLS-locked with **no direct policies**; all access is via `SECURITY
DEFINER` RPCs, so one room can't read/mutate another's rows. `court_health` returns
booleans + a non-secret project ref only. No service-role key or token is ever sent
to the browser. Display names are length-capped; room ids are validated.

## Automated test results (Verified)

- Unit: **412 passed** (incl. court: inviteUrl 12, joinState 8, deck 8, groupScore 7).
- Playwright: **57 passed** (court-invite 10 + court-states 5 at 320/375/390/430 +
  existing responsive/on-tv/quickstart).
- typecheck ✅ · lint ✅ · production build ✅.
- **Fresh-tree** (`git archive HEAD`) typecheck ✅ and build ✅ **without secrets**.
- No orphaned dev/test processes; port freed after runs.

## Mobile viewport results (Verified)

Court error/recovery states and the invite panel render with no horizontal overflow,
≥44–52px tap targets, readable messages, and contained URL row at 320/375/390/430.

## Physical-iPhone steps still requiring human confirmation

Browser automation cannot invoke the iOS share sheet, Messages, or a real 2-device
realtime session. On two physical iPhones:
1. Host (Safari + installed PWA): Start a Court → **Send invite** opens the share
   sheet → Messages prefilled with the invite + link → send. Host room stays active.
2. Recipient: open the link → **same domain**, correct room, enter name, **Join** →
   host sees them appear (within ~1.5s poll).
3. Both submit picks; host advances; both see phase changes; final verdict matches.
4. Refresh / background / reopen on each device → **no duplicate participant** (stable
   guest id), room state intact.
5. Force error states: open a random/closed code → precise recovery screen; let a
   room expire (12h) → expired screen.
Use `/dev/court-states` (with `RESPONSIVE_HARNESS=1`) as an on-device diagnostics
panel to copy the origin / canonical / invite URL / health readout.

## Remaining limitations / blockers

- **Migration must be applied per deployment** (self-serve via `/api/admin/migrate`);
  I cannot reach your Supabase from here — *Implemented, needs apply.*
- **True multi-device realtime + iOS share sheet** need physical devices — *Implemented,
  needs device confirmation.*
- Full multi-context Playwright against a **real** Supabase is provided as a manual
  path (env-gated) rather than run here, since no live project credentials are
  available in this environment — *Not run (blocked by credentials).*
- The deeper Genre-Draft game flow (deck → top-3 → verdict UI) beyond the current
  lobby/wishlist model is the separately-tracked engine work — *Partially implemented
  (engine done; full UI is a later phase).*

## PR readiness

The reliability spine (canonical URLs, idempotent join, distinct states, no infinite
loading, health/diagnostics, hardened migration) is **implemented and green** on the
branch behind PR #3. It is **ready for review**; final sign-off requires (a) applying
`0023` on the target deployment and (b) the two-iPhone confirmation above.
