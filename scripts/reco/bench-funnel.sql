-- FUNNEL BENCHMARK — runs the REAL channel functions and the REAL hard filter
-- against the seeded catalog, and reports the count at every stage plus the
-- per-stage wall time. Every figure in the report comes from this script.
--
-- Usage: psql -v runs=5 -f bench-funnel.sql

\timing off
\set QUIET on

create temp table if not exists bench(stage text, n int, ms numeric);
truncate bench;

do $$
declare
  t0 timestamptz; t1 timestamptz;
  qvec real[];
  n_sem int; n_ft int; n_meta int; n_ref int; n_qual int; n_disc int;
  n_pool int; n_elig int;
  ref_id text;
  runs int := 5;
  r int;
  best_ms numeric;
begin
  -- A query vector in the same 32-d space as the seeded embeddings.
  select array_agg((sin(d * 0.91) + 1)::real / 2) into qvec from generate_series(1, 32) d;
  select id into ref_id from public.catalog_titles where franchise is not null limit 1;

  -- ============ STAGE 1: broad retrieval, channel by channel ============
  -- Each channel is capped by its allocation; none may fill the pool alone.

  best_ms := null;
  for r in 1..runs loop
    t0 := clock_timestamp();
    create temp table if not exists ch_sem as select * from public.reco_channel_semantic('semantic', qvec, 'any', 1500);
    t1 := clock_timestamp();
    if best_ms is null or extract(milliseconds from (t1 - t0)) < best_ms then
      best_ms := extract(epoch from (t1 - t0)) * 1000;
    end if;
    if r < runs then drop table ch_sem; end if;
  end loop;
  select count(*) into n_sem from ch_sem;
  insert into bench values ('channel:semantic', n_sem, best_ms);

  t0 := clock_timestamp();
  create temp table ch_ft as select * from public.reco_channel_fulltext('story about', 'any', 800);
  t1 := clock_timestamp();
  select count(*) into n_ft from ch_ft;
  insert into bench values ('channel:fullText', n_ft, extract(epoch from (t1 - t0)) * 1000);

  t0 := clock_timestamp();
  create temp table ch_meta as select * from public.reco_channel_metadata(
    array['thriller','mystery','science_fiction','drama','comedy'],
    array(select p from (select 'person_' || i as p from generate_series(1, 40) i) s),
    array(select k from (select 'kw_' || i as k from generate_series(1, 60) i) s),
    'any', 400);
  t1 := clock_timestamp();
  select count(*) into n_meta from ch_meta;
  insert into bench values ('channel:metadata', n_meta, extract(epoch from (t1 - t0)) * 1000);

  t0 := clock_timestamp();
  create temp table ch_ref as select * from public.reco_channel_reference(ref_id, 'any', 600);
  t1 := clock_timestamp();
  select count(*) into n_ref from ch_ref;
  insert into bench values ('channel:referenceTitle', n_ref, extract(epoch from (t1 - t0)) * 1000);

  t0 := clock_timestamp();
  create temp table ch_qual as select * from public.reco_channel_quality('any', 300);
  t1 := clock_timestamp();
  select count(*) into n_qual from ch_qual;
  insert into bench values ('channel:qualityFallback', n_qual, extract(epoch from (t1 - t0)) * 1000);

  t0 := clock_timestamp();
  create temp table ch_disc as select * from public.reco_channel_discovery('any', 300);
  t1 := clock_timestamp();
  select count(*) into n_disc from ch_disc;
  insert into bench values ('channel:discovery', n_disc, extract(epoch from (t1 - t0)) * 1000);

  -- ============ MERGE + DEDUPLICATE, keeping every reason ============
  t0 := clock_timestamp();
  create temp table pool as
  select title_id,
         jsonb_agg(jsonb_build_object('channel', channel, 'rank', rank, 'score', score)) as channels,
         count(*) as channel_count,
         max(score) as best_score
    from (
      select title_id, 'semantic'         as channel, rank, score from ch_sem
      union all select title_id, 'fullText',          rank, score from ch_ft
      union all select title_id, 'metadata',          rank, score from ch_meta
      union all select title_id, 'referenceTitle',    rank, score from ch_ref
      union all select title_id, 'qualityFallback',   rank, score from ch_qual
      union all select title_id, 'discovery',         rank, score from ch_disc
    ) all_ch
   group by title_id;
  t1 := clock_timestamp();
  select count(*) into n_pool from pool;
  insert into bench values ('STAGE1:pool(dedup)', n_pool, extract(epoch from (t1 - t0)) * 1000);

  -- ============ STAGE 2: hard filters ============
  t0 := clock_timestamp();
  create temp table elig as
  select f.title_id, f.kept, f.reason
    from public.reco_apply_hard_filters(
      array(select title_id from pool),
      'movie',                                   -- content type
      120,                                       -- max runtime
      null, null,                                -- year bounds
      array['netflix','hulu','max'],             -- services
      array['flatrate']::text[],                 -- subscription only
      'US',
      array['en']::text[],                       -- language
      array[]::text[],                           -- explicit exclusions
      interval '14 days'                         -- staleness gate
    ) f;
  t1 := clock_timestamp();
  select count(*) into n_elig from elig where kept;
  insert into bench values ('STAGE2:eligible', n_elig, extract(epoch from (t1 - t0)) * 1000);

  -- Removal reasons, so a small pool can always be explained.
  insert into bench
  select 'removed:' || coalesce(reason, 'other'), count(*)::int, 0
    from elig where not kept group by reason;
end $$;

\set QUIET off
select stage, n, round(ms, 1) as ms from bench order by
  case when stage like 'channel:%' then 1 when stage like 'STAGE%' then 2 else 3 end, n desc;
