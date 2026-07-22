-- 0021_dimension_signals.sql
-- Targeted Taste-DNA nudges from pass reasons. Each row is a running weighted
-- accumulator for one (user, taste axis): wv_sum = Σ weight·target,
-- w_sum = Σ weight. The dimension-profile builder folds these in as extra
-- evidence, so a specific reason ("too dark", "supernatural") moves only its
-- axis — never the whole title's fingerprint. Kept separate from the learned
-- profile and from manual dial pins (dimension_overrides).

create table if not exists public.dimension_signals (
  user_id       uuid not null references auth.users(id) on delete cascade,
  dimension_key text not null,
  w_sum         real not null default 0,
  wv_sum        real not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (user_id, dimension_key)
);

alter table public.dimension_signals enable row level security;
drop policy if exists dimsignals_select_own on public.dimension_signals;
create policy dimsignals_select_own on public.dimension_signals for select using (user_id = auth.uid());
drop policy if exists dimsignals_insert_own on public.dimension_signals;
create policy dimsignals_insert_own on public.dimension_signals for insert with check (user_id = auth.uid());
drop policy if exists dimsignals_update_own on public.dimension_signals;
create policy dimsignals_update_own on public.dimension_signals for update using (user_id = auth.uid());
drop policy if exists dimsignals_delete_own on public.dimension_signals;
create policy dimsignals_delete_own on public.dimension_signals for delete using (user_id = auth.uid());
