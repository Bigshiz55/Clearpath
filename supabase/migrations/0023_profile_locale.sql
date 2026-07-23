-- 0023_profile_locale.sql
--
-- Additive, back-compatible language/locale preferences for signed-in users.
-- Keeps LANGUAGE separate from market REGION (which stays `profiles.region`) —
-- choosing a language never changes a user's streaming market. All columns are
-- nullable with app-level defaults, so existing rows and behaviour are
-- unchanged until a user explicitly picks a preference.
--
-- Until this is applied, the UI locale is carried by the `wv_locale` cookie
-- (works for guests too), so the feature functions without this migration; this
-- adds durable per-account persistence.
--
-- Safe to run multiple times.

alter table public.profiles
  add column if not exists ui_locale text,        -- e.g. 'es-419' (interface language)
  add column if not exists voice_locale text,     -- e.g. 'es-MX' (SpeechRecognition)
  add column if not exists content_language text, -- e.g. 'es' (TMDB titles/overviews)
  add column if not exists timezone text;         -- e.g. 'America/New_York' (TV schedule display)

comment on column public.profiles.ui_locale is 'Interface language (BCP-47), e.g. en-US / es-419 / zh-Hans. Separate from region.';
comment on column public.profiles.voice_locale is 'Preferred SpeechRecognition locale, e.g. en-US / es-US / es-MX / zh-CN.';
comment on column public.profiles.content_language is 'Preferred TMDB metadata language (base), e.g. en / es / zh. Falls back to English.';
comment on column public.profiles.timezone is 'IANA timezone for schedule display, e.g. America/New_York.';

-- RLS: profiles already has owner-only select/insert/update policies (0001);
-- these new columns inherit them. No new policy required.
