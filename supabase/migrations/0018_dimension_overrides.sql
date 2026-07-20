-- WatchVerdict — manual taste-dial corrections. A user can pin any content-DNA
-- axis to their own position and/or flag it as a hard "never recommend" limit,
-- overriding what the classifier learned from their ratings. Per-user data,
-- strictly RLS-scoped to the owner (mirrors every other user table).

create table if not exists public.dimension_overrides (
  user_id       uuid not null references auth.users(id) on delete cascade,
  dimension_key text not null,                       -- one of the 18 axis keys
  pref          smallint not null check (pref between 0 and 100),
  is_limit      boolean not null default false,      -- hard "never recommend" filter
  updated_at    timestamptz not null default now(),
  primary key (user_id, dimension_key)
);

alter table public.dimension_overrides enable row level security;

drop policy if exists dimension_overrides_select on public.dimension_overrides;
create policy dimension_overrides_select on public.dimension_overrides
  for select using (auth.uid() = user_id);

drop policy if exists dimension_overrides_insert on public.dimension_overrides;
create policy dimension_overrides_insert on public.dimension_overrides
  for insert with check (auth.uid() = user_id);

drop policy if exists dimension_overrides_update on public.dimension_overrides;
create policy dimension_overrides_update on public.dimension_overrides
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists dimension_overrides_delete on public.dimension_overrides;
create policy dimension_overrides_delete on public.dimension_overrides
  for delete using (auth.uid() = user_id);
