-- 0025_founder_test.sql
-- Founder test environments (Scott / Heather / Amy). Each founder is a SEPARATE
-- auth account, so RLS already isolates their DNA by user_id. This adds named,
-- resumable TEST SESSIONS per founder, and session-scopes the preference log so
-- a founder can run several independent DNA sessions and switch between them.
-- Fully idempotent. RLS: a user only ever sees their own sessions.

create table if not exists public.founder_test_sessions (
  id             text primary key,                 -- client/server-generated session id
  user_id        uuid not null references auth.users(id) on delete cascade,
  founder        text not null,                    -- scott | heather | amy
  name           text not null,
  status         text not null default 'active',   -- active | archived
  algo_version   text,
  quiz_position  integer not null default 0,
  is_test        boolean not null default true,    -- excluded from customer analytics
  created_at     timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);
create index if not exists idx_founder_sessions_user on public.founder_test_sessions(user_id, founder, status);

alter table public.founder_test_sessions enable row level security;
drop policy if exists founder_sessions_select_own on public.founder_test_sessions;
create policy founder_sessions_select_own on public.founder_test_sessions for select using (user_id = auth.uid());
drop policy if exists founder_sessions_insert_own on public.founder_test_sessions;
create policy founder_sessions_insert_own on public.founder_test_sessions for insert with check (user_id = auth.uid());
drop policy if exists founder_sessions_update_own on public.founder_test_sessions;
create policy founder_sessions_update_own on public.founder_test_sessions for update using (user_id = auth.uid());
drop policy if exists founder_sessions_delete_own on public.founder_test_sessions;
create policy founder_sessions_delete_own on public.founder_test_sessions for delete using (user_id = auth.uid());

-- Session-scope the preference log so each named session has its own DNA, and
-- founder-test rows can be excluded from customer analytics. Guarded so this
-- migration is independent of 0023's apply order.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'preference_events') then
    alter table public.preference_events add column if not exists session_id text;
    alter table public.preference_events add column if not exists is_test boolean not null default false;
    create index if not exists idx_pref_events_session on public.preference_events(user_id, session_id) where session_id is not null;
  end if;
end $$;
