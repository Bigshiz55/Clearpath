-- Rollback for 0048_title_knowledge.sql — drops the Knowledge Layer caches.
-- Safe: these are derived content caches (no user data), rebuildable by the
-- compiler. Never run against a database you have not chosen to roll back.
drop table if exists public.title_subject_facts;
drop table if exists public.title_knowledge;
