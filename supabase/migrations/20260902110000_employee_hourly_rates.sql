-- ============================================================================
-- Employee hourly pay-rate history (Part 17/18/40 of the operational UX
-- package) — private compensation data, immutable historical periods.
-- ============================================================================
-- Design mirrors every other "current + history, never overwritten"
-- pattern in this schema (leave_request_history, equipment_history):
-- changing the current rate closes the prior row's effective_to and
-- inserts a brand-new immutable row — never an UPDATE of hourly_rate on
-- an existing row once it has been superseded.

create table public.employee_hourly_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  hourly_rate numeric(10, 2) not null,
  currency text not null default 'EUR',
  effective_from date not null,
  effective_to date,
  changed_by uuid references public.profiles (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  constraint employee_hourly_rates_rate_positive check (hourly_rate >= 0),
  constraint employee_hourly_rates_currency_not_blank check (btrim(currency) <> ''),
  constraint employee_hourly_rates_period_valid check (effective_to is null or effective_to >= effective_from),
  constraint employee_hourly_rates_employee_fk foreign key (employee_id, company_id) references public.employees (id, company_id) on delete cascade
);

comment on table public.employee_hourly_rates is
  'Private compensation history — one row per effective period. Exactly one row per employee has effective_to IS NULL at a time (the current rate) — enforced by employee_hourly_rates_one_current_per_employee below. Never overwritten: changing the current rate closes the old row''s effective_to and inserts a new row (modules/rates/actions.ts). No DELETE grant — a mistaken rate change is a new corrective row, not an erasure.';

-- At most one OPEN (still-current) rate period per employee.
create unique index employee_hourly_rates_one_current_per_employee
  on public.employee_hourly_rates (employee_id)
  where effective_to is null;

create index employee_hourly_rates_employee_idx on public.employee_hourly_rates (employee_id, effective_from desc);
create index employee_hourly_rates_company_idx on public.employee_hourly_rates (company_id);

alter table public.employee_hourly_rates enable row level security;

-- Part 18/40 — Employee: own only. platform_super_admin: global. company_admin: company. planner: company (per Part 18's explicit inclusion). Project Manager/Operations Manager/Foreman/Inspector/HSE/Recruiter: NO access — deliberately excluded, this is compensation data, not workforce data.
create policy employee_hourly_rates_select
  on public.employee_hourly_rates
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.is_platform_super_admin()
      or public.has_any_company_role(company_id, array['company_admin', 'planner'])
      or exists (select 1 from public.employees e where e.id = employee_hourly_rates.employee_id and e.profile_id = auth.uid())
    )
  );

create policy employee_hourly_rates_insert
  on public.employee_hourly_rates
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (public.is_platform_super_admin() or public.has_any_company_role(company_id, array['company_admin', 'planner']))
  );

-- No UPDATE/DELETE grant at all — a rate row, once inserted, is immutable
-- (matches the "never overwritten" design). Closing the prior current
-- row's effective_to happens via a narrow, explicit UPDATE grant below,
-- restricted to that single column, so the historical rate/currency/
-- reason/changed_by values can never be altered after the fact.
revoke all on public.employee_hourly_rates from authenticated;
grant select, insert on public.employee_hourly_rates to authenticated;
grant update (effective_to) on public.employee_hourly_rates to authenticated;

create or replace function public.validate_employee_hourly_rate_close()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.employee_id is distinct from old.employee_id
    or new.hourly_rate is distinct from old.hourly_rate
    or new.currency is distinct from old.currency
    or new.effective_from is distinct from old.effective_from
    or new.changed_by is distinct from old.changed_by
    or new.reason is distinct from old.reason then
    raise exception 'only effective_to may be changed on an employee hourly rate row';
  end if;
  if old.effective_to is not null then
    raise exception 'this rate period is already closed';
  end if;
  if new.effective_to is not null and new.effective_to < old.effective_from then
    raise exception 'effective_to cannot precede effective_from';
  end if;
  return new;
end;
$$;

create trigger employee_hourly_rates_validate_close
  before update on public.employee_hourly_rates
  for each row execute function public.validate_employee_hourly_rate_close();

comment on policy employee_hourly_rates_select on public.employee_hourly_rates is
  'Part 18: Employee sees own rate/history only. platform_super_admin global, company_admin + planner company-wide. Project Manager/Operations Manager explicitly get NOTHING here even though they manage projects/workforce elsewhere — compensation is not workforce data.';
