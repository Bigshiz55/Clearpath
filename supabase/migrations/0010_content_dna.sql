-- 0010_content_dna.sql
-- Aggregate post-watch interview answers into a privacy-safe Content DNA for a
-- title. SECURITY DEFINER so it can read across users, but it returns ONLY
-- anonymous counts — never individual answers or identities.

drop function if exists public.get_content_dna(text, bigint);
create or replace function public.get_content_dna(p_media_type text, p_tmdb_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  rec record;
  k text;
  v text;
  qkey text;
  counts jsonb := '{}'::jsonb;
  total int := 0;
begin
  for rec in
    select answers from public.title_feedback
    where media_type = p_media_type and tmdb_id = p_tmdb_id
  loop
    total := total + 1;
    for k, v in select key, value from jsonb_each_text(rec.answers)
    loop
      -- Collapse element:<trait> keys so prominence aggregates across titles.
      qkey := case when k like 'element:%' then 'element' else k end;
      if not (counts ? qkey) then
        counts := jsonb_set(counts, array[qkey], '{}'::jsonb, true);
      end if;
      counts := jsonb_set(
        counts,
        array[qkey, v],
        to_jsonb(coalesce((counts #>> array[qkey, v])::int, 0) + 1),
        true
      );
    end loop;
  end loop;
  return jsonb_build_object('responses', total, 'counts', counts);
end;
$$;
revoke all on function public.get_content_dna(text, bigint) from public;
grant execute on function public.get_content_dna(text, bigint) to authenticated;
