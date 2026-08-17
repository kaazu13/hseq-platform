-- Task 3 Part 21 — locale, a server-persisted PERSONAL preference on
-- profiles, matching theme_mode/accent_theme's exact established shape
-- (20260819097000_appearance_preferences.sql) rather than inventing a new
-- pattern: freely self-editable (profiles_update_own RLS is the real
-- backstop), never a security boundary, never company-scoped.
create type public.app_locale as enum ('en', 'es', 'sv', 'nb', 'ro', 'fr', 'nl', 'de', 'ru', 'lt', 'it');

alter table public.profiles add column locale public.app_locale not null default 'en';

comment on column public.profiles.locale is 'The user''s own UI language (Task 3 Part 21) — a personal preference, exactly like theme_mode/accent_theme; never a company-wide setting.';
