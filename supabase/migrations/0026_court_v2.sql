-- WatchVerd1ct — Court v3: the modern group decision room.
-- Adds per-participant tonight-setup + readiness + per-title reactions
-- (FOR / MAYBE / PASS / VETO) and lightweight real-time GROUP CHAT.
-- Everything stays behind SECURITY DEFINER RPCs (guests can play; tables have
-- no direct-access policies). Idempotent — safe to re-run.
--
-- Stage mapping (no breaking status change):
--   'lobby'   = OPEN      (join · tonight setup · build the shortlist)
--   'veto'    = REACTING  (react to the shortlist together)
--   'verdict' = VERD1CT   (one result + appeal)

alter table public.court_participants
  add column if not exists ready     boolean not null default false,
  add column if not exists tonight   jsonb   not null default '{}'::jsonb,
  add column if not exists reactions jsonb   not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- GROUP CHAT
-- ---------------------------------------------------------------------------
create table if not exists public.court_messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.court_rooms(id) on delete cascade,
  sender     text not null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_court_messages_room on public.court_messages(room_id, created_at);
alter table public.court_messages enable row level security;
-- No direct policies: chat flows through the RPCs below.

create or replace function public.court_chat_send(
  p_code text, p_participant uuid, p_body text
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms; v_name text;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then raise exception 'Room not found'; end if;
  select name into v_name from public.court_participants
    where id = p_participant and room_id = v_room.id;
  if v_name is null then raise exception 'Not in this room'; end if;
  if length(coalesce(trim(p_body), '')) = 0 then return; end if;
  insert into public.court_messages(room_id, sender, body)
  values (v_room.id, v_name, left(trim(p_body), 500));
  -- Keep the room light: retain only the latest 200 messages.
  delete from public.court_messages
   where room_id = v_room.id
     and id not in (
       select id from public.court_messages
        where room_id = v_room.id order by created_at desc limit 200);
end; $$;

-- ---------------------------------------------------------------------------
-- TONIGHT SETUP + READINESS (temporary — never written into permanent DNA)
-- ---------------------------------------------------------------------------
create or replace function public.court_set_tonight(
  p_code text, p_participant uuid, p_tonight jsonb, p_ready boolean
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then raise exception 'Room not found'; end if;
  update public.court_participants
     set tonight = coalesce(p_tonight, '{}'::jsonb),
         ready   = coalesce(p_ready, false)
   where id = p_participant and room_id = v_room.id;
end; $$;

-- ---------------------------------------------------------------------------
-- REACTIONS — for | maybe | pass | veto, per title, per participant
-- ---------------------------------------------------------------------------
create or replace function public.court_react(
  p_code text, p_participant uuid, p_key text, p_reaction text, p_reason text
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then raise exception 'Room not found'; end if;
  if p_reaction not in ('for','maybe','pass','veto') then
    raise exception 'Invalid reaction';
  end if;
  update public.court_participants
     set reactions = reactions || jsonb_build_object(
       p_key, jsonb_build_object('r', p_reaction, 'reason', left(coalesce(p_reason, ''), 60))
     )
   where id = p_participant and room_id = v_room.id;
end; $$;

-- ---------------------------------------------------------------------------
-- Extended room snapshot: participants now carry ready + reaction count;
-- the latest chat rides along so one poll drives the whole room.
-- ---------------------------------------------------------------------------
create or replace function public.court_state_v2(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms; v_parts jsonb; v_msgs jsonb;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', cp.id,
    'name', cp.name,
    'ready', cp.ready,
    'pickCount', coalesce(jsonb_array_length(cp.picks), 0),
    'reactionCount', (select count(*) from jsonb_object_keys(cp.reactions)),
    'reactions', case when v_room.status <> 'lobby' then cp.reactions else '{}'::jsonb end
  ) order by cp.created_at), '[]'::jsonb) into v_parts
  from public.court_participants cp where cp.room_id = v_room.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'sender', m.sender, 'body', m.body, 'at', m.created_at
  ) order by m.created_at), '[]'::jsonb) into v_msgs
  from (
    select * from public.court_messages
     where room_id = v_room.id order by created_at desc limit 50
  ) m;
  return jsonb_build_object(
    'status', v_room.status,
    'mediaType', v_room.media_type,
    'finalists', v_room.finalists,
    'participants', v_parts,
    'messages', v_msgs
  );
end; $$;

-- ---------------------------------------------------------------------------
-- LATE JOINING. v1 rejected any join once the room left the lobby, which left
-- a late arrival (or a refresh that lost local storage) stuck with controls
-- that did nothing. Joining is now allowed while the group is still reacting;
-- only a finished Verd1ct closes the door.
-- ---------------------------------------------------------------------------
create or replace function public.court_join(
  p_code text, p_name text, p_love text[], p_avoid text[], p_mood text
)
returns table(participant_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms; v_id uuid;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then raise exception 'Room not found'; end if;
  if v_room.status = 'verdict' then raise exception 'This Court has already reached its Verd1ct'; end if;
  if length(coalesce(trim(p_name), '')) = 0 then raise exception 'Name required'; end if;
  if (select count(*) from public.court_participants where room_id = v_room.id) >= 8 then
    raise exception 'This Court is full';
  end if;
  insert into public.court_participants(room_id, name, love, avoid, mood)
  values (v_room.id, left(trim(p_name), 40), coalesce(p_love, '{}'), coalesce(p_avoid, '{}'), coalesce(nullif(p_mood, ''), 'any'))
  returning id into v_id;
  return query select v_id;
end; $$;

grant execute on function public.court_join(text, text, text[], text[], text) to anon, authenticated;
grant execute on function public.court_chat_send(text, uuid, text) to anon, authenticated;
grant execute on function public.court_set_tonight(text, uuid, jsonb, boolean) to anon, authenticated;
grant execute on function public.court_react(text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.court_state_v2(text) to anon, authenticated;
