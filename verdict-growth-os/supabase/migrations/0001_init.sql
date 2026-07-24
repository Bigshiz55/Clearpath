-- ═══════════════════════════════════════════════════════════════════════════
-- Verdict Growth OS — initial schema (v1)
--
-- Persistence target for the next phase. v1 runs on the in-memory store
-- (src/lib/store.ts) whose shapes mirror these tables 1:1, so switching to
-- Supabase is a repository swap behind the same functions.
--
-- Conventions:
--   • Every table has created_at (and updated_at where mutated).
--   • Collected facts carry provenance: source, source_url, product,
--     collected_at, confidence, is_demo.
--   • RLS is ENABLED on every table. Policies below are the PLANNED model;
--     service-role (server-only) bypasses RLS for the OS's own jobs.
--   • enums keep the domain honest and match src/lib/types.ts.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────────────────
create type product_id           as enum ('watchverdict', 'readverdict');
create type product_scope        as enum ('watchverdict', 'readverdict', 'shared');
create type lifecycle_stage       as enum ('pre_launch','launched','early_traction','growth','scale');
create type department            as enum ('growth','marketing','advertising','pr','partnerships','research','analytics','product','engineering','customer_success','revenue');
create type observation_kind      as enum ('metric_change','incident','community_signal','competitive_signal','cost_signal','revenue_signal');
create type direction             as enum ('up','down','flat');
create type opportunity_type      as enum ('community_conversation','social_trend','creator','journalist_media','podcast','newsletter','seo','partnership','competitive_weakness','seasonal_campaign','complaint_pattern','product_led_growth');
create type intent_level          as enum ('high','medium','low');
create type effort_level          as enum ('xs','s','m','l','xl');
create type risk_level            as enum ('low','medium','high');
create type approval_state        as enum ('not_required','pending','approved','rejected');
create type approval_action_type  as enum ('public_social_post','paid_campaign','budget_increase','influencer_outreach','journalist_outreach','partnership_outreach','customer_email','pricing_change','production_deployment','major_experiment','data_deletion','policy_sensitive');
create type approval_decision     as enum ('pending','approved','rejected','executed','failed');
create type reversibility_level   as enum ('reversible','partial','irreversible');
create type recommendation_status as enum ('proposed','queued','in_progress','done','dismissed');
create type campaign_status       as enum ('draft','in_review','approved','rejected','revision','archived');
create type funnel_step_key       as enum ('impression','click','landing_visit','signup','dna_started','dna_completed','first_verdict','successful_recommendation','return_visit','referral','subscription');
create type experiment_status     as enum ('designing','running','concluded');
create type deploy_environment    as enum ('production','preview');
create type deploy_status         as enum ('success','failed','building');
create type incident_severity     as enum ('sev1','sev2','sev3');
create type incident_status       as enum ('open','mitigated','resolved');
create type feedback_kind         as enum ('bug','feature_request','complaint','praise');
create type job_run_status        as enum ('running','succeeded','failed','skipped_duplicate','aborted_cost','aborted_stopped');
create type app_role              as enum ('owner','operator','viewer');

-- ── Reusable provenance columns (inlined per table; documented once here) ─────
-- source text, source_url text, product product_scope, collected_at timestamptz,
-- confidence numeric(4,3) check (confidence between 0 and 1), is_demo boolean.

-- ── Org / identity ───────────────────────────────────────────────────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  name app_role not null unique,
  description text
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  role app_role not null,
  resource text not null,
  can_read boolean not null default true,
  can_write boolean not null default false,
  can_approve boolean not null default false,
  unique (role, resource)
);

-- ── Product registry ─────────────────────────────────────────────────────────
create table products (
  id product_id primary key,
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  production_url text not null,
  repository text not null,
  deployment_provider text not null,
  analytics_source text not null,
  database_source text not null,
  lifecycle_stage lifecycle_stage not null,
  revenue_model text not null,
  primary_activation_event text not null,
  primary_retention_event text not null,
  core_funnel funnel_step_key[] not null,
  daily_llm_usd_ceiling numeric(10,2) not null default 5,
  daily_job_run_ceiling integer not null default 500,
  max_ai_cost_per_active_user_usd numeric(10,4) not null default 0.05,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_goals (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  metric text not null,
  target numeric not null,
  current numeric not null default 0,
  unit text not null,
  due_by timestamptz,
  created_at timestamptz not null default now()
);
create index on product_goals (product);

-- ── Integrations & data sources ──────────────────────────────────────────────
create table integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null,                       -- analytics | github | billing | social | llm
  mode text not null default 'mock',        -- mock | live
  scopes text[] not null default '{}',
  last_synced_at timestamptz,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table data_sources (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid references integrations(id) on delete set null,
  product product_scope not null,
  name text not null,
  retention_days integer not null default 365,
  created_at timestamptz not null default now()
);

-- ── Observe → Normalize → Analyze ────────────────────────────────────────────
create table observations (
  id uuid primary key default gen_random_uuid(),
  product product_scope not null,
  kind observation_kind not null,
  metric text not null,
  summary text not null,
  direction direction not null,
  change_pct numeric,
  severity integer not null check (severity between 0 and 100),
  -- provenance
  source text not null,
  source_url text,
  collected_at timestamptz not null default now(),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index on observations (product, created_at desc);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  type opportunity_type not null,
  title text not null,
  audience text not null,
  intent intent_level not null,
  estimated_reach integer not null default 0,
  competitive_density numeric(4,3) not null check (competitive_density between 0 and 1),
  recommended_channel text not null,
  suggested_response text not null,
  expected_outcome text not null,
  effort effort_level not null,
  risk risk_level not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  approval_state approval_state not null default 'not_required',
  outcome text,
  discovered_at timestamptz not null default now(),
  -- provenance
  source text not null,
  source_url text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index on opportunities (product, discovered_at desc);

create table recommendations (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  department department not null,
  problem text not null,
  evidence text[] not null default '{}',
  recommended_action text not null,
  effort effort_level not null,
  expected_impact integer not null check (expected_impact between 0 and 100),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  metric_affected text not null,
  owner text not null,
  approval_required boolean not null default false,
  status recommendation_status not null default 'proposed',
  deadline timestamptz,
  source_opportunity_id uuid references opportunities(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on recommendations (product, status);

-- ── Actions & approvals ──────────────────────────────────────────────────────
create table actions (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  recommendation_id uuid references recommendations(id) on delete set null,
  action_type text not null,
  status text not null default 'proposed',
  adapter text,                              -- which adapter would execute it
  executed_at timestamptz,
  result text,
  created_at timestamptz not null default now()
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  action_id uuid references actions(id) on delete set null,
  action_type approval_action_type not null,
  proposed_action text not null,
  evidence text[] not null default '{}',
  expected_impact text not null,
  risk risk_level not null,
  cost_usd numeric(12,2) not null default 0,
  reversibility reversibility_level not null,
  generated_content text,
  requested_approver text not null,
  decision approval_decision not null default 'pending',
  decision_reason text,
  execution_result text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on approvals (decision, created_at desc);

-- ── Campaigns ────────────────────────────────────────────────────────────────
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  objective text not null,
  audience text,
  problem_statement text,
  positioning text,
  offer text,
  channel text,
  creative_concept text,
  hook text,
  script text,
  caption text,
  thumbnail_text text,
  landing_copy text,
  email_copy text,
  pr_pitch text,
  creator_outreach text,
  reddit_response text,
  variants text[] not null default '{}',
  tracking_id text,
  budget_usd numeric(12,2) not null default 0,
  status campaign_status not null default 'draft',
  approval_state approval_state not null default 'not_required',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table campaign_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  kind text not null,                        -- hook | script | caption | ...
  content text not null,
  variant_key text,
  created_at timestamptz not null default now()
);

create table audiences (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  name text not null,
  description text,
  estimated_size integer,
  created_at timestamptz not null default now()
);

-- ── Funnels, metrics, experiments ────────────────────────────────────────────
create table funnels (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  name text not null,
  steps funnel_step_key[] not null,
  created_at timestamptz not null default now()
);

create table funnel_steps (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  date date not null,
  step funnel_step_key not null,
  count integer not null default 0,
  -- provenance
  source text not null,
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  is_demo boolean not null default false,
  unique (product, date, step)
);
create index on funnel_steps (product, date);

create table metric_definitions (
  id uuid primary key default gen_random_uuid(),
  product product_scope not null,
  key text not null,
  label text not null,
  unit text not null,
  higher_is_better boolean not null default true,
  unique (product, key)
);

create table metric_values (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references metric_definitions(id) on delete cascade,
  date date not null,
  value numeric not null,
  source text not null,
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  is_demo boolean not null default false,
  unique (metric_id, date)
);

create table experiments (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  hypothesis text not null,
  funnel_step funnel_step_key not null,
  guardrail_metric text not null,
  status experiment_status not null default 'designing',
  decision text,
  created_at timestamptz not null default now()
);

create table experiment_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id) on delete cascade,
  key text not null,
  label text not null,
  exposures integer not null default 0,
  conversions integer not null default 0,
  unique (experiment_id, key)
);

-- ── Engineering ──────────────────────────────────────────────────────────────
create table repositories (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  full_name text not null,
  default_branch text not null default 'main',
  created_at timestamptz not null default now()
);

create table pull_requests (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  repository text not null,
  number integer not null,
  title text not null,
  state text not null,
  author text not null,
  updated_at timestamptz not null default now(),
  source text not null,
  is_demo boolean not null default false
);
create index on pull_requests (product, updated_at desc);

create table deployments (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  environment deploy_environment not null,
  status deploy_status not null,
  sha text not null,
  source text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index on deployments (product, created_at desc);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  title text not null,
  severity incident_severity not null,
  status incident_status not null default 'open',
  summary text,
  source text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index on incidents (product, status);

create table customer_feedback (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  kind feedback_kind not null,
  summary text not null,
  count integer not null default 1,
  source text not null,
  confidence numeric(4,3) not null default 0.7 check (confidence between 0 and 1),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Revenue & cost ───────────────────────────────────────────────────────────
create table plans (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  name text not null,
  price_usd_monthly numeric(10,2) not null default 0,
  trial_days integer not null default 0
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  plan_id uuid references plans(id) on delete set null,
  external_id text,                          -- Stripe-style id (mock in v1)
  status text not null default 'trialing',
  started_at timestamptz not null default now(),
  is_demo boolean not null default false
);

create table revenue_metrics (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  date date not null,
  mrr_usd numeric(12,2) not null default 0,
  arr_usd numeric(12,2) not null default 0,
  active_subscriptions integer not null default 0,
  trials integer not null default 0,
  trial_conversion_pct numeric(5,4) not null default 0,
  free_to_paid_pct numeric(5,4) not null default 0,
  churn_pct numeric(5,4) not null default 0,
  revenue_per_active_user_usd numeric(10,4) not null default 0,
  cac_usd numeric(10,2) not null default 0,
  ltv_usd numeric(10,2) not null default 0,
  source text not null,
  is_demo boolean not null default false,
  unique (product, date)
);

create table cost_metrics (
  id uuid primary key default gen_random_uuid(),
  product product_id not null references products(id) on delete cascade,
  date date not null,
  llm_cost_usd numeric(12,4) not null default 0,
  infra_cost_usd numeric(12,4) not null default 0,
  active_users integer not null default 0,
  source text not null,
  is_demo boolean not null default false,
  unique (product, date)
);

-- ── Jobs & audit ─────────────────────────────────────────────────────────────
create table scheduled_jobs (
  id text primary key,
  name text not null,
  cron text not null,
  cost_ceiling_usd numeric(10,2) not null default 5,
  enabled boolean not null default true,
  emergency_stop boolean not null default false,   -- manual kill switch
  created_at timestamptz not null default now()
);

create table job_runs (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references scheduled_jobs(id) on delete cascade,
  idempotency_key text not null,
  status job_run_status not null,
  cost_usd numeric(12,4) not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Duplicate prevention: a job may run a given key at most once.
  unique (job_id, idempotency_key)
);
create index on job_runs (job_id, started_at desc);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  product product_scope not null,
  metadata jsonb not null default '{}'
);
create index on audit_events (at desc);
create index on audit_events (entity_type, entity_id);

-- ── Row-Level Security (planned model) ───────────────────────────────────────
-- Enable RLS everywhere; the server (service-role) bypasses it for OS jobs.
-- Human access is mediated by the app using the `roles`/`permissions` tables.
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- Example read policy pattern (apply per table once auth is wired):
--   create policy "org members read" on observations
--     for select using (
--       exists (select 1 from users u where u.id = auth.uid())
--     );
-- Writes are restricted to service-role in v1 (no anon/authenticated write
-- policies are created), so only the server can mutate growth data.
