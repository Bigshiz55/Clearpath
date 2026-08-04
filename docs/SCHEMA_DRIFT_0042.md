# Schema drift: migration 0042 targets a table production does not have

**Status: 0042 is WITHDRAWN. It has not been applied and must not be applied
in its current form.**

Written 2026-08-04, after an independent inspection of the live Supabase
production database reported that `public.watchmode_availability` does not
exist. This document records what was verified, what the evidence supports,
and — explicitly — what is still unknown.

Every claim below is labelled with how it was established:

- **[REPO]** — verified by reading files or git history in this repository.
- **[REPORTED]** — from the independent production inspection. Not
  independently re-verified here; this environment has no production database
  connection.
- **[INFERENCE]** — a conclusion drawn from the above. Flagged as such.

---

## 1. The expected object vs. the actual object

| | Expected by 0042 | Actually in production |
|---|---|---|
| Table | `public.watchmode_availability` | **absent** [REPORTED] |
| Created by | `0041_watchmode_availability.sql` [REPO] | — |
| Nearest existing table | — | `public.title_availability` [REPORTED] |
| Created by | — | `0031_reco_engine.sql` [REPO] |
| Row count | — | **zero** [REPORTED] |

The two tables are not variants of each other. They model different things:

```
public.watchmode_availability            public.title_availability
  (0041 — REGISTERED, NOT APPLIED)         (0031 — present in production)

  id            uuid pk                    title_id      text  ─┐
  tmdb_id       bigint                     region        text   │ composite
  tmdb_media_type text                     provider      text   │ primary
  source_name   text                       monetization  text  ─┘ key
  source_type   text                       verified_at   timestamptz
     ('subscription'|'rent'                expires_at    timestamptz
      |'buy'|'free')                       confidence    numeric(3,2)
  region        text                       source        text
  deeplink      text
  updated_at    timestamptz              FK: title_id -> catalog_titles(id)
                                         CHECK monetization in
  unique(tmdb_id, tmdb_media_type,          ('flatrate','free','ads',
         source_name, source_type,           'rent','buy')
         region)
```

Three incompatibilities, all [REPO]:

1. **Identity.** `watchmode_availability` keys titles by `(tmdb_id,
   tmdb_media_type)`. `title_availability` keys them by `title_id text` with a
   foreign key into `catalog_titles`. These are different identifier spaces.
2. **Vocabulary.** `source_type` allows four values; `monetization` allows
   five, and only three of them (`free`, `rent`, `buy`) overlap. `flatrate`
   and `ads` have no `source_type` equivalent; `subscription` has no
   `monetization` equivalent.
3. **Shape.** `title_availability` carries `confidence`, `expires_at` and
   `verified_at` — a freshness/confidence model `watchmode_availability` does
   not have, and which 0042's twelve canonical states partly duplicate.

**This is why 0042 was not "fixed" by changing the table name.** A rename
would silently reinterpret one model as the other.

---

## 2. Root cause

**The automated migration runner was removed from the build and never
replaced. Every migration registered after that point has had no path to
production.** [REPO]

The timeline, from git history:

| When | Commit | What happened |
|---|---|---|
| 2026-07-31 11:18 | `bb4195d` | `build` changed to `npm run migrate && next build` |
| 2026-07-31 12:23 | `4d58608` | build guards added on top |
| 2026-07-31 13:08 | `67d1014` | **reverted** — `build` back to plain `next build` |
| 2026-08-03 | `012d807` | `0041_watchmode_availability.sql` added |
| 2026-08-04 | `ae86878` | `0042_canonical_availability.sql` added |

The runner was wired into the build for **one hour and fifty minutes**, and
`67d1014`'s own commit message records that all five deploys during that window
failed. So `scripts/migrate.ts` has, as far as the repository shows, never
successfully applied a migration to production at all.

0041 was written **three days after** the runner was removed. It was registered
in `PENDING_MIGRATIONS`, `checkMigrationsRegistered.ts` passed, code review
passed, and it reached `main` — and none of that runs SQL. [REPO]

[INFERENCE] This explains the reported absence of `watchmode_availability`
exactly: the migration that creates it never executed anywhere but a
developer's machine.

### The comment that hid it

Both `scripts/migrate.ts` and `src/lib/pendingMigrations.ts` carried a header
saying migrations "run automatically as part of `npm run build`". That was
true for 110 minutes and false for the four days after. [REPO] Anyone reading
either file — including me, in earlier sessions — would reasonably conclude a
registered migration was an applied migration.

Both comments are corrected in the same commit as this document.

### Why `title_availability` exists but is empty

`0031_reco_engine.sql` predates the runner entirely (2026-07-25) and its table
is reported present, so it was applied by some other means — the Supabase CLI
or dashboard, consistent with the reported ledger being
`supabase_migrations.schema_migrations` rather than the `public.schema_migrations`
that `scripts/migrate.ts` writes. [INFERENCE]

Its zero row count is separately explained: **no application code reads or
writes `title_availability`.** The only references in `src/` are two
`sourceField` label strings in `src/lib/reco/explain.ts:129,137`, which name
the table in provenance text without ever querying it. [REPO] The reco
engine's availability model was created and never wired up.

---

## 3. What this means for the running application

`src/lib/watchmode/cardAvailability.ts:53` selects from
`watchmode_availability`, and `src/lib/titleData.ts:25` does the same. [REPO]
If that table is absent in production [REPORTED], then every such query has
been failing, and `getCardAvailability` has been returning its
`UNCONFIRMED` fallback for every title. [INFERENCE]

The user-visible result is that cards show "availability not currently
confirmed" — which is honest, and is exactly the fallback reliability item 3
was built to provide. **It is working as designed and it has been masking a
missing table.** A fallback that cannot distinguish "we have not checked this
title" from "the table does not exist" reports both as the same calm sentence.

This has not been confirmed against production logs; it is the predicted
consequence of the reported schema state, recorded here so it can be checked.

---

## 4. Required correction — an open decision, not a rename

Where the twelve canonical availability states belong is **not yet decided**,
and deciding it is not part of this commit. The three candidates:

1. **Apply 0041 first, then 0042 unchanged.** Restores the design as written.
   Requires accepting `watchmode_availability` as the availability table and
   leaving `title_availability` dead.
2. **Extend `title_availability` instead.** Uses the table production already
   has, but requires reconciling two identifier spaces (`title_id` +
   `catalog_titles` FK vs. `tmdb_id`/`tmdb_media_type`) and two monetization
   vocabularies, and `catalog_titles` coverage is itself unverified.
3. **A new per-provider claim table** that both can feed. Cleanest model for
   the twelve states, most work, and adds a third availability table to a
   codebase that already has two.

**No parallel availability system may be created as a way of avoiding this
choice.** Option 3 is only acceptable if the other two are retired with it.

### Preconditions before any of it is applied

Not one of these is met today:

- [ ] The real target schema is confirmed against production, not assumed.
- [ ] Every application reader and writer of availability data is enumerated
      and updated in the same change.
- [ ] The corrected migration is proven against an isolated database whose
      schema matches production.
- [ ] The corrected rollback is proven on that same database.
- [ ] The deployment has a working server-side database connection
      (currently reported absent).

### Data-loss risk

**Currently nil, in either direction.** `watchmode_availability` does not
exist, so there is nothing in it to lose; `title_availability` exists with zero
rows, so there is nothing in it to lose either. [REPORTED]

This is the cheapest possible moment to get the model right. That will stop
being true as soon as either table is populated.

### Rollback plan

`supabase/migrations/rollback/0042_canonical_availability_rollback.sql` exists
and drops the columns 0042 adds. [REPO] It has **not** been executed anywhere,
and it inherits 0042's defect: it names `watchmode_availability` too, so it
would fail identically. It must be corrected alongside whatever 0042 becomes,
and proven on the same isolated database before either is applied.

---

## 5. Changes made in this commit

Diagnostic and preventive only. **No migration was applied. No schema was
touched.**

1. **`0042` moved from `PENDING_MIGRATIONS` to `EXCLUDED_MIGRATIONS`**
   (`src/lib/pendingMigrations.ts`, `src/lib/excludedMigrations.ts`) with the
   reason recorded inline. Every runner — the CLI script and the admin route —
   reads those lists, so this blocks all of them at once. The `.sql` file is
   deliberately kept for correction.
2. **The reconciliation probe now reports a prerequisite failure.**
   `src/lib/migrationReconcile.ts` gains `BLOCKED_PREREQUISITE_MISSING`.
   0042's probe declares `public.watchmode_availability` as a prerequisite,
   checked *before* the column probe. Previously a missing table read as
   `PROVEN_NOT_APPLIED`, whose recommended action was "apply the migration" —
   the exact wrong instruction. It now reads "do not apply — fix the missing
   object first" and names the object.
3. **Every credential field is gone from the browser admin workflow.**
   `ApplyMigrationsButton.tsx` had inputs for database Host, Port, User,
   Database, Password, a full connection string, and MIGRATE_SECRET; it now has
   no `<input>` at all. `/api/admin/migrate` no longer reads `host`, `port`,
   `database`, `user`, `password`, `dbUrl` or `secret` from the request body,
   and connects only from server-side `SUPABASE_DB_URL`/`MIGRATIONS_DB_URL`.
   Without that configuration it returns a 503 that says so.
4. **The two false comments are corrected** in `scripts/migrate.ts` and
   `src/lib/pendingMigrations.ts`, and both now state that
   `public.schema_migrations` is not the same ledger as Supabase's
   `supabase_migrations.schema_migrations`.

---

## 6. Still unknown

Recorded so none of it is mistaken for settled:

- **Which migrations between 0032 and 0040 are actually applied.** Only 0031
  and 0041 have reported evidence. The rest are unverified in either
  direction, and their probes will answer this the first time the dry check
  runs against a configured connection.
- **What `supabase_migrations.schema_migrations` contains.** Reported to be the
  real ledger; its contents have not been read here.
- **Whether `catalog_titles` is populated**, which decides whether option 2
  above is viable at all.
- **Whether availability queries are erroring in production logs**, as §3
  predicts.

All four need a production connection this environment does not have. None of
them block the diagnostic corrections in §5.
