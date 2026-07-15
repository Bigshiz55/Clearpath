-- WatchVerdict — cloud "crews" for Tonight, Together (cross-device + QR join).
-- A crew is an owned group with its own people (name + taste traits) and its own
-- accumulated Group DNA. Guests join via a share code (QR/link) without needing
-- to own the crew, mirroring the SECURITY DEFINER pattern used for shares.

create table if not exists public.crews (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  join_code  text not null unique,
  dna        jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_crews_owner on public.crews(owner_id);

create table if not exists public.crew_people (
  id         uuid primary key default gen_random_uuid(),
  crew_id    uuid not null references public.crews(id) on delete cascade,
  name       text not null,
  love       text[] not null default '{}',
  avoid      text[] not null default '{}',
  is_guest   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_crew_people_crew on public.crew_people(crew_id);

alter table public.crews        enable row level security;
alter table public.crew_people  enable row level security;

drop policy if exists crews_all_own on public.crews;
create policy crews_all_own on public.crews
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists crew_people_all_own on public.crew_people;
create policy crew_people_all_own on public.crew_people
  for all using (
    exists (select 1 from public.crews c where c.id = crew_id and c.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.crews c where c.id = crew_id and c.owner_id = auth.uid())
  );

-- Public: look up a crew's display name by its share code (for the join page).
create or replace function public.get_crew_public(p_code text)
returns table(name text)
language sql security definer set search_path = public as $$
  select name from public.crews where join_code = p_code;
$$;

-- Public: a guest joins a crew by code with a quick taste calibration.
create or replace function public.join_crew(
  p_code text, p_name text, p_love text[], p_avoid text[]
)
returns table(crew_name text)
language plpgsql security definer set search_path = public as $$
declare v_crew public.crews;
begin
  select * into v_crew from public.crews where join_code = p_code;
  if not found then raise exception 'Crew not found'; end if;
  if length(coalesce(trim(p_name), '')) = 0 then raise exception 'Name required'; end if;
  if (select count(*) from public.crew_people where crew_id = v_crew.id) >= 12 then
    raise exception 'Crew is full';
  end if;
  insert into public.crew_people(crew_id, name, love, avoid, is_guest)
  values (v_crew.id, left(trim(p_name), 40), coalesce(p_love, '{}'), coalesce(p_avoid, '{}'), true);
  update public.crews set updated_at = now() where id = v_crew.id;
  return query select v_crew.name;
end;
$$;

grant execute on function public.get_crew_public(text) to anon, authenticated;
grant execute on function public.join_crew(text, text, text[], text[]) to anon, authenticated;
