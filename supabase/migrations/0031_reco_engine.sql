-- WatchVerd1ct — HYBRID RECOMMENDATION ENGINE.
--
-- The existing engine seeds ~6 titles from TMDB and scores ~18 candidates. A
-- 2,500–5,000 candidate funnel cannot be built on a paged, rate-limited API, so
-- the first requirement is a LOCAL CATALOG the database can actually filter and
-- rank. That is what this migration creates, plus the per-session audit trail
-- that makes every stage of the funnel explainable after the fact.
--
-- Split by trust boundary:
--   * catalog_titles / title_features / title_embeddings / title_availability
--     are PUBLIC content metadata — readable by anyone, written by the service
--     role only.
--   * reco_sessions and its children are PRIVATE — owned by a user, RLS'd, and
--     never readable by another user.
--
-- Vector storage is portable on purpose. Supabase ships pgvector; a plain
-- Postgres may not. The embedding column is `real[]` with an exact cosine
-- function so the engine runs anywhere, and a pgvector column + ANN index is
-- added ONLY when the extension is present. Nothing silently degrades: the
-- chosen path is recorded in `title_embeddings.index_kind`.
--
-- Idempotent — safe to re-run.

create extension if not exists pg_trgm;

/**
 * Immutable text[] → text. Needed because BOTH `array_to_string` and the
 * array→text cast are only STABLE, and a generated column may not use either.
 * `unnest` + `string_agg` are immutable, so this is safe to index on.
 */
create or replace function public.reco_join(arr text[])
returns text language sql immutable parallel safe as $$
  select coalesce(string_agg(x, ' '), '') from unnest(coalesce(arr, '{}')) x;
$$;

-- ===========================================================================
-- CATALOG — public content metadata
-- ===========================================================================

create table if not exists public.catalog_titles (
  id             text primary key,                 -- canonical: 'movie-603'
  media_type     text not null check (media_type in ('movie','tv')),
  external_ids   jsonb not null default '{}'::jsonb,
  title          text not null,
  alternate_titles text[] not null default '{}',
  release_year   int,
  release_date   date,
  runtime_minutes int,
  status         text,
  origin_country text[] not null default '{}',
  original_language text,
  audio_languages   text[] not null default '{}',
  subtitle_languages text[] not null default '{}',
  content_rating text,
  genres         text[] not null default '{}',
  subgenres      text[] not null default '{}',
  keywords       text[] not null default '{}',
  themes         text[] not null default '{}',
  director       text,
  writers        text[] not null default '{}',
  lead_performers text[] not null default '{}',
  cast_members   text[] not null default '{}',
  production_companies text[] not null default '{}',
  franchise      text,
  sequence_order int,
  synopsis       text,
  short_overview text,
  critic_score   numeric(4,1),
  audience_score numeric(4,1),
  popularity     numeric(10,3),
  vote_count     int not null default 0,
  awards         jsonb not null default '{}'::jsonb,
  -- Honesty fields: never convert "unknown" into "false".
  data_completeness numeric(3,2) not null default 0,
  metadata_confidence numeric(3,2) not null default 0,
  metadata_refreshed_at timestamptz,
  active         boolean not null default true,
  -- Generated once so full-text search does not recompute per query.
  search_doc     tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, public.reco_join(alternate_titles)), 'A') ||
    setweight(to_tsvector('english'::regconfig, public.reco_join(genres)), 'B') ||
    setweight(to_tsvector('english'::regconfig, public.reco_join(keywords)), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(synopsis, '')), 'C')
  ) stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

/**
 * Experience traits, kept in their own table because they are DERIVED and each
 * one needs its own provenance. A 0..1 value with no confidence is a guess
 * wearing a number's clothes.
 */
create table if not exists public.title_features (
  title_id       text primary key references public.catalog_titles(id) on delete cascade,
  -- 0..1 intensities. NULL means unknown — never 0.
  pacing         real, dialogue_density real, action_intensity real,
  suspense       real, horror_intensity real, violence_intensity real,
  gore_intensity real, romance_intensity real, sexual_content real,
  humor          real, emotional_heaviness real, complexity real,
  accessibility  real, family_suitability real,
  ending_tone    real,           -- 0 = bleak, 1 = uplifting
  ending_satisfaction real,
  visual_style   real, production_scale real,
  mainstream_score real,         -- 0 = obscure, 1 = mainstream
  rewatchability real, comfort_watch real, conversation_after real,
  -- Boolean-ish narrative traits, nullable so "unknown" survives.
  female_lead    boolean, ensemble_cast boolean, family_centered boolean,
  relationship_centered boolean, workplace_centered boolean,
  coming_of_age  boolean, antihero boolean, mystery_structure boolean,
  survival_story boolean, character_driven boolean, plot_driven boolean,
  -- Provenance for the whole row plus per-field detail.
  confidence     numeric(3,2) not null default 0,
  source         text not null default 'unknown',
  derivation     text not null default 'unknown',
  model_version  text,
  field_provenance jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);

/**
 * Multi-view embeddings. One row per (title, view), so a mood query can search
 * the mood space instead of drowning it in plot summary.
 */
create table if not exists public.title_embeddings (
  title_id       text not null references public.catalog_titles(id) on delete cascade,
  view_name      text not null check (view_name in
                   ('semantic','mood','narrative','content','audience','reference')),
  embedding      real[] not null,
  dims           int not null,
  model          text not null,
  embedding_version text not null,
  -- Regeneration is skipped when this matches: the canonical input is unchanged.
  input_hash     text not null,
  index_kind     text not null default 'exact',
  generated_at   timestamptz not null default now(),
  primary key (title_id, view_name)
);

create table if not exists public.title_embedding_jobs (
  id             bigserial primary key,
  title_id       text not null references public.catalog_titles(id) on delete cascade,
  view_name      text not null,
  state          text not null default 'pending' check (state in ('pending','running','done','failed')),
  attempts       int not null default 0,
  last_error     text,
  requested_version text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.title_availability (
  title_id       text not null references public.catalog_titles(id) on delete cascade,
  region         text not null,
  provider       text not null,
  monetization   text not null check (monetization in ('flatrate','free','ads','rent','buy')),
  -- Availability decays: a claim is only as good as its last check.
  verified_at    timestamptz not null default now(),
  expires_at     timestamptz,
  confidence     numeric(3,2) not null default 0.5,
  source         text not null default 'unknown',
  primary key (title_id, region, provider, monetization)
);

create table if not exists public.title_relationships (
  title_id       text not null references public.catalog_titles(id) on delete cascade,
  related_id     text not null references public.catalog_titles(id) on delete cascade,
  kind           text not null check (kind in ('sequel','prequel','spinoff','remake','same_franchise','similar')),
  strength       real not null default 0.5,
  source         text not null default 'unknown',
  primary key (title_id, related_id, kind)
);

-- ===========================================================================
-- SESSION AUDIT TRAIL — private
-- ===========================================================================

create table if not exists public.reco_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid,
  court_code     text,
  raw_request    text,
  parsed_request jsonb not null default '{}'::jsonb,
  request_fingerprint text,
  parser_version text, model_version text, ranking_version text, embedding_version text,
  parser_confidence numeric(3,2),
  validation_ok  boolean not null default true,
  used_fallback  boolean not null default false,
  -- Stage counters: the funnel's own receipts.
  stage_counts   jsonb not null default '{}'::jsonb,
  channel_counts jsonb not null default '{}'::jsonb,
  filter_removals jsonb not null default '{}'::jsonb,
  timings_ms     jsonb not null default '{}'::jsonb,
  cache_hit      boolean not null default false,
  limiting_constraint text,
  engine_mode    text not null default 'hybrid',
  created_at     timestamptz not null default now()
);

create table if not exists public.reco_candidates (
  session_id     uuid not null references public.reco_sessions(id) on delete cascade,
  title_id       text not null,
  -- Why it entered: one row may carry several channels.
  retrieval_channels jsonb not null default '[]'::jsonb,
  fast_score     real,
  deep_score     real,
  group_score    real,
  member_scores  jsonb not null default '{}'::jsonb,
  filtered_out   boolean not null default false,
  filter_reason  text,
  stage_reached  text not null default 'retrieved',
  diversity_contribution real,
  final_rank     int,
  role           text check (role in ('active','reserve')),
  primary key (session_id, title_id)
);

create table if not exists public.reco_explanations (
  session_id     uuid not null references public.reco_sessions(id) on delete cascade,
  title_id       text not null,
  claim          text not null,
  source_field   text not null,
  value          text,
  confidence     numeric(3,2) not null default 0,
  supported      boolean not null default false,
  primary key (session_id, title_id, claim)
);

create table if not exists public.ranking_configurations (
  version        text primary key,
  config         jsonb not null,
  active         boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ===========================================================================
-- INDEXES — sized for a 5,000+ row working catalog
-- ===========================================================================

create index if not exists idx_catalog_active_type    on public.catalog_titles(media_type, active) where active;
create index if not exists idx_catalog_year           on public.catalog_titles(release_year);
create index if not exists idx_catalog_runtime        on public.catalog_titles(runtime_minutes);
create index if not exists idx_catalog_popularity     on public.catalog_titles(popularity desc);
create index if not exists idx_catalog_genres         on public.catalog_titles using gin(genres);
create index if not exists idx_catalog_keywords       on public.catalog_titles using gin(keywords);
create index if not exists idx_catalog_cast           on public.catalog_titles using gin(cast_members);
create index if not exists idx_catalog_search         on public.catalog_titles using gin(search_doc);
create index if not exists idx_catalog_title_trgm     on public.catalog_titles using gin(title gin_trgm_ops);
create index if not exists idx_catalog_franchise      on public.catalog_titles(franchise) where franchise is not null;
-- The hot path: eligible titles of a type, best first.
create index if not exists idx_catalog_type_pop       on public.catalog_titles(media_type, popularity desc) where active;

create index if not exists idx_avail_lookup           on public.title_availability(title_id, region);
create index if not exists idx_avail_provider         on public.title_availability(region, provider, monetization);
create index if not exists idx_features_mainstream    on public.title_features(mainstream_score);
create index if not exists idx_rel_title              on public.title_relationships(title_id, kind);
create index if not exists idx_emb_view               on public.title_embeddings(view_name, embedding_version);
create index if not exists idx_jobs_pending           on public.title_embedding_jobs(state, created_at) where state = 'pending';
create index if not exists idx_sessions_user          on public.reco_sessions(user_id, created_at desc);
create index if not exists idx_sessions_fingerprint   on public.reco_sessions(request_fingerprint, created_at desc);
create index if not exists idx_candidates_session     on public.reco_candidates(session_id, final_rank);

-- pgvector, only where it exists. The engine works without it; when present we
-- add a real vector column plus an ANN index and record that on the row.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'vector') then
    execute 'create extension if not exists vector';
    execute 'alter table public.title_embeddings add column if not exists embedding_v vector(1536)';
    execute 'create index if not exists idx_emb_ann on public.title_embeddings using hnsw (embedding_v vector_cosine_ops)';
    execute $u$update public.title_embeddings set index_kind = 'hnsw' where index_kind = 'exact'$u$;
  end if;
exception when others then
  -- Never fail the migration over an optional accelerator.
  raise notice 'pgvector unavailable (%); using exact cosine over real[]', sqlerrm;
end $$;

-- ===========================================================================
-- ROW-LEVEL SECURITY
-- ===========================================================================

alter table public.catalog_titles       enable row level security;
alter table public.title_features       enable row level security;
alter table public.title_embeddings     enable row level security;
alter table public.title_embedding_jobs enable row level security;
alter table public.title_availability   enable row level security;
alter table public.title_relationships  enable row level security;
alter table public.reco_sessions        enable row level security;
alter table public.reco_candidates      enable row level security;
alter table public.reco_explanations    enable row level security;
alter table public.ranking_configurations enable row level security;

-- Public catalog: readable by everyone, written by the service role only
-- (no write policy is defined, so no client can insert or update).
do $$
declare t text;
begin
  foreach t in array array['catalog_titles','title_features','title_availability','title_relationships']
  loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (true)', t, t);
  end loop;
end $$;

-- Embeddings and jobs are NOT public: raw vectors are a derived asset and the
-- job queue is operational. Service role only, so no policy at all.

-- Private session data: strictly the owning user.
drop policy if exists reco_sessions_own on public.reco_sessions;
create policy reco_sessions_own on public.reco_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists reco_candidates_own on public.reco_candidates;
create policy reco_candidates_own on public.reco_candidates
  for all using (exists (
    select 1 from public.reco_sessions s where s.id = session_id and s.user_id = auth.uid()
  ));

drop policy if exists reco_explanations_own on public.reco_explanations;
create policy reco_explanations_own on public.reco_explanations
  for all using (exists (
    select 1 from public.reco_sessions s where s.id = session_id and s.user_id = auth.uid()
  ));

drop policy if exists ranking_configurations_read on public.ranking_configurations;
create policy ranking_configurations_read on public.ranking_configurations for select using (true);

-- ===========================================================================
-- RETRIEVAL — exact cosine over real[], portable across deployments
-- ===========================================================================

create or replace function public.reco_cosine(a real[], b real[])
returns real
language plpgsql immutable strict parallel safe as $$
declare dot double precision := 0; na double precision := 0; nb double precision := 0; i int;
begin
  if array_length(a,1) is distinct from array_length(b,1) then return 0; end if;
  for i in 1..array_length(a,1) loop
    dot := dot + (a[i]::double precision * b[i]::double precision);
    na  := na + (a[i]::double precision * a[i]::double precision);
    nb  := nb + (b[i]::double precision * b[i]::double precision);
  end loop;
  if na = 0 or nb = 0 then return 0; end if;
  return (dot / (sqrt(na) * sqrt(nb)))::real;
end; $$;

/**
 * CHANNEL: semantic. Nearest titles in one embedding view.
 * `p_limit` is capped by the caller's channel allocation, never unbounded.
 */
create or replace function public.reco_channel_semantic(
  p_view text, p_query real[], p_media_type text, p_limit int
)
returns table(title_id text, score real, rank int)
language sql stable parallel safe as $$
  select e.title_id,
         public.reco_cosine(e.embedding, p_query) as score,
         (row_number() over (order by public.reco_cosine(e.embedding, p_query) desc))::int as rank
    from public.title_embeddings e
    join public.catalog_titles t on t.id = e.title_id
   where e.view_name = p_view
     and t.active
     and (p_media_type = 'any' or t.media_type = p_media_type)
   order by score desc
   limit greatest(0, p_limit);
$$;

/** CHANNEL: full text. Weighted tsvector relevance. */
create or replace function public.reco_channel_fulltext(
  p_query text, p_media_type text, p_limit int
)
returns table(title_id text, score real, rank int)
language sql stable parallel safe as $$
  select t.id,
         ts_rank(t.search_doc, websearch_to_tsquery('english', p_query))::real as score,
         (row_number() over (order by ts_rank(t.search_doc, websearch_to_tsquery('english', p_query)) desc))::int as rank
    from public.catalog_titles t
   where t.active
     and (p_media_type = 'any' or t.media_type = p_media_type)
     and t.search_doc @@ websearch_to_tsquery('english', p_query)
   order by score desc
   limit greatest(0, p_limit);
$$;

/** CHANNEL: metadata — genre / cast / director / keyword overlap. */
create or replace function public.reco_channel_metadata(
  p_genres text[], p_people text[], p_keywords text[], p_media_type text, p_limit int
)
returns table(title_id text, score real, rank int)
language sql stable parallel safe as $$
  with scored as (
    -- Postgres has no text[] intersection operator (`&` is intarray, int[]
    -- only), so overlap is counted explicitly.
    select t.id,
           ((select count(*) from unnest(t.genres) g where g = any(p_genres)) * 1.0
          + (select count(*) from unnest(t.keywords) k where k = any(p_keywords)) * 0.6
          + case when t.director = any(p_people) then 2.0 else 0 end
          + (select count(*) from unnest(t.cast_members) c where c = any(p_people)) * 1.5)::real as score
      from public.catalog_titles t
     where t.active
       and (p_media_type = 'any' or t.media_type = p_media_type)
       and (t.genres && p_genres or t.keywords && p_keywords
            or t.cast_members && p_people or t.director = any(p_people))
  )
  select id, score, (row_number() over (order by score desc))::int
    from scored order by score desc limit greatest(0, p_limit);
$$;

/** CHANNEL: reference title — stored relationships plus franchise siblings. */
create or replace function public.reco_channel_reference(
  p_reference_id text, p_media_type text, p_limit int
)
returns table(title_id text, score real, rank int)
language sql stable parallel safe as $$
  with rel as (
    select r.related_id as id, r.strength as score
      from public.title_relationships r
     where r.title_id = p_reference_id
  )
  select t.id, rel.score, (row_number() over (order by rel.score desc))::int
    from rel join public.catalog_titles t on t.id = rel.id
   where t.active and (p_media_type = 'any' or t.media_type = p_media_type)
   order by rel.score desc limit greatest(0, p_limit);
$$;

/** CHANNEL: quality/popularity fallback. Never the whole pool — always capped. */
create or replace function public.reco_channel_quality(
  p_media_type text, p_limit int
)
returns table(title_id text, score real, rank int)
language sql stable parallel safe as $$
  select t.id,
         ((coalesce(t.audience_score, 0) / 10.0) * 0.6
        + least(1.0, coalesce(t.vote_count, 0) / 5000.0) * 0.4)::real as score,
         (row_number() over (order by t.popularity desc nulls last))::int
    from public.catalog_titles t
   where t.active
     and (p_media_type = 'any' or t.media_type = p_media_type)
     and t.vote_count > 0
   order by t.popularity desc nulls last
   limit greatest(0, p_limit);
$$;

/** CHANNEL: discovery — good but under-exposed, so the pool is not all blockbusters. */
create or replace function public.reco_channel_discovery(
  p_media_type text, p_limit int
)
returns table(title_id text, score real, rank int)
language sql stable parallel safe as $$
  select t.id,
         ((coalesce(t.audience_score, 0) / 10.0) * (1.0 - coalesce(f.mainstream_score, 0.5)))::real as score,
         (row_number() over (order by (coalesce(t.audience_score,0)/10.0) * (1.0 - coalesce(f.mainstream_score,0.5)) desc))::int
    from public.catalog_titles t
    left join public.title_features f on f.title_id = t.id
   where t.active
     and (p_media_type = 'any' or t.media_type = p_media_type)
     and coalesce(t.audience_score, 0) >= 6.5
   order by score desc
   limit greatest(0, p_limit);
$$;

/**
 * HARD FILTER — deterministic and auditable. Returns the surviving ids plus the
 * reason each rejection happened, so "why is my pool small?" has a real answer.
 * Availability uses `verified_at`: a stale claim is reported, never asserted.
 */
create or replace function public.reco_apply_hard_filters(
  p_ids text[],
  p_media_type text,
  p_max_runtime int,
  p_min_year int,
  p_max_year int,
  p_services text[],
  p_monetization text[],
  p_region text,
  p_languages text[],
  p_exclude_ids text[],
  p_stale_after interval default interval '14 days'
)
returns table(title_id text, kept boolean, reason text)
language sql stable as $$
  select t.id,
         (t.active
          and (p_media_type = 'any' or t.media_type = p_media_type)
          and (p_max_runtime is null or t.runtime_minutes is null or t.runtime_minutes <= p_max_runtime)
          and (p_min_year is null or t.release_year is null or t.release_year >= p_min_year)
          and (p_max_year is null or t.release_year is null or t.release_year <= p_max_year)
          and (cardinality(p_languages) = 0 or t.original_language = any(p_languages))
          and not (t.id = any(p_exclude_ids))
          and (cardinality(p_services) = 0 or exists (
                select 1 from public.title_availability a
                 where a.title_id = t.id and a.region = p_region
                   and a.provider = any(p_services)
                   and (cardinality(p_monetization) = 0 or a.monetization = any(p_monetization))
                   and a.verified_at > now() - p_stale_after
              ))
         ) as kept,
         case
           when not t.active then 'inactive'
           when not (p_media_type = 'any' or t.media_type = p_media_type) then 'content_type'
           when p_max_runtime is not null and t.runtime_minutes is not null and t.runtime_minutes > p_max_runtime then 'runtime'
           when p_min_year is not null and t.release_year is not null and t.release_year < p_min_year then 'release_year'
           when p_max_year is not null and t.release_year is not null and t.release_year > p_max_year then 'release_year'
           when cardinality(p_languages) > 0 and not (t.original_language = any(p_languages)) then 'language'
           when t.id = any(p_exclude_ids) then 'excluded'
           when cardinality(p_services) > 0 and not exists (
                select 1 from public.title_availability a
                 where a.title_id = t.id and a.region = p_region
                   and a.provider = any(p_services)
                   and (cardinality(p_monetization) = 0 or a.monetization = any(p_monetization))
                   and a.verified_at > now() - p_stale_after
              ) then 'availability'
           else null
         end as reason
    from public.catalog_titles t
   where t.id = any(p_ids);
$$;

grant execute on function public.reco_cosine(real[], real[]) to anon, authenticated;
grant execute on function public.reco_channel_semantic(text, real[], text, int) to anon, authenticated;
grant execute on function public.reco_channel_fulltext(text, text, int) to anon, authenticated;
grant execute on function public.reco_channel_metadata(text[], text[], text[], text, int) to anon, authenticated;
grant execute on function public.reco_channel_reference(text, text, int) to anon, authenticated;
grant execute on function public.reco_channel_quality(text, int) to anon, authenticated;
grant execute on function public.reco_channel_discovery(text, int) to anon, authenticated;
grant execute on function public.reco_apply_hard_filters(text[], text, int, int, int, text[], text[], text, text[], text[], interval) to anon, authenticated;
