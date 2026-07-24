-- WatchVerdict — Live Court hardening. IDEMPOTENT + defensive: safe to run on a
-- fresh DB (after 0004 + 0014), on an already-partially-migrated DB, and repeatedly.
-- Preserves existing rooms/participants. Adds: room expiry, a 'closed' status, a
-- STABLE per-device guest id with an idempotent join (no ghost/duplicate
-- participants), distinct error messages, a host close RPC, and a secretless health
-- probe. Everything stays behind SECURITY DEFINER RPCs (guests can play under RLS).

-- ── Rooms: expiry + 'closed' status ──────────────────────────────────────────
alter table public.court_rooms
  add column if not exists expires_at timestamptz not null default (now() + interval '12 hours');

-- Extend the status check to allow 'closed' (drop the old auto-named check first).
alter table public.court_rooms drop constraint if exists court_rooms_status_check;
alter table public.court_rooms
  add constraint court_rooms_status_check
  check (status in ('lobby','veto','verdict','closed'));

create index if not exists idx_court_rooms_expires on public.court_rooms(expires_at);

-- ── Participants: stable device guest id + uniqueness (no ghosts) ─────────────
alter table public.court_participants
  add column if not exists guest_id text;

-- One participant per (room, device). Partial unique so legacy null rows coexist.
create unique index if not exists uq_court_participants_room_guest
  on public.court_participants(room_id, guest_id) where guest_id is not null;

-- ── Idempotent join with DISTINCT, accurate errors ───────────────────────────
-- Replaces the 5-arg join with a 6-arg version that also takes a stable guest id.
drop function if exists public.court_join(text, text, text[], text[], text);
create or replace function public.court_join(
  p_code text, p_name text, p_love text[], p_avoid text[], p_mood text, p_guest_id text default null
)
returns table(participant_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms; v_id uuid; v_count int;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status = 'closed' then raise exception 'ROOM_CLOSED'; end if;
  if v_room.expires_at is not null and now() > v_room.expires_at then raise exception 'ROOM_EXPIRED'; end if;

  -- Idempotent: a returning device (same guest id) re-joins its existing seat.
  if p_guest_id is not null and length(p_guest_id) > 0 then
    select id into v_id from public.court_participants
      where room_id = v_room.id and guest_id = p_guest_id limit 1;
    if v_id is not null then
      -- allow a fresh display name on return, but don't duplicate the row.
      update public.court_participants
        set name = coalesce(nullif(trim(p_name), ''), name), mood = coalesce(nullif(p_mood, ''), mood)
        where id = v_id;
      return query select v_id; return;
    end if;
  end if;

  if v_room.status <> 'lobby' then raise exception 'COURT_ALREADY_STARTED'; end if;
  if length(coalesce(trim(p_name), '')) = 0 then raise exception 'NAME_REQUIRED'; end if;
  select count(*) into v_count from public.court_participants where room_id = v_room.id;
  if v_count >= 8 then raise exception 'ROOM_FULL'; end if;

  insert into public.court_participants(room_id, name, love, avoid, mood, guest_id)
  values (v_room.id, left(trim(p_name), 40), coalesce(p_love, '{}'), coalesce(p_avoid, '{}'),
          coalesce(nullif(p_mood, ''), 'any'), nullif(p_guest_id, ''))
  returning id into v_id;
  return query select v_id;
end; $$;

-- ── Room snapshot: authoritative status incl. expired/closed + expiresAt ──────
create or replace function public.court_state(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms; v_parts jsonb; v_status text;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then return null; end if;
  v_status := v_room.status;
  if v_status in ('lobby','veto') and v_room.expires_at is not null and now() > v_room.expires_at then
    v_status := 'expired';
  end if;
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
    'status', v_status,
    'mediaType', v_room.media_type,
    'finalists', v_room.finalists,
    'expiresAt', v_room.expires_at,
    'participants', v_parts
  );
end; $$;

-- ── Host closes the room ─────────────────────────────────────────────────────
create or replace function public.court_close(p_code text, p_host_token text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_token <> p_host_token then raise exception 'NOT_HOST'; end if;
  update public.court_rooms set status = 'closed', updated_at = now() where id = v_room.id;
end; $$;

-- ── Secretless health probe (schema readiness) ───────────────────────────────
-- Returns booleans only — never any keys, tokens, or row data. Callable by anon so
-- the app can precisely distinguish "migration missing" from other failures.
create or replace function public.court_health()
returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', (to_regclass('public.court_rooms') is not null
           and to_regclass('public.court_participants') is not null),
    'rooms_table', to_regclass('public.court_rooms') is not null,
    'participants_table', to_regclass('public.court_participants') is not null,
    'has_guest_id', exists (select 1 from information_schema.columns
       where table_schema='public' and table_name='court_participants' and column_name='guest_id'),
    'has_expires_at', exists (select 1 from information_schema.columns
       where table_schema='public' and table_name='court_rooms' and column_name='expires_at'),
    'join_fn', exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='court_join'),
    'state_fn', exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='court_state'),
    'health_version', 1
  );
$$;

grant execute on function public.court_join(text, text, text[], text[], text, text) to anon, authenticated;
grant execute on function public.court_state(text) to anon, authenticated;
grant execute on function public.court_close(text, text) to anon, authenticated;
grant execute on function public.court_health() to anon, authenticated;
