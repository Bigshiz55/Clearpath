-- Synthetic catalog for PERFORMANCE and FUNNEL verification.
--
-- This is deliberately not real TMDB data (the sandbox has no key). It is sized
-- and shaped like the real thing — genre/keyword/cast cardinality, franchise
-- clustering, availability spread, missing-metadata holes — so that stage
-- counts and query plans are meaningful. Every number the report quotes comes
-- from running the real SQL against this, not from an estimate.
--
-- Usage:  psql -v n=5000 -f seed-catalog.sql

\set n :n

truncate public.reco_explanations, public.reco_candidates, public.reco_sessions cascade;
truncate public.title_relationships, public.title_availability, public.title_embeddings,
         public.title_embedding_jobs, public.title_features cascade;
truncate public.catalog_titles cascade;

-- Vocabulary large enough that overlap is realistic rather than degenerate.
create temp table vocab_genre(g text);
insert into vocab_genre values
 ('action'),('adventure'),('animation'),('comedy'),('crime'),('documentary'),
 ('drama'),('family'),('fantasy'),('history'),('horror'),('music'),('mystery'),
 ('romance'),('science_fiction'),('thriller'),('war'),('western');

create temp table vocab_kw(k text);
insert into vocab_kw
select 'kw_' || i from generate_series(1, 400) i;

create temp table vocab_person(p text);
insert into vocab_person
select 'person_' || i from generate_series(1, 1200) i;

-- ---------------------------------------------------------------- titles ----
insert into public.catalog_titles (
  id, media_type, title, alternate_titles, release_year, runtime_minutes,
  original_language, genres, keywords, director, cast_members, lead_performers,
  franchise, sequence_order, synopsis, critic_score, audience_score, popularity,
  vote_count, data_completeness, metadata_confidence, metadata_refreshed_at, active
)
select
  case when i % 4 = 0 then 'tv-' else 'movie-' end || i,
  case when i % 4 = 0 then 'tv' else 'movie' end,
  'Title ' || i || ' ' || (select g from vocab_genre offset (i % 18) limit 1),
  case when i % 7 = 0 then array['Alt Title ' || i] else '{}'::text[] end,
  1960 + (i % 66),
  -- A realistic runtime spread, with ~3% unknown so the "missing metadata"
  -- path is actually exercised.
  case when i % 33 = 0 then null else 70 + (i % 95) end,
  case when i % 11 = 0 then 'fr' when i % 17 = 0 then 'es' when i % 23 = 0 then 'ja' else 'en' end,
  -- 1–3 genres each.
  (select array_agg(g) from (select g from vocab_genre offset (i % 18) limit 1 + (i % 3)) s),
  (select array_agg(k) from (select k from vocab_kw offset (i % 380) limit 5) s),
  (select p from vocab_person offset (i % 1200) limit 1),
  (select array_agg(p) from (select p from vocab_person offset ((i * 7) % 1150) limit 6) s),
  (select array_agg(p) from (select p from vocab_person offset ((i * 7) % 1150) limit 2) s),
  -- ~20% belong to one of 150 franchises, so franchise capping has real work.
  case when i % 5 = 0 then 'franchise_' || (i % 150) else null end,
  case when i % 5 = 0 then 1 + (i % 4) else null end,
  'A ' || (select g from vocab_genre offset (i % 18) limit 1) ||
    ' story about ' || (select k from vocab_kw offset (i % 380) limit 1) ||
    ' and ' || (select k from vocab_kw offset ((i * 3) % 380) limit 1) ||
    '. Set in ' || (1900 + (i % 120))::text || '.',
  case when i % 13 = 0 then null else (40 + (i % 60))::numeric / 10 end,
  case when i % 19 = 0 then null else (45 + (i % 55))::numeric / 10 end,
  (10000 - i)::numeric / 10,
  case when i % 29 = 0 then 0 else 10 + (i % 9000) end,
  case when i % 33 = 0 then 0.55 else 0.90 end,
  case when i % 33 = 0 then 0.50 else 0.85 end,
  now() - ((i % 60) || ' days')::interval,
  i % 97 <> 0                                  -- ~1% inactive
from generate_series(1, :n) i;

-- -------------------------------------------------------------- features ----
insert into public.title_features (
  title_id, pacing, dialogue_density, action_intensity, suspense,
  horror_intensity, violence_intensity, gore_intensity, romance_intensity,
  sexual_content, humor, emotional_heaviness, complexity, accessibility,
  family_suitability, ending_tone, ending_satisfaction, visual_style,
  production_scale, mainstream_score, rewatchability, comfort_watch,
  conversation_after, female_lead, character_driven, mystery_structure,
  confidence, source, derivation, model_version
)
select t.id,
  ((i * 13) % 100) / 100.0, ((i * 17) % 100) / 100.0, ((i * 19) % 100) / 100.0,
  ((i * 23) % 100) / 100.0, ((i * 29) % 100) / 100.0, ((i * 31) % 100) / 100.0,
  ((i * 37) % 100) / 100.0, ((i * 41) % 100) / 100.0, ((i * 43) % 100) / 100.0,
  ((i * 47) % 100) / 100.0, ((i * 53) % 100) / 100.0, ((i * 59) % 100) / 100.0,
  ((i * 61) % 100) / 100.0, ((i * 67) % 100) / 100.0, ((i * 71) % 100) / 100.0,
  ((i * 73) % 100) / 100.0, ((i * 79) % 100) / 100.0, ((i * 83) % 100) / 100.0,
  ((i * 89) % 100) / 100.0, ((i * 97) % 100) / 100.0, ((i * 101) % 100) / 100.0,
  ((i * 103) % 100) / 100.0,
  (i % 3 = 0), (i % 4 = 0), (i % 5 = 0),
  0.75, 'synthetic', 'seed_script', 'seed-1'
from public.catalog_titles t
join generate_series(1, :n) i on t.id = (case when i % 4 = 0 then 'tv-' else 'movie-' end || i)
-- ~8% of titles have NO feature row at all, so "unknown" is a real state.
where i % 12 <> 0;

-- ------------------------------------------------------------ embeddings ----
-- 32-dim deterministic vectors. NOT semantic: they exist to measure the cost
-- and correctness of the vector path, never to claim semantic quality.
insert into public.title_embeddings (title_id, view_name, embedding, dims, model, embedding_version, input_hash)
select t.id, v.view_name,
  (select array_agg((sin(i * 0.7 + d * 1.3 + v.salt) + 1)::real / 2) from generate_series(1, 32) d),
  32, 'synthetic-32d', 'embed-2026.07.1', md5(t.id || v.view_name)
from public.catalog_titles t
join generate_series(1, :n) i on t.id = (case when i % 4 = 0 then 'tv-' else 'movie-' end || i)
cross join (values ('semantic', 0.0), ('mood', 1.1), ('narrative', 2.2)) as v(view_name, salt);

-- ---------------------------------------------------------- availability ----
-- ~70% of titles are on at least one service; some rows are deliberately STALE
-- so the freshness gate is exercised rather than assumed.
insert into public.title_availability (title_id, region, provider, monetization, verified_at, confidence, source)
select t.id, 'US',
  (array['netflix','hulu','max','prime_video','disney_plus','apple_tv_plus'])[1 + (i % 6)],
  (array['flatrate','flatrate','flatrate','ads','rent'])[1 + (i % 5)],
  case when i % 9 = 0 then now() - interval '40 days' else now() - ((i % 10) || ' days')::interval end,
  case when i % 9 = 0 then 0.35 else 0.90 end,
  'synthetic'
from public.catalog_titles t
join generate_series(1, :n) i on t.id = (case when i % 4 = 0 then 'tv-' else 'movie-' end || i)
where i % 10 < 7;

-- A second provider for a third of them, so multi-service filters are real.
insert into public.title_availability (title_id, region, provider, monetization, verified_at, confidence, source)
select t.id, 'US',
  (array['netflix','hulu','max','prime_video','disney_plus','apple_tv_plus'])[1 + ((i + 3) % 6)],
  'flatrate', now() - interval '2 days', 0.9, 'synthetic'
from public.catalog_titles t
join generate_series(1, :n) i on t.id = (case when i % 4 = 0 then 'tv-' else 'movie-' end || i)
where i % 3 = 0
on conflict do nothing;

-- --------------------------------------------------------- relationships ----
-- Franchise siblings + a similarity graph, so the reference-title channel has
-- something real to traverse.
insert into public.title_relationships (title_id, related_id, kind, strength, source)
select a.id, b.id, 'same_franchise', 0.9, 'synthetic'
from public.catalog_titles a
join public.catalog_titles b on b.franchise = a.franchise and b.id <> a.id
where a.franchise is not null
on conflict do nothing;

insert into public.title_relationships (title_id, related_id, kind, strength, source)
select t.id, o.id, 'similar', (0.5 + ((i % 50) / 100.0))::real, 'synthetic'
from public.catalog_titles t
join generate_series(1, :n) i on t.id = (case when i % 4 = 0 then 'tv-' else 'movie-' end || i)
join lateral (
  select id from public.catalog_titles
   where id <> t.id and genres && t.genres
   order by popularity desc limit 40
) o on true
on conflict do nothing;

analyze public.catalog_titles;
analyze public.title_features;
analyze public.title_embeddings;
analyze public.title_availability;
analyze public.title_relationships;
