-- ROLLBACK for 0026_court_v2.sql — verified against PostgreSQL 16.
--
-- Restores the Court to its pre-0026 behaviour WITHOUT touching any existing
-- room, participant, pick, vote or verdict data:
--   • drops only the objects 0026 ADDED (court_messages + the four new RPCs)
--   • restores the previous court_join (which refused non-lobby joins)
--   • leaves the three ADDED COLUMNS in place — dropping them would destroy
--     tonight-setup and reaction data, and unused columns are harmless. Run the
--     clearly-marked optional block at the bottom ONLY if you accept that loss.
--
-- Safe to run more than once.

begin;

drop function if exists public.court_chat_send(text, uuid, text);
drop function if exists public.court_set_tonight(text, uuid, jsonb, boolean);
drop function if exists public.court_react(text, uuid, text, text, text);
drop function if exists public.court_state_v2(text);
drop table if exists public.court_messages;

-- Restore the pre-0026 join rule (lobby only).
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
grant execute on function public.court_join(text, text, text[], text[], text) to anon, authenticated;

commit;

-- OPTIONAL — DESTRUCTIVE. Only if you also want the added columns gone.
-- This permanently deletes every participant's tonight setup and reactions.
-- alter table public.court_participants
--   drop column if exists ready,
--   drop column if exists tonight,
--   drop column if exists reactions;
