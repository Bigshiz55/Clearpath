-- WatchVerd1ct — HOST-CONTROLLED COURT SIZE.
--
-- The number of titles a court considers is a ROOM setting, not a personal one.
-- Storing it on the room (rather than in each client) is what makes it
-- impossible for two devices to disagree: there is exactly one writer (the
-- host, proven by the host token) and everyone else reads the same row.
--
-- Locking: the size may only change while the room is still in 'lobby'. Once
-- candidate generation has begun the room has already been built against a
-- size, so changing it would silently invalidate what everyone is looking at.
--
-- Depends only on 0004 (court_rooms / court_participants), NOT on 0026, so a
-- deployment that has not yet applied the v2 court still gets this correctly.
-- Idempotent — safe to re-run.

alter table public.court_rooms
  add column if not exists court_size          text not null default 'standard',
  add column if not exists host_participant_id uuid;

-- Guard the column itself: an invalid size must be impossible to persist even
-- if a future caller forgets to validate.
do $$
begin
  alter table public.court_rooms
    add constraint court_rooms_court_size_chk check (court_size in ('quick','standard','deep'));
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- HOST IDENTITY — link the creating participant to the room, so every member
-- can be shown WHO chose the size. Idempotent and host-token gated; a guest
-- cannot claim to be the host.
-- ---------------------------------------------------------------------------
create or replace function public.court_claim_host(
  p_code text, p_host_token text, p_participant uuid
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then raise exception 'Room not found'; end if;
  if v_room.host_token <> p_host_token then raise exception 'Not host'; end if;
  -- The participant must actually be in this room.
  if not exists (select 1 from public.court_participants where id = p_participant and room_id = v_room.id) then
    raise exception 'Not in this room';
  end if;
  update public.court_rooms
     set host_participant_id = p_participant, updated_at = now()
   where id = v_room.id;
end; $$;

-- ---------------------------------------------------------------------------
-- SET THE COURT SIZE — host only, lobby only.
-- Returns the size that is now in force, so a rejected write still tells the
-- caller the truth rather than leaving its UI showing a value the room does
-- not have.
-- ---------------------------------------------------------------------------
create or replace function public.court_set_size(
  p_code text, p_host_token text, p_size text
)
returns text
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then raise exception 'Room not found'; end if;
  if v_room.host_token <> p_host_token then raise exception 'Only the host can change the court size'; end if;
  if p_size not in ('quick','standard','deep') then raise exception 'Invalid court size'; end if;
  -- Locked once the court has been built: the shortlist already reflects a size.
  if v_room.status <> 'lobby' then
    return v_room.court_size;
  end if;
  update public.court_rooms
     set court_size = p_size, updated_at = now()
   where id = v_room.id;
  return p_size;
end; $$;

-- ---------------------------------------------------------------------------
-- Expose the setting on BOTH snapshots, so the read-only card works whether or
-- not 0026 has been applied.
--   courtSize  — 'quick' | 'standard' | 'deep'
--   hostName   — display name of the creator, or null before they join
--   sizeLocked — true once candidate generation has begun
-- ---------------------------------------------------------------------------
create or replace function public.court_state(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms; v_parts jsonb; v_host text;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', cp.id,
    'name', cp.name,
    'host', (cp.id = v_room.host_participant_id),
    'voted', cp.voted,
    'vetoIndex', case when v_room.status = 'verdict' then cp.veto_index else null end,
    'vetoReason', case when v_room.status = 'verdict' then cp.veto_reason else null end
  ) order by cp.created_at), '[]'::jsonb) into v_parts
  from public.court_participants cp where cp.room_id = v_room.id;
  select name into v_host from public.court_participants where id = v_room.host_participant_id;
  return jsonb_build_object(
    'status', v_room.status,
    'mediaType', v_room.media_type,
    'finalists', v_room.finalists,
    'participants', v_parts,
    'courtSize', v_room.court_size,
    'hostName', v_host,
    'sizeLocked', (v_room.status <> 'lobby')
  );
end; $$;

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'court_state_v2'
  ) then
    execute $fn$
      create or replace function public.court_state_v2(p_code text)
      returns jsonb
      language plpgsql security definer set search_path = public as $body$
      declare v_room public.court_rooms; v_parts jsonb; v_msgs jsonb; v_host text;
      begin
        select * into v_room from public.court_rooms where code = p_code;
        if not found then return null; end if;
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', cp.id,
          'name', cp.name,
          'host', (cp.id = v_room.host_participant_id),
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
        select name into v_host from public.court_participants where id = v_room.host_participant_id;
        return jsonb_build_object(
          'status', v_room.status,
          'mediaType', v_room.media_type,
          'finalists', v_room.finalists,
          'participants', v_parts,
          'messages', v_msgs,
          'courtSize', v_room.court_size,
          'hostName', v_host,
          'sizeLocked', (v_room.status <> 'lobby')
        );
      end; $body$;
    $fn$;
  end if;
end $$;

grant execute on function public.court_set_size(text, text, text)   to anon, authenticated;
grant execute on function public.court_claim_host(text, text, uuid) to anon, authenticated;
