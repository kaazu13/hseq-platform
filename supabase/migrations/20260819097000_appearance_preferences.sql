-- Appearance/theme preference (Phase 18) — "persist preference per user if
-- architecture supports it cleanly." profiles.theme_mode/accent_theme are
-- freely self-editable (like full_name/phone) — deliberately NOT added to
-- validate_profile_update()'s account_status lockdown list from
-- 20260819096500, since these carry no security meaning.
create type public.theme_mode as enum ('light', 'dark', 'system');
create type public.accent_theme as enum ('default_blue', 'safety_green', 'steel_slate', 'orange', 'indigo_purple');

alter table public.profiles add column theme_mode public.theme_mode not null default 'system';
alter table public.profiles add column accent_theme public.accent_theme not null default 'default_blue';

comment on column public.profiles.theme_mode is 'Light/Dark/System (Phase 18) — a UI preference, not a security boundary.';
comment on column public.profiles.accent_theme is 'One of 5 fixed accent themes (Phase 18) — never arbitrary hex input in V1, enforced by this enum.';
