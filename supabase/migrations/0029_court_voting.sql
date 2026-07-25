-- WatchVerdict — live court voting: candidate pool, four-action votes,
-- veto tokens, Final Three and the recorded result.
--
-- ADDITIVE. Extends the existing court_rooms / court_participants /
-- court_messages schema; changes nothing that already exists.
--
-- DESIGN NOTE — veto tokens: `court_veto_tokens` records the GRANT (how many a
-- member has for this court). Spend is derived from court_votes, which is the
-- single source of truth, so a token count can never drift out of step with the
-- votes that produced it.

create table if not exists public.court_candidates (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.court_rooms(id) on delete cascade,
  candidate_key text not null,               -- "movie-123"
  tmdb_id      int not null,
  media_type   text not null check (media_type in ('movie','tv')),
  title        text not null,
  poster_path  text,
  genre        text,
  decade       int,
  tone         text,
  runtime_minutes int,
  available_on text[] not null default '{}',
  reason       text,                          -- why THIS court got this title
  slot         int,                           -- 0-5 when active, null in reserve
  pool         text not null default 'active' check (pool in ('active','reserve','removed')),
  removed_reason text check (removed_reason in ('veto','seen_it')),
  fit_score    int,
  created_at   timestamptz not null default now(),
  unique (room_id, candidate_key)
);
create index if not exists idx_court_candidates_room on public.court_candidates(room_id, pool);

create table if not exists public.court_votes (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.court_rooms(id) on delete cascade,
  participant_id uuid not null references public.court_participants(id) on delete cascade,
  candidate_key text not null,
  action        text not null check (action in ('watch_it','maybe','veto','seen_it')),
  is_guest      boolean not null default false,
  round         text not null default 'main' check (round in ('main','final')),
  created_at    timestamptz not null default now(),
  -- One vote per member per candidate per round: makes submission idempotent
  -- and prevents the double-vote race entirely at the storage layer.
  unique (room_id, participant_id, candidate_key, round)
);
create index if not exists idx_court_votes_room on public.court_votes(room_id, candidate_key);

create table if not exists public.court_veto_tokens (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.court_rooms(id) on delete cascade,
  participant_id uuid not null references public.court_participants(id) on delete cascade,
  granted       int not null default 2 check (granted >= 0),
  created_at    timestamptz not null default now(),
  unique (room_id, participant_id)
);

create table if not exists public.court_candidate_replacements (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.court_rooms(id) on delete cascade,
  removed_key   text not null,
  promoted_key  text,                          -- null when the reserve was spent
  reason        text not null check (reason in ('veto','seen_it')),
  triggered_by  uuid references public.court_participants(id) on delete set null,
  created_at    timestamptz not null default now(),
  -- A candidate can only ever be replaced once: the guard against a double
  -- replacement when two people act at the same moment.
  unique (room_id, removed_key)
);

create table if not exists public.court_finalists (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.court_rooms(id) on delete cascade,
  candidate_key text not null,
  rank          int not null,
  group_score   int,
  created_at    timestamptz not null default now(),
  unique (room_id, candidate_key)
);

create table if not exists public.court_results (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.court_rooms(id) on delete cascade,
  winning_key   text not null,
  group_score   int,
  why_it_won    text,
  compromises   text,
  tie_break_rule text,
  guest_watch_it_percent int,                  -- reported separately, never blended
  decided_at    timestamptz not null default now(),
  unique (room_id)
);

alter table public.court_candidates             enable row level security;
alter table public.court_votes                  enable row level security;
alter table public.court_veto_tokens            enable row level security;
alter table public.court_candidate_replacements enable row level security;
alter table public.court_finalists              enable row level security;
alter table public.court_results                enable row level security;
-- No direct policies: like the rest of the court schema, every read and write
-- flows through SECURITY DEFINER RPCs, so a guessed room id grants nothing.

-- Cast (or change nothing — idempotent) a vote. Enforces active-candidate,
-- duplicate and veto-token rules inside one transaction, so two members acting
-- simultaneously cannot both spend a last token or double-remove a title.
create or replace function public.court_cast_vote(
  p_code text, p_participant uuid, p_key text, p_action text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room public.court_rooms;
  v_cand public.court_candidates;
  v_granted int;
  v_spent int;
  v_promoted public.court_candidates;
  v_slot int;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then raise exception 'Room not found'; end if;
  if p_action not in ('watch_it','maybe','veto','seen_it') then
    raise exception 'Invalid action';
  end if;

  select * into v_cand from public.court_candidates
    where room_id = v_room.id and candidate_key = p_key for update;
  if not found then raise exception 'Unknown candidate'; end if;
  if v_cand.pool <> 'active' then raise exception 'That title is no longer in the running'; end if;

  if exists (select 1 from public.court_votes
             where room_id = v_room.id and participant_id = p_participant
               and candidate_key = p_key and round = 'main') then
    raise exception 'You have already voted on this title';
  end if;

  if p_action = 'veto' then
    select coalesce(max(granted), 2) into v_granted from public.court_veto_tokens
      where room_id = v_room.id and participant_id = p_participant;
    select count(*) into v_spent from public.court_votes
      where room_id = v_room.id and participant_id = p_participant and action = 'veto';
    if v_spent >= v_granted then raise exception 'No veto tokens remaining'; end if;
  end if;

  insert into public.court_votes(room_id, participant_id, candidate_key, action)
  values (v_room.id, p_participant, p_key, p_action);

  -- Veto and "seen it" remove the title and promote the best reserve into the
  -- SAME slot. The unique constraint on replacements makes this safe to race.
  if p_action in ('veto','seen_it') then
    v_slot := v_cand.slot;
    update public.court_candidates
      set pool = 'removed', removed_reason = p_action, slot = null
      where id = v_cand.id;

    select * into v_promoted from public.court_candidates
      where room_id = v_room.id and pool = 'reserve'
      order by fit_score desc nulls last, created_at limit 1 for update skip locked;

    if found then
      update public.court_candidates set pool = 'active', slot = v_slot where id = v_promoted.id;
    end if;

    insert into public.court_candidate_replacements(room_id, removed_key, promoted_key, reason, triggered_by)
    values (v_room.id, p_key, v_promoted.candidate_key, p_action, p_participant)
    on conflict (room_id, removed_key) do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'removed', p_action in ('veto','seen_it'),
    'promoted', v_promoted.candidate_key,
    'vetoTokensLeft', case when p_action = 'veto' then greatest(0, v_granted - v_spent - 1) else null end
  );
end; $$;

-- Room voting state. Individual choices stay hidden until the caller has voted
-- on that candidate — enforced server-side, not merely hidden in the UI.
create or replace function public.court_vote_state(p_code text, p_participant uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_room public.court_rooms; v_out jsonb;
begin
  select * into v_room from public.court_rooms where code = p_code;
  if not found then return null; end if;

  select jsonb_build_object(
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', c.candidate_key, 'title', c.title, 'posterPath', c.poster_path,
        'genre', c.genre, 'runtimeMinutes', c.runtime_minutes,
        'availableOn', c.available_on, 'reason', c.reason, 'slot', c.slot,
        'youVoted', exists (select 1 from public.court_votes v
                            where v.room_id = v_room.id and v.participant_id = p_participant
                              and v.candidate_key = c.candidate_key and v.round = 'main'),
        -- Tally is returned ONLY when this participant has already voted.
        'tally', case when exists (select 1 from public.court_votes v
                                   where v.room_id = v_room.id and v.participant_id = p_participant
                                     and v.candidate_key = c.candidate_key and v.round = 'main')
          then (select jsonb_object_agg(action, n) from (
                  select action, count(*) n from public.court_votes
                  where room_id = v_room.id and candidate_key = c.candidate_key and round = 'main'
                  group by action) t)
          else null end,
        'votedBy', coalesce((select jsonb_agg(v.participant_id) from public.court_votes v
                             where v.room_id = v_room.id and v.candidate_key = c.candidate_key
                               and v.round = 'main'), '[]'::jsonb)
      ) order by c.slot)
      from public.court_candidates c where c.room_id = v_room.id and c.pool = 'active'
    ), '[]'::jsonb),
    'reserveCount', (select count(*) from public.court_candidates where room_id = v_room.id and pool = 'reserve'),
    'vetoTokensLeft', greatest(0,
      coalesce((select max(granted) from public.court_veto_tokens
                where room_id = v_room.id and participant_id = p_participant), 2)
      - (select count(*) from public.court_votes
         where room_id = v_room.id and participant_id = p_participant and action = 'veto'))
  ) into v_out;
  return v_out;
end; $$;

grant execute on function public.court_cast_vote(text, uuid, text, text) to anon, authenticated;
grant execute on function public.court_vote_state(text, uuid) to anon, authenticated;
