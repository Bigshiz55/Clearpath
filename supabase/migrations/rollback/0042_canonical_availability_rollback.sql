-- Rollback for 0042. Loses no data: source_type was never modified.
drop index if exists public.watchmode_availability_state_idx;
alter table public.watchmode_availability
  drop constraint if exists watchmode_availability_state_check;
alter table public.watchmode_availability
  drop column if exists availability_state,
  drop column if exists addon_name,
  drop column if exists service_name,
  drop column if exists source_key,
  drop column if exists source_url,
  drop column if exists retrieved_at,
  drop column if exists last_verified_at,
  drop column if exists confidence,
  drop column if exists evidence_trace,
  drop column if exists watch_link;
