-- 20260819092000's `create or replace function set_daily_attendance_status(...)`
-- added a 6th parameter (target_reason) with a default, which Postgres
-- treats as a NEW overload rather than a replacement of the original
-- 5-arg signature from 20260812090000 (overload resolution is keyed on
-- the full parameter list, not just the function name) — confirmed live:
-- any 5-positional-argument call became ambiguous between the two
-- overloads ("is not unique"). Drop the now-superseded 5-arg original;
-- the 6-arg version (target_reason defaulting to null) is a strict
-- superset of its behavior for every existing caller.
drop function if exists public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text);

grant execute on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text) to authenticated;
