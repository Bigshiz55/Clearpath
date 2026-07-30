# Stabilization checklist (private working doc)

Not user-facing. Tracks the 10-area stabilization pass: what's confirmed broken,
what's suspected but unverified, and what already looks solid. Built from a
code-level survey plus (for area 1) a targeted account-isolation audit.
Updated as each area is actually worked — this is a tracking document, not a
report of finished work.

Status legend: **CONFIRMED** (reproduced or clearly demonstrated in code) ·
**POSSIBLE** (code smell / needs runtime verification before acting) ·
**OK** (checked, looks correct as built).

## 1. Anonymous personalization & account isolation — AUDITED, one fix shipped

Audited: every `createAdminClient()` (RLS-bypassing) call site, the
anonymous→real-account flow, every `.auth.getSession()` use (none found —
the codebase uses only the server-verifying `.auth.getUser()`), Founder
session isolation, `src/middleware.ts`/`src/lib/supabase/middleware.ts`, and
a spot-check of per-user data-access functions.

**CONFIRMED and FIXED**: `src/lib/actions/watchlist.ts` —
`updateWatchlistItem`/`removeWatchlistItem` mutated `watchlist_items`
filtered only by the row's own `id`, not also by `user_id`. Postgres RLS
(`watchlist_items_all_own`, migration 0001) already blocks a cross-user
write today — confirmed by reading the policy — so this was not a live
exploit, but it was a real defense-in-depth gap: every other per-user table
in the codebase (userSeen, userTracking, preference/store, push_subscriptions,
dimensionOverrides) double-filters by `user_id` in the query itself, and
this file didn't. A future RLS policy mistake would have silently reopened a
real "user A edits/deletes user B's watchlist item" bug with no other
safety net. Fixed by adding `.eq('user_id', user.id)` to both mutations
(`src/lib/actions/watchlist.ts`). New regression test
`src/lib/actions/watchlist.isolation.test.ts` (mirrors the existing
`founder/isolation.test.ts` pattern) asserts every update/delete this file
issues is scoped to the caller's own id; confirmed the test fails against
the pre-fix code and passes against the fix (see turn's verification log).
All 9 call sites of these two functions (`VerdictActions`, `RateNudge`,
`WatchlistManager`, `SaveButton`, `postWatch.ts`, `passFeedback.ts`,
`feedback.ts`) pass an `itemId` sourced from the current user's own session
context — none rely on affecting another user's row, so this is a pure
hardening with no behavior change for legitimate use.

**CONFIRMED, same class, lower priority, NOT fixed this pass** (also
currently RLS-protected, so also not live exploits — noted for a future
targeted pass rather than expanded scope here):
- `src/lib/actions/crews.ts` `removeCrewPerson` deletes `crew_people` by
  `id` only; ownership is enforced only via `crew_people`'s RLS policy
  (which joins to `crews.owner_id`), not an app-level check. Unlike
  watchlist_items, adding an app-level check here needs a prior ownership
  lookup (crew_people has no direct `user_id` column), not just an extra
  `.eq()`.
- `src/app/api/cron/tv-ingest/route.ts` — its `CRON_SECRET` check is
  **skipped entirely (fail-open)** when the env var is unset, unlike the
  sibling `daily-scan`/`tv-reminders` cron routes which fail-closed (503)
  when unset. This is a real gap, but it's an unauthenticated-write-access
  issue (anyone could trigger a TV-schedule ingest), not a user-to-user
  data leak — it touches only shared schedule/programme tables, never a
  per-user row. Flagged for a separate fix, out of scope for "account
  isolation" specifically.

**Checked and OK**:
- Anonymous personalization uses real Supabase anonymous auth
  (`signInAnonymously()` in `src/lib/supabase/middleware.ts` and
  `src/components/FreshStart.tsx`), not a browser-local id. "Save to keep
  your list" upgrades the *same* anonymous auth row in place
  (`GuestSaveButton.tsx` → `auth.updateUser()`) — the row id never changes,
  so watchlist/DNA data already attached to that id stays correctly
  attached. No code path merges one identity's data into a *different*,
  already-authenticated account.
- Founder session isolation is enforced at two independent layers: the
  route gate (`src/lib/founder/access.ts`, server-verified email, not
  client-trusted) and per-query `.eq('user_id', userId)` filtering
  (`src/lib/founder/sessions.ts`) backed by RLS — proven by both a mocked
  application-layer test and a live-DB integration test
  (`isolation.int.test.ts`) that confirms a second user's raw query for the
  first user's rows returns empty even bypassing the app-layer filter.
- `src/middleware.ts`/`src/lib/supabase/middleware.ts`: cookies are read
  through per-request `request`/`response` objects, never a shared/global
  object; no code path looks up a *different* user's data from a cookie
  value.
- Admin-client (RLS-bypassing) call sites: cron routes gate on
  `CRON_SECRET` (except the tv-ingest fail-open case above); admin actions
  (`adminCalibration.ts`, `adminSponsors.ts`, `discoveryContent.ts`,
  `founder/directory.ts`) gate on `isAdminEmail(user.email)` from a
  server-verified `auth.getUser()` before any cross-user read; `pro.ts` and
  `titleDimensions.ts` take `userId` as a parameter rather than resolving
  it themselves, so correctness there depends on their callers already
  having verified identity — traced the callers found in this pass and all
  resolve `userId` from their own `auth.getUser()` first.

**Not yet checked this pass** (noted so it isn't assumed clean): a full
enumeration of every remaining `.update()`/`.delete()` call across
`src/lib/actions/*.ts` beyond the ones spot-checked above and the RLS
policies for every table those touch; `src/components/import/ImportTasteFlow.tsx`'s
"Add to my Viewer DNA" button appears to call no persistence action at all
(likely an incomplete feature, not an isolation bug — flagged for area 4/6,
not area 1).

## 2. TV guide date, time zone, schedule freshness — spot-checked, looks OK

- `src/lib/viewing/schedule.ts`, `clock.ts`, `localDay.ts`, `scheduleState.ts`
  form a real IANA-timezone layer (`Intl.DateTimeFormat`/`toLocaleTimeString`
  with an explicit `timeZone`), with `formatRefreshedAt` for staleness
  messaging and a test (`clock.test.ts`) that specifically asserts raw
  `toLocaleTimeString` (no timezone arg) is NOT used — suggests a past bug
  was fixed here and guarded.
- Not yet verified: actual behavior in the running app across DST
  boundaries / non-US timezones, and whether "schedule freshness" (last
  ingest time) is surfaced anywhere a user can see it outside Packs (Pack
  pages show ingest staleness via `pack_ingest_runs`; the main On TV guide's
  own staleness signal wasn't checked this pass).

## 3. New Releases loading and empty states — POSSIBLE

- `src/app/app/new/page.tsx`: no sibling `loading.tsx`/`error.tsx`, no
  try/catch visible in the page itself. If the underlying data call throws,
  the whole route likely hits Next's generic error boundary rather than a
  branded empty/error state. Not yet reproduced against a real failure
  (e.g. TMDB timeout) — needs runtime verification, not assumed broken.

## 4. Taste Quiz loading and failure handling — NOT YET CHECKED

Deferred to its own pass.

## 5. WatchVerd1ct branding consistency — spot-checked, looks OK

- 130 correct `Verd1ct` occurrences vs. 2 plain "WatchVerdict" — both are
  `aria-label`s (screen-reader text), which is arguably correct practice
  (spelling the stylized "1" out loud is worse), not a branding bug.
- Not exhaustively checked: copy strings, error messages, emails, or the
  i18n catalogs (es/zh) for stray old naming.

## 6. Generated recommendation & verdict copy quality — NOT YET CHECKED

Deferred. `src/lib/aiAdjust.ts` (bounded AI score nudge) and the verdict
explanation modules exist and are tested, but copy *quality* (not
correctness) wasn't evaluated this pass.

## 7. Streaming-provider availability states — NOT YET CHECKED

Deferred. `src/lib/watchmode/client.ts` and TMDB watch-providers exist;
behavior when a provider API fails or returns nothing wasn't traced this
pass.

## 8. Unique page titles, descriptions, social previews — PARTIALLY FIXED

Addressed in the prior turn (commit `9ab0cda`, branch
`claude/pack-schema-0036`):
- Fixed: root `og:url` guarded against a Supabase-URL misconfiguration;
  added per-page canonical + og:url to `/app/title/[type]/[id]`.
- Confirmed still open (reported, not fixed — explicitly out of scope that
  turn): `/app` is blocked from crawlers via `robots.ts`'s `disallow`
  (intentional per its own comment — private product surface — but worth
  the owner re-confirming that's still the intent). og:image only exists on
  `/share/[token]` and the discovery pages (`/movie`, `/show`, `/discover`,
  `/compare`, `/for`, `/guides`, now also `/app/title/[type]/[id]`) — every
  other route has none.

## 9. Privacy, terms, attribution, data-source disclosures — CONFIRMED gap

- **CONFIRMED**: no privacy policy or terms-of-service page/route exists
  anywhere in `src/app` (`grep` for "privacy policy"/"terms of service" and
  for `/privacy`/`/terms` links returns nothing). No link to either from
  anywhere in the app.
- **CONFIRMED**: TMDB attribution ("not endorsed by TMDB") exists on the
  public marketing landing page (`src/app/page.tsx`) and is scattered
  across a handful of individual `/app/*` pages (`watch`, `new`,
  `title/[type]/[id]`, `settings`, `tv`), but the shared authenticated app
  shell (`src/app/app/layout.tsx`) has no persistent attribution — so pages
  outside that ad-hoc list show TMDB-sourced data with no attribution
  visible.
- TVmaze attribution exists on the two Pack pages (built this session).
  OMDb/Watchmode/MDBList (other data sources in play per `titleData.ts`)
  weren't checked for attribution requirements.

## 10. Analytics for the critical user journey — CONFIRMED gap (no dedicated analytics)

- No analytics SDK/vendor found (`grep` for gtag/plausible/posthog/mixpanel
  across `src/` returns nothing). The word "analytics" appears only in
  unrelated contexts (search matching, feedback reasons) — there is no
  event-tracking layer for the signup → quiz → first verdict → save
  journey. This may be intentional (privacy-conscious product), but as
  stated it's a gap against "analytics for the critical user journey."

---
*This file is a working document for the current stabilization effort. Keep
it updated per-area as each is actually inspected/fixed; don't let entries
go stale relative to the real code.*
