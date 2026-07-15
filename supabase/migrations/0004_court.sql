-- WatchVerdict — live "Taste Court" rooms (each person on their own phone).
-- Room state lives in the DB; phones join by code and poll state. All access is
-- through SECURITY DEFINER RPCs (so unauthenticated guests can play), tables are
-- otherwise locked down by RLS with no direct-access policies.

create table if not exists public.court_rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  host_token text not null,
  status     text not null default 'lobby' check (status in ('lobby','veto','verdict')),
  media_type text not null default 'any',
  finalists  jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.court_participants (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.court_rooms(id) on delete cascade,
  name        text not null,
  love        text[] not null default '{}',
  avoid       text[] not null default '{}',
  mood        text not null default 'any',
  voted       boolean not null default false,
  veto_index  int,
  veto_reason text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_court_participants_room on public.court_participants(room_id);

alter table public.court_rooms        enable row level security;
alter table public.court_participants enable row level security;
-- No direct policies: everything goes through the RPCs below.

create or replace function public.court_create(p_media_type text)
returns table(code text, host_token text)
language plpgsql security definer set search_path = public as $$
declare v_code text; v_token text;
begin
  v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_token := gen_random_uuid()::text;
  insert into public.court_rooms(code, host_token, status, media_type)
  values (v_code, v_token, 'lobby', coalesce(nullif(p_media_type, ''), 'any'));
  return query select v_code, v_token;
end; $$;

create or replace function public.court_join(
  p_code text, p_name text, p_love text[], p_avoid text[], p_mood text
)
returns table(participant_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms; v_id uuid;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then raise exception 'Room not found'; end if;
  if v_room.status <> 'lobby' then raise exception 'Court already started'; end if;
  if length(coalesce(trim(p_name), '')) = 0 then raise exception 'Name required'; end if;
  if (select count(*) from public.court_participants where room_id = v_room.id) >= 8 then
    raise exception 'Room is full';
  end if;
  insert into public.court_participants(room_id, name, love, avoid, mood)
  values (v_room.id, left(trim(p_name), 40), coalesce(p_love, '{}'), coalesce(p_avoid, '{}'), coalesce(nullif(p_mood, ''), 'any'))
  returning id into v_id;
  return query select v_id;
end; $$;

-- Public room snapshot for polling. Individual votes are hidden until verdict.
create or replace function public.court_state(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms; v_parts jsonb;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', cp.id,
    'name', cp.name,
    'voted', cp.voted,
    'vetoIndex', case when v_room.status = 'verdict' then cp.veto_index else null end,
    'vetoReason', case when v_room.status = 'verdict' then cp.veto_reason else null end
  ) order by cp.created_at), '[]'::jsonb) into v_parts
  from public.court_participants cp where cp.room_id = v_room.id;
  return jsonb_build_object(
    'status', v_room.status,
    'mediaType', v_room.media_type,
    'finalists', v_room.finalists,
    'participants', v_parts
  );
end; $$;

-- A participant casts (or passes) their one veto. Auto-advances to verdict when
-- everyone has voted.
create or replace function public.court_vote(
  p_code text, p_participant uuid, p_index int, p_reason text
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms; v_total int; v_voted int;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then raise exception 'Room not found'; end if;
  update public.court_participants
    set voted = true, veto_index = p_index, veto_reason = left(p_reason, 40)
    where id = p_participant and room_id = v_room.id;
  select count(*), count(*) filter (where voted) into v_total, v_voted
    from public.court_participants where room_id = v_room.id;
  if v_total > 0 and v_voted >= v_total and v_room.status = 'veto' then
    update public.court_rooms set status = 'verdict', updated_at = now() where id = v_room.id;
  end if;
end; $$;

-- Host can force the verdict (e.g. someone's slow to vote).
create or replace function public.court_reveal(p_code text, p_host_token text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then raise exception 'Room not found'; end if;
  if v_room.host_token <> p_host_token then raise exception 'Not host'; end if;
  update public.court_rooms set status = 'verdict', updated_at = now() where id = v_room.id and status = 'veto';
end; $$;

grant execute on function public.court_create(text) to anon, authenticated;
grant execute on function public.court_reveal(text, text) to anon, authenticated;
grant execute on function public.court_join(text, text, text[], text[], text) to anon, authenticated;
grant execute on function public.court_state(text) to anon, authenticated;
grant execute on function public.court_vote(text, uuid, int, text) to anon, authenticated;
