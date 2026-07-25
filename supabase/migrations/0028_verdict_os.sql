-- VERD1CT OS — company operating system spine.
--
-- ADDITIVE ONLY: creates new tables in their own namespace. Touches NOTHING
-- belonging to the WatchVerd1ct consumer app or the Public Discovery Platform.
--
-- Security model: every table is RLS-protected and readable only by a member
-- with an OS role. Writes go through server actions that re-check capabilities
-- in application code, and every mutation appends to os_activity, which is
-- append-only (no update/delete policy exists for it at all).

-- Who may use the OS, and as what.
create table if not exists public.os_members (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('founder','admin','manager','contributor','approver','viewer')),
  display_name text,
  created_at timestamptz not null default now(),
  unique (user_id)
);

-- Products the OS manages (WatchVerd1ct, ReadVerd1ct, future products).
create table if not exists public.os_products (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text,
  status      text not null default 'active' check (status in ('concept','building','beta','active','paused','retired')),
  live_url    text,
  repo_url    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.os_missions (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  objective   text,
  description text,
  status      text not null default 'draft'
              check (status in ('draft','active','blocked','in_review','complete','cancelled')),
  priority    text not null default 'medium' check (priority in ('low','medium','high','critical')),
  product_id  uuid references public.os_products(id) on delete set null,
  owner_id    uuid references auth.users(id) on delete set null,
  target_date date,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_os_missions_status on public.os_missions(status);

create table if not exists public.os_tasks (
  id          uuid primary key default gen_random_uuid(),
  mission_id  uuid not null references public.os_missions(id) on delete cascade,
  title       text not null,
  detail      text,
  status      text not null default 'todo'
              check (status in ('todo','in_progress','blocked','done','cancelled')),
  assignee_id uuid references auth.users(id) on delete set null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_os_tasks_mission on public.os_tasks(mission_id);

create table if not exists public.os_approvals (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  action_kind  text not null,
  tier         text not null check (tier in ('automatic','approval_required','executive_only')),
  reason       text,
  expected_outcome text,
  risk_level   text not null default 'medium' check (risk_level in ('low','medium','high')),
  status       text not null default 'pending'
               check (status in ('pending','approved','rejected','changes_requested','withdrawn')),
  product_id   uuid references public.os_products(id) on delete set null,
  mission_id   uuid references public.os_missions(id) on delete set null,
  requested_by uuid not null references auth.users(id) on delete cascade,
  decided_by   uuid references auth.users(id) on delete set null,
  decided_at   timestamptz,
  decision_note text,
  due_date     date,
  created_at   timestamptz not null default now()
);
create index if not exists idx_os_approvals_status on public.os_approvals(status);

-- A requester can never be the decider. Enforced in the DATABASE as well as in
-- application code, so no code path can bypass it.
alter table public.os_approvals drop constraint if exists os_approvals_no_self_decision;
alter table public.os_approvals
  add constraint os_approvals_no_self_decision
  check (decided_by is null or decided_by <> requested_by);

create table if not exists public.os_automations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  purpose     text,
  trigger_kind text not null default 'manual' check (trigger_kind in ('manual','schedule','condition')),
  schedule    text,
  action_kind text not null,
  product_id  uuid references public.os_products(id) on delete set null,
  enabled     boolean not null default false,
  -- Honest execution state: never claim an integration ran when it did not.
  state       text not null default 'configured'
              check (state in ('configured','simulated','awaiting_integration','blocked','active')),
  last_run_at timestamptz,
  last_result text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Append-only audit trail. Deliberately has NO update or delete policy.
create table if not exists public.os_activity (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  previous    jsonb,
  next        jsonb,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_os_activity_entity on public.os_activity(entity_type, entity_id, created_at desc);
create index if not exists idx_os_activity_recent on public.os_activity(created_at desc);

alter table public.os_members     enable row level security;
alter table public.os_products    enable row level security;
alter table public.os_missions    enable row level security;
alter table public.os_tasks       enable row level security;
alter table public.os_approvals   enable row level security;
alter table public.os_automations enable row level security;
alter table public.os_activity    enable row level security;

-- Membership test used by every policy below.
create or replace function public.os_is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.os_members m where m.user_id = auth.uid());
$$;

-- READ access for OS members only. Company data is never public: there is no
-- anon policy on any of these tables. WRITES have no policy at all, so they are
-- only possible through the service-role server actions, which check
-- capabilities first.
do $$
declare t text;
begin
  foreach t in array array['os_members','os_products','os_missions','os_tasks','os_approvals','os_automations','os_activity']
  loop
    execute format('drop policy if exists %I_member_read on public.%I', t, t);
    execute format(
      'create policy %I_member_read on public.%I for select to authenticated using (public.os_is_member())',
      t, t);
  end loop;
end $$;

grant execute on function public.os_is_member() to authenticated;
