-- WatchVerdict — Live Court v2: each person searches the real titles THEY want
-- to watch (a wishlist), and the judge ranks 3 that best fit the whole group.
--
-- Adds per-participant `picks` (their searched titles) and a room-level
-- `seen_keys` ledger so "show 3 more" and per-title vetoes never repeat a title.
-- Everything still flows through SECURITY DEFINER RPCs so guests can play.

alter table public.court_participants
  add column if not exists picks jsonb not null default '[]'::jsonb;

alter table public.court_rooms
  add column if not exists seen_keys text[] not null default '{}';

-- A participant sets/updates their wishlist (the titles they searched for).
-- Only allowed while the room is still in the lobby.
create or replace function public.court_set_picks(
  p_code text, p_participant uuid, p_picks jsonb
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then raise exception 'Room not found'; end if;
  if v_room.status <> 'lobby' then raise exception 'Court already started'; end if;
  if jsonb_typeof(coalesce(p_picks, '[]'::jsonb)) <> 'array' then
    raise exception 'picks must be an array';
  end if;
  -- Cap at 8 picks per person so the pool stays sane.
  update public.court_participants
    set picks = (
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
      from (select elem from jsonb_array_elements(coalesce(p_picks, '[]'::jsonb)) elem limit 8) s
    )
    where id = p_participant and room_id = v_room.id;
end; $$;

-- Public room snapshot for polling. Now also reports each participant's pick
-- count so the lobby can show who's ready. Individual votes stay hidden until
-- the verdict, exactly as before.
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
    'pickCount', coalesce(jsonb_array_length(cp.picks), 0),
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

grant execute on function public.court_set_picks(text, uuid, jsonb) to anon, authenticated;
