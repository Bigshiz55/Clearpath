# Founder Test Environments

Three genuinely separate founder identities — **Scott**, **Heather**, **Amy** —
each with its own Supabase sign-in account and fully isolated Watch DNA. Owner
access is for administration/comparison only and is never the identity behind a
founder route.

## Routes

| Route | Identity | Who may enter |
| --- | --- | --- |
| `/TestScott` | Scott | Scott's account, or an owner/admin |
| `/TestHeather` | Heather | Heather's account, or an owner/admin |
| `/TestAmy` | Amy | Amy's account, or an owner/admin |
| `/growth-os/founder-test-comparison` | — | owner/admin only |

All three founder routes are `noindex`. The gate fails **closed**: not signed in
→ sign-in prompt; a founder on another founder's route → denied and pointed to
their own; only the matching founder (or an admin) gets in.

## Identity & sign-in

Each founder signs in with their **own** Supabase account. Access is decided in
`src/lib/founder/access.ts` from two server-only allowlists:

- `FOUNDER_SCOTT_EMAIL`, `FOUNDER_HEATHER_EMAIL`, `FOUNDER_AMY_EMAIL` — the email
  of each founder's real sign-in account.
- `ADMIN_EMAILS` — owner/admin emails, allowed into any founder route for support.

These are **emails, not credentials**. Set them in Vercel (Production + Preview).

## Data isolation (RLS)

Every founder is a separate `auth.users` row, and every table is RLS-protected
with `user_id = auth.uid()` policies — so Scott, Heather, and Amy never share or
influence each other's:

Watch DNA · ratings · quiz progress · DNA confidence · test sessions · evidence ·
recommendations · watchlists · history.

- `supabase/migrations/0025_founder_test.sql` creates `founder_test_sessions`
  with four own-rows policies (select/insert/update/delete, each
  `user_id = auth.uid()`), plus `session_id` / `is_test` columns on
  `preference_events` (guarded so it's independent of 0023's apply order).
- Proof: `src/lib/founder/isolation.test.ts` (route gate + every query scoped to
  the caller's `user_id`, runs in CI) and `src/lib/founder/isolation.int.test.ts`
  (live Supabase — a second account cannot read the first's sessions; runs when
  Supabase env + migration 0025 are present).

## Two separate metrics

- **Quiz Progress** — onboarding position only: `X of 20` calibration titles,
  checkpoint at 10, completion at 20. Finite; never an endless loop.
- **Watch DNA Confidence** — how reliable the system's understanding is, grown
  from 13 diverse signal types, hard-capped at 100. Calibration answers alone
  saturate ~60%, so the two numbers never mirror each other. Optional booster
  packs and ongoing engagement raise Confidence **without** changing Quiz
  Progress (calibration is frozen at 20/20).

## Session features (per founder)

Start a new session · name it · rename · archive · **reopen** an archived
session · **switch** between that founder's own sessions · **refresh DNA**
(archive current + start clean) · continue an unfinished session after signing
out and back in (sessions persist in `founder_test_sessions`; calibration resumes
by answered-count per session).

## Migrations required in production

| Migration | Purpose |
| --- | --- |
| `0023` | `preference_events` (DNA ratings persistence) |
| `0024` | recommendation impressions/outcomes (validation) |
| `0025` | `founder_test_sessions` + session scoping |

Apply via `POST /api/admin/migrate` with `MIGRATE_SECRET` (or an admin-email
session). Until applied, the environment still renders (fail-open) and shows an
honest "session storage isn't live yet" notice.

## Plain-English test procedure (Scott / Heather / Amy)

Do this **once per founder**, in a **separate browser profile** (or one
incognito window per founder) so the three sessions don't share cookies:

1. **Sign in** as the founder (e.g. Scott's account) and open their route
   (`/TestScott`). Confirm the badge reads "SCOTT TEST MODE" and "Signed in as"
   shows Scott's email.
2. **Start calibration** → "Build Watch DNA". Rate titles. Confirm **Quiz
   Progress** climbs toward `20` and **Watch DNA Confidence** rises on a
   *different* curve (they are not equal).
3. At **10 titles**, confirm the checkpoint appears: *Continue / Finish Later /
   See Early Recommendations*.
4. At **20 titles**, confirm Quiz Progress shows **100%** and no more calibration
   titles appear.
5. **Sessions:** rename the session, Start a new session, Switch between them,
   Archive one, then Reopen it. Confirm each action sticks.
6. **Persistence:** sign out, close the tab, sign back in, reopen the route —
   confirm the session and its progress are still there.
7. **Boosters:** open a pack (e.g. Anime) and rate a few — confirm **DNA
   Confidence** rises but **Quiz Progress** stays at 20/20.
8. **Isolation:** while signed in as Scott, try to open `/TestHeather` — confirm
   you are **denied** and pointed back to `/TestScott` (you never see Heather's
   data). Repeat the whole flow as Heather and Amy and confirm their DNA,
   confidence, and sessions are entirely independent.
9. **Owner comparison:** as the owner/admin, open
   `/growth-os/founder-test-comparison` — confirm all three founders appear with
   distinct DNA Confidence, personas, and a pairwise DNA-overlap grid.
