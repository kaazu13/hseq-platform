-- Task 3 Part 8: automated company greetings (birthday, Christmas, New
-- Year, Easter). Two new tables: company_admin-configurable settings per
-- greeting type, and a dedup log so the same person is never greeted twice
-- for the same occasion in the same year even if the cron job is retried.
--
-- Privacy note (ties back to Part 7's "no broad visibility" for
-- birth_date): a birthday greeting is delivered ONLY to the birthday
-- person themselves as a private notification — it never announces to
-- coworkers that today is someone's birthday, and never reveals an age.
-- Christmas/New Year/Easter greetings go to every active employee in a
-- company that has that greeting enabled — no personal data involved.

create table public.company_greeting_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  greeting_type text not null check (greeting_type in ('birthday', 'christmas', 'new_year', 'easter')),
  enabled boolean not null default true,
  message_template text not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (company_id, greeting_type)
);

comment on table public.company_greeting_settings is
  'Per-company, per-greeting-type on/off + message template, configured by company_admin. message_template supports ONLY the strict placeholder allowlist substitute_greeting_placeholders() recognizes ({{first_name}}, {{last_name}}, {{company_name}}) — never eval''d, never treated as HTML/SQL, plain literal text substitution.';

create table public.sent_greetings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  greeting_type text not null check (greeting_type in ('birthday', 'christmas', 'new_year', 'easter')),
  occurrence_year integer not null,
  sent_at timestamptz not null default now(),
  unique (company_id, employee_id, greeting_type, occurrence_year)
);

comment on table public.sent_greetings is
  'Dedup log — the unique constraint is the actual guarantee that a cron run retried, or run twice in the same day, never double-sends the same person the same greeting for the same year.';

alter table public.company_greeting_settings enable row level security;
alter table public.company_greeting_settings force row level security;
alter table public.sent_greetings enable row level security;
alter table public.sent_greetings force row level security;

grant select, update, insert on public.company_greeting_settings to authenticated;
grant select on public.sent_greetings to authenticated;

create policy company_greeting_settings_select
  on public.company_greeting_settings
  for select
  to authenticated
  using (public.is_company_member(company_id));

create policy company_greeting_settings_manage
  on public.company_greeting_settings
  for all
  to authenticated
  using (public.has_company_role(company_id, 'company_admin'))
  with check (public.has_company_role(company_id, 'company_admin'));

create policy sent_greetings_select
  on public.sent_greetings
  for select
  to authenticated
  using (public.has_company_role(company_id, 'company_admin'));

comment on policy company_greeting_settings_select on public.company_greeting_settings is
  'Any company member may see which greetings are configured (matches every other company-scoped settings-style table''s read reach in this app) — only company_admin may change them.';

-- ── Strict placeholder allowlist substitution ──────────────────────────
create or replace function public.substitute_greeting_placeholders(template text, target_first_name text, target_last_name text, target_company_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select replace(replace(replace(template, '{{first_name}}', coalesce(target_first_name, '')), '{{last_name}}', coalesce(target_last_name, '')), '{{company_name}}', coalesce(target_company_name, ''));
$$;

comment on function public.substitute_greeting_placeholders(text, text, text, text) is
  'Plain literal string replacement ONLY for the three allowlisted tokens — never a templating engine, never eval, so a message_template can never inject anything beyond its own literal text plus these three values.';

-- ── The system-level send RPC — SECURITY DEFINER, service_role only ────
-- Called once daily by app/api/cron/greetings/route.ts (no signed-in user
-- context at all — a real cron invocation). target_due_fixed_types is
-- computed in TypeScript (lib/greetings.ts's getDueFixedGreetingTypes(),
-- including the Easter-Sunday calculation) and passed in rather than
-- reimplemented in SQL. 'birthday' is always evaluated in addition to
-- whatever's in target_due_fixed_types, since it's inherently a per-
-- employee, every-day check (does target_date match THIS employee's own
-- birth_date month/day), not a fixed calendar date.
create or replace function public.process_company_greetings(target_date date, target_due_fixed_types text[])
returns table (company_id uuid, employee_id uuid, greeting_type text, notification_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_occurrence_year integer := extract(year from target_date)::integer;
  v_setting record;
  v_employee record;
  v_notification_id uuid;
begin
  for v_setting in
    select cgs.company_id, cgs.greeting_type, cgs.message_template, c.name as company_name
    from public.company_greeting_settings cgs
    join public.companies c on c.id = cgs.company_id
    where cgs.enabled
      and (cgs.greeting_type = 'birthday' or cgs.greeting_type = any(target_due_fixed_types))
  loop
    for v_employee in
      select e.id, e.first_name, e.last_name, e.profile_id
      from public.employees e
      where e.company_id = v_setting.company_id
        and e.employment_status = 'active'
        and e.profile_id is not null
        and e.archived_at is null
        and (
          v_setting.greeting_type <> 'birthday'
          or (e.birth_date is not null and extract(month from e.birth_date) = extract(month from target_date) and extract(day from e.birth_date) = extract(day from target_date))
        )
        and not exists (
          select 1 from public.sent_greetings sg
          where sg.company_id = v_setting.company_id
            and sg.employee_id = e.id
            and sg.greeting_type = v_setting.greeting_type
            and sg.occurrence_year = v_occurrence_year
        )
    loop
      insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
      values (
        v_setting.company_id,
        v_employee.profile_id,
        'company_greeting_' || v_setting.greeting_type,
        case v_setting.greeting_type
          when 'birthday' then 'Happy Birthday!'
          when 'christmas' then 'Merry Christmas!'
          when 'new_year' then 'Happy New Year!'
          else 'Happy Easter!'
        end,
        public.substitute_greeting_placeholders(v_setting.message_template, v_employee.first_name, v_employee.last_name, v_setting.company_name),
        '/dashboard'
      )
      returning id into v_notification_id;

      insert into public.sent_greetings (company_id, employee_id, greeting_type, occurrence_year)
      values (v_setting.company_id, v_employee.id, v_setting.greeting_type, v_occurrence_year);

      company_id := v_setting.company_id;
      employee_id := v_employee.id;
      greeting_type := v_setting.greeting_type;
      notification_id := v_notification_id;
      return next;
    end loop;
  end loop;
end;
$$;

comment on function public.process_company_greetings(date, text[]) is
  'Sends every DUE greeting (birthday matches by month/day against target_date; christmas/new_year/easter are due when their greeting_type appears in target_due_fixed_types, computed in TS) for every company that has that greeting_type enabled, to every active linked employee — birthday ONLY to that one employee (private, never broadcast, never reveals age), the calendar greetings to every active employee in that company. Deduplicated via sent_greetings''s unique constraint. SECURITY DEFINER: called with no signed-in user context (a real cron run), so it cannot rely on any auth.uid()-based RLS at all — it IS the authorization boundary.';

revoke all on function public.process_company_greetings(date, text[]) from public, anon, authenticated;
grant execute on function public.process_company_greetings(date, text[]) to service_role;

-- ── Default rows so a company_admin always has something to toggle,
-- instead of a separate "create the setting first" step ────────────────
create or replace function public.seed_default_greeting_settings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.company_greeting_settings (company_id, greeting_type, enabled, message_template)
  values
    (new.id, 'birthday', false, 'Happy Birthday, {{first_name}}! Wishing you a great day from everyone at {{company_name}}.'),
    (new.id, 'christmas', false, 'Merry Christmas from {{company_name}}! Wishing you and your loved ones a safe and happy holiday.'),
    (new.id, 'new_year', false, 'Happy New Year from {{company_name}}! Thank you for everything you do — here''s to a safe year ahead.'),
    (new.id, 'easter', false, 'Happy Easter from {{company_name}}! Enjoy the long weekend.');
  return new;
end;
$$;

comment on function public.seed_default_greeting_settings() is
  'Gives every new company a default (disabled) row for all 4 greeting types, so company_admin only ever needs to enable + optionally customize, never create from scratch.';

create trigger companies_seed_greeting_settings
  after insert on public.companies
  for each row execute function public.seed_default_greeting_settings();

-- Backfill existing companies the same way, one-time.
insert into public.company_greeting_settings (company_id, greeting_type, enabled, message_template)
select c.id, t.greeting_type, false, t.message_template
from public.companies c
cross join (
  values
    ('birthday', 'Happy Birthday, {{first_name}}! Wishing you a great day from everyone at {{company_name}}.'),
    ('christmas', 'Merry Christmas from {{company_name}}! Wishing you and your loved ones a safe and happy holiday.'),
    ('new_year', 'Happy New Year from {{company_name}}! Thank you for everything you do — here''s to a safe year ahead.'),
    ('easter', 'Happy Easter from {{company_name}}! Enjoy the long weekend.')
) as t(greeting_type, message_template)
on conflict (company_id, greeting_type) do nothing;
