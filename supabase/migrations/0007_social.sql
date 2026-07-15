-- 0007_social.sql
-- A light social layer: follow people and see their recent verdicts — but only
-- for users who explicitly opt into sharing their activity. Private by default.

alter table public.profiles
  add column if not exists public_activity boolean not null default false;

create table if not exists public.follows (
  follower_id  uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);
create index if not exists idx_follows_following on public.follows(following_id);

alter table public.follows enable row level security;

drop policy if exists follows_select_own on public.follows;
create policy follows_select_own on public.follows
  for select using (follower_id = auth.uid());

drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows
  for insert with check (follower_id = auth.uid());

drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows
  for delete using (follower_id = auth.uid());

-- ---------------------------------------------------------------------
-- Public profile: identity always; recent verdicts + loves only when the
-- owner has opted into public activity. SECURITY DEFINER so it can read
-- another user's rows, gated in-function by public_activity.
-- ---------------------------------------------------------------------
drop function if exists public.get_public_profile(text);
create or replace function public.get_public_profile(uname text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  prof public.profiles;
  result jsonb;
begin
  select * into prof from public.profiles where username = lower(uname);
  if not found then
    return null;
  end if;

  result := jsonb_build_object(
    'user_id', prof.id,
    'username', prof.username,
    'display_name', prof.display_name,
    'personal_label', prof.personal_label,
    'public_activity', prof.public_activity,
    'is_self', prof.id = auth.uid(),
    'is_following', exists(
      select 1 from public.follows f
      where f.following_id = prof.id and f.follower_id = auth.uid()
    )
  );

  if prof.public_activity then
    result := result || jsonb_build_object(
      'verdicts', coalesce((
        select jsonb_agg(v order by v.created_at desc) from (
          select tmdb_id, media_type, title, year, poster_path,
                 personal_score, tier, created_at
          from public.verdicts
          where user_id = prof.id
          order by created_at desc
          limit 24
        ) v
      ), '[]'::jsonb),
      'loves', coalesce((
        select jsonb_agg(pr.trait) from public.preference_rules pr
        where pr.user_id = prof.id and pr.weight > 0
      ), '[]'::jsonb)
    );
  end if;

  return result;
end;
$$;
revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to authenticated;

-- ---------------------------------------------------------------------
-- Following feed: recent verdicts from people you follow who share activity.
-- ---------------------------------------------------------------------
drop function if exists public.get_following_feed();
create or replace function public.get_following_feed()
returns table (
  user_id        uuid,
  username       text,
  display_name   text,
  tmdb_id        bigint,
  media_type     text,
  title          text,
  year           integer,
  poster_path    text,
  personal_score integer,
  tier           text,
  created_at     timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name, v.tmdb_id, v.media_type, v.title,
         v.year, v.poster_path, v.personal_score, v.tier, v.created_at
  from public.follows f
  join public.profiles p on p.id = f.following_id
  join public.verdicts v on v.user_id = f.following_id
  where f.follower_id = auth.uid()
    and p.public_activity = true
  order by v.created_at desc
  limit 40;
$$;
revoke all on function public.get_following_feed() from public;
grant execute on function public.get_following_feed() to authenticated;
