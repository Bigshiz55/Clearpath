-- WatchVerdict — Pro entitlements. Processor-agnostic: a row here means the
-- user has Pro. A payment processor (Stripe/Lemon Squeezy/…) writes it via the
-- service role from its webhook; the app only ever READS it. Until a processor
-- is wired, Pro can be granted manually (admin) — the gate is fully functional.

create table if not exists public.entitlements (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  pro                 boolean not null default false,
  source              text,                          -- 'stripe' | 'manual' | 'promo' | …
  current_period_end  timestamptz,                   -- when the current paid period lapses (null = no expiry)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists entitlements_updated_at on public.entitlements;
create trigger entitlements_updated_at
  before update on public.entitlements
  for each row execute function public.set_updated_at();

alter table public.entitlements enable row level security;

-- Users may READ their own entitlement (so the client can reflect Pro state).
-- Writes are service-role only (processor webhook / admin) — no write policy.
drop policy if exists entitlements_select_own on public.entitlements;
create policy entitlements_select_own on public.entitlements
  for select using (auth.uid() = user_id);
