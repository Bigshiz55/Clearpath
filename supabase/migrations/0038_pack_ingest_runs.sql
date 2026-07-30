-- 0038 — Lazy self-ingest tracking for Pack pages.
--
-- /packs/[slug] triggers the existing TVmaze ingest itself, lazily, when the
-- Pack it's rendering has no data yet or its last successful ingest is more
-- than 12 hours old — no admin route, no token, no new environment variable.
-- This table is the single source of truth for that staleness check
-- (queryable on its own — no join to tv_airings needed to know "is this
-- Pack's ingest stale") and the record of every attempt, successful or not.
--
-- Concurrency: `pack_begin_ingest_if_stale` below is the ONLY place that
-- decides "should this request run an ingest," and it makes that decision
-- and reserves the run (by inserting the in-progress row) inside a single
-- transaction-scoped advisory lock (`pg_try_advisory_xact_lock`) keyed on
-- the Pack id. Deliberately transaction-scoped, not session-scoped
-- (pg_advisory_lock/pg_advisory_unlock): PostgREST/supabase-js issues each
-- RPC call as its own request, with no guarantee two calls land on the same
-- underlying Postgres session — a session-scoped lock acquired in one call
-- could never be reliably released by a later call, and holding one
-- physical connection open across the whole external TVmaze fetch would
-- mean a raw, persistent DB connection driven from a public page-load path,
-- which this phase does not add. A transaction-scoped lock only needs to
-- protect the brief "check current state, then insert the in-progress
-- marker row" step — which is exactly what it does here — and the
-- in-progress row itself (finished_at is null) is what protects the actual,
-- slow, external ingest for as long as it runs, well after the lock has
-- already been released. The partial unique index below is a second,
-- redundant guarantee of the same thing at the constraint level.
--
-- Idempotent — safe to re-run.

create table if not exists public.pack_ingest_runs (
  id             uuid primary key default gen_random_uuid(),
  pack_id        uuid not null references public.packs(id) on delete cascade,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  outcome        text check (outcome in ('success', 'partial', 'failed')),
  rows_written   integer,
  error_message  text
);

create index if not exists pack_ingest_runs_pack_started_idx
  on public.pack_ingest_runs (pack_id, started_at desc);

-- At most one in-progress (finished_at is null) run per Pack at a time.
create unique index if not exists pack_ingest_runs_one_active
  on public.pack_ingest_runs (pack_id) where finished_at is null;

alter table public.pack_ingest_runs enable row level security;
-- Operational table, same posture as 0032's tv_ingestion_runs: RLS enabled,
-- no select policy, so only the service role (or the SECURITY DEFINER
-- functions below) can touch it. Regular users never read this table
-- directly — the Pack page reads Pack-facing data (tv_airings, cases, ...),
-- not ingest bookkeeping.

-- ---------------------------------------------------------------------------
-- pack_try_start_ingest — atomically decide "does this Pack need an ingest
-- run right now," and if so, reserve it. Called from the Pack page's own
-- (anonymous-or-signed-in) request, so SECURITY DEFINER + an explicit grant
-- to anon/authenticated — the function's own logic is the only thing that
-- runs with elevated privilege, and it exposes no arbitrary read/write.
-- ---------------------------------------------------------------------------
create or replace function public.pack_try_start_ingest(p_pack_id uuid, p_stale_after_minutes int default 720)
returns table(should_run boolean, run_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked   boolean;
  v_last     public.pack_ingest_runs%rowtype;
  v_has_data boolean;
  v_run_id   uuid;
begin
  select pg_try_advisory_xact_lock(hashtext('pack_ingest:' || p_pack_id::text)::bigint) into v_locked;
  if not v_locked then
    return query select false, null::uuid;
    return;
  end if;

  select * into v_last from public.pack_ingest_runs
    where pack_id = p_pack_id
    order by started_at desc
    limit 1;

  if v_last.id is not null and v_last.finished_at is null then
    -- Another request is already running (or crashed mid-run — a stuck row
    -- ages out of relevance once a human notices via pack_ingest_runs, but
    -- this phase does not add a reaper; out of scope here).
    return query select false, null::uuid;
    return;
  end if;

  select exists(
    select 1
    from public.tv_airings a
    join public.pack_stations ps on ps.station_id = a.station_id
    where ps.pack_id = p_pack_id and a.start_at_utc >= now()
  ) into v_has_data;

  if v_has_data
     and v_last.id is not null
     and v_last.outcome = 'success'
     and v_last.finished_at > now() - (p_stale_after_minutes || ' minutes')::interval
  then
    return query select false, null::uuid;
    return;
  end if;

  insert into public.pack_ingest_runs (pack_id, started_at)
    values (p_pack_id, now())
    returning id into v_run_id;

  return query select true, v_run_id;
end;
$$;

create or replace function public.pack_finish_ingest(
  p_run_id uuid,
  p_outcome text,
  p_rows_written int,
  p_error_message text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.pack_ingest_runs
  set finished_at = now(), outcome = p_outcome, rows_written = p_rows_written, error_message = p_error_message
  where id = p_run_id;
$$;

grant execute on function public.pack_try_start_ingest(uuid, int) to anon, authenticated;
grant execute on function public.pack_finish_ingest(uuid, text, int, text) to anon, authenticated;

comment on table public.pack_ingest_runs is
  'Lazy self-ingest bookkeeping for /packs/[slug]. Staleness is queryable from this table alone; see pack_try_start_ingest for the concurrency guard.';
