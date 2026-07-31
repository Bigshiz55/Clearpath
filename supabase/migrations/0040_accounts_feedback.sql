-- WatchVerdict — account-merge tracking table + in-app feedback reports.
--
-- account_merges: an append-only audit log of anonymous-session-to-account
-- merges/discards (see src/lib/actions/mergeAccount.ts). Not used for any
-- runtime decision — purely a record of what happened, in case a user
-- reports lost data and we need to see what was merged/discarded and when.
--
-- feedback_reports: in-app bug/feedback reports (NOT the same table as
-- `public.feedback` from 0001_init.sql, which is unrelated per-title taste
-- signal data — a different, distinctly-named table on purpose so this
-- never collides with it). Anyone can submit one (including a fully
-- anonymous visitor on a public page with no session at all — the
-- anonymous-session middleware only covers /app and /lite), so INSERT is
-- open. Reads are service-role only (same "no select policy = locked down"
-- pattern as outbound_clicks in 0015) — only the admin view (server-side,
-- service role) reads it.

create table if not exists public.account_merges (
  id             uuid primary key default gen_random_uuid(),
  anon_user_id   uuid not null,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  decision       text not null check (decision in ('auto_merged', 'merged', 'discarded')),
  anon_item_count   integer not null default 0,
  target_item_count integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists idx_account_merges_target on public.account_merges(target_user_id);

alter table public.account_merges enable row level security;
-- No policies: service-role (the merge server action, via createAdminClient)
-- is the only writer/reader.

create table if not exists public.feedback_reports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete set null,
  user_email       text,
  url              text not null,
  commit_sha       text,
  viewport_width   integer,
  viewport_height  integer,
  description      text not null check (char_length(description) between 1 and 4000),
  severity         text check (severity in ('low', 'medium', 'high')),
  created_at       timestamptz not null default now()
);

create index if not exists idx_feedback_reports_created on public.feedback_reports(created_at desc);

alter table public.feedback_reports enable row level security;

drop policy if exists feedback_reports_insert_anyone on public.feedback_reports;
create policy feedback_reports_insert_anyone on public.feedback_reports
  for insert
  with check (true);

-- No select policy: reads happen only via the admin view's service-role
-- client (src/app/admin/feedback/page.tsx), never anon/authenticated.

comment on table public.feedback_reports is
  'In-app bug/feedback reports. Open insert (any visitor); reads are service-role only, via the admin view. Distinct from public.feedback (per-title taste signal, 0001_init.sql).';
comment on table public.account_merges is
  'Audit log of anonymous-session-to-account merge decisions. Append-only, service-role only.';
