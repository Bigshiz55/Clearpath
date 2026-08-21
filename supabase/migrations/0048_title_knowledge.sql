-- 0048_title_knowledge.sql
-- WATCHVERDICT KNOWLEDGE LAYER — durable compiled title intelligence.
--
-- The search pipeline re-derives the same stable facts on every request: is
-- boxing CENTRAL to this title, or only incidental? Today that costs a
-- deterministic evaluation plus, for the ambiguous band, a per-request LLM
-- adjudication — paid again for the same title on the next search. This table
-- lets the answer be compiled ONCE and read back deterministically.
--
-- Modeled on public.title_dimensions (migration 0017): a global, user-agnostic
-- content cache — world-readable, service-role writes only (no write policy).
-- It is NEVER user data and carries no PII, so it is not RLS-owner-scoped.
--
-- Two tables:
--   title_knowledge      — one header row per title (tone/setting, freshness,
--                          compiler version, evidence provenance).
--   title_subject_facts  — one row per (title, canonical subject) with a
--                          centrality verdict, confidence, provenance and a
--                          contradiction flag. This is the eligibility oracle
--                          the finder consults before spending an LLM call.
--
-- Idempotent: safe to run repeatedly. Governance: this file is REGISTERED, not
-- APPLIED — see docs/SCHEMA_DRIFT_0042.md and OWNER_INSTRUCTIONS.md. Applying
-- it is an owner action via `npm run migrate` or the gated /api/admin/migrate.

create table if not exists public.title_knowledge (
  tmdb_id          bigint      not null,
  media_type       text        not null check (media_type in ('movie', 'tv')),
  compiler_version text        not null,
  -- 'compiled'      the evidence pipeline ran and produced facts
  -- 'insufficient'  a title with too little evidence to assert anything
  -- 'unknown'       reserved: header exists but facts are unresolved
  status           text        not null default 'compiled'
                     check (status in ('compiled', 'insufficient', 'unknown')),
  tone             text[]      not null default '{}',
  setting          text[]      not null default '{}',
  -- Explicit anti-evidence ("not martial arts", "not supernatural") as a JSON
  -- array of {subject, reason}. Preserves what a title is provably NOT about.
  anti_evidence    jsonb       not null default '[]'::jsonb,
  -- Which evidence sources fed this compilation (metadata, keywords, overview,
  -- reviews, adjudicator) — provenance, never invented certainty.
  evidence_sources jsonb       not null default '[]'::jsonb,
  compiled_at      timestamptz not null default now(),
  primary key (tmdb_id, media_type)
);

create table if not exists public.title_subject_facts (
  tmdb_id          bigint      not null,
  media_type       text        not null check (media_type in ('movie', 'tv')),
  -- Canonical subject slug (e.g. 'boxing', 'submarine', 'courtroom-drama').
  subject          text        not null,
  -- CENTRAL   the subject fundamentally defines the work
  -- MATERIAL  a sustained, important component but not the whole story
  -- INCIDENTAL a setting/passing mention/former job — not what it is about
  -- ABSENT    evidence exists and it establishes the subject is NOT present
  -- UNKNOWN   insufficient evidence — preserved as uncertainty, never guessed
  centrality       text        not null
                     check (centrality in ('CENTRAL', 'MATERIAL', 'INCIDENTAL', 'ABSENT', 'UNKNOWN')),
  confidence       real        not null default 0
                     check (confidence >= 0 and confidence <= 1),
  -- How many INDEPENDENT evidence sources corroborated the verdict (title,
  -- keyword cluster, overview). A weak keyword-only fact never earns CENTRAL.
  source_count     int         not null default 0,
  -- True when independent sources contradict (e.g. deterministic says central,
  -- the semantic adjudicator says incidental) — confidence is lowered, not hidden.
  disputed         boolean     not null default false,
  evidence         jsonb       not null default '{}'::jsonb,
  decided_by       text        not null default 'deterministic'
                     check (decided_by in ('deterministic', 'adjudicator', 'metadata', 'manual')),
  compiler_version text        not null,
  compiled_at      timestamptz not null default now(),
  primary key (tmdb_id, media_type, subject)
);

-- Look up "which titles have CENTRAL boxing" and reverse lookups efficiently.
create index if not exists idx_title_subject_facts_subject
  on public.title_subject_facts (subject, centrality);

alter table public.title_knowledge enable row level security;
alter table public.title_subject_facts enable row level security;

-- World-readable content cache; writes are service-role only (no write policy),
-- exactly like public.title_dimensions. Guarded so the migration is idempotent.
do $$ begin
  create policy title_knowledge_read on public.title_knowledge for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy title_subject_facts_read on public.title_subject_facts for select using (true);
exception when duplicate_object then null; end $$;
