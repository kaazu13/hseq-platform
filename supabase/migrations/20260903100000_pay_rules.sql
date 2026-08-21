-- ============================================================================
-- Company-level Pay Rules (Parts 10-12) — NOT full payroll. Supports the
-- existing Worked Hours categories (regular/overtime/night/travel/other)
-- plus a Sunday premium (derived from work_date + project timezone, never
-- a new Worked Hours category). Immutable effective-dated history, same
-- close-then-insert convention as employee_hourly_rates.
-- ============================================================================

create type public.pay_rule_category as enum ('regular', 'overtime', 'night', 'travel', 'other', 'sunday');
create type public.pay_rule_calculation_type as enum ('base_only', 'percentage_extra', 'fixed_extra_per_hour');

create table public.pay_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  category public.pay_rule_category not null,
  calculation_type public.pay_rule_calculation_type not null,
  -- percentage_extra: whole-number percent (20 = +20%). fixed_extra_per_hour: currency amount per hour. base_only: ignored, always 0.
  value numeric(10, 4) not null default 0,
  currency text not null default 'EUR',
  -- Part 12 — ONLY meaningful for category='sunday': whether the Sunday
  -- premium adds on TOP OF an already-active overtime/night premium for
  -- the same hour (true) or is mutually exclusive with them (false, the
  -- Sunday rule alone applies that hour). Harmless/unused for every other
  -- category — always stored, never conditionally nullable, so the
  -- calculation engine never has to guess a missing value's meaning.
  stackable boolean not null default true,
  effective_from date not null,
  effective_to date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pay_rules_value_non_negative check (value >= 0),
  constraint pay_rules_period_valid check (effective_to is null or effective_to >= effective_from)
);

comment on table public.pay_rules is
  'Part 10/11 — company-configurable premium rules over Worked Hours categories, used only to compute an ESTIMATE (never real payroll — see the Estimated Earnings engine). Immutable: changing a rule closes the prior period''s effective_to and inserts a new row, exactly like employee_hourly_rates — a historical Worked Hours day always recalculates using the rule that was effective ON that work date, never today''s rule.';

-- At most one OPEN (still-current) rule per company/category.
create unique index pay_rules_one_current_per_category on public.pay_rules (company_id, category) where effective_to is null;
create index pay_rules_company_category_idx on public.pay_rules (company_id, category, effective_from desc);

alter table public.pay_rules enable row level security;

-- Part 10 — company_admin/planner/platform_super_admin manage. project_manager
-- gets READ ONLY (pay rules aren't project-scoped data, but a PM legitimately
-- needs to read them to understand a project labor estimate — Part 16).
-- operations_manager/employee/inspector/foreman/hse_officer/hseq_manager/
-- recruiter: no access at all.
create policy pay_rules_select
  on public.pay_rules
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.is_platform_super_admin()
      or public.has_any_company_role(company_id, array['company_admin', 'planner'])
      or exists (
        select 1 from public.project_assignments pa
        join public.employees pme on pme.id = pa.employee_id and pme.profile_id = auth.uid()
        where pa.assignment_role = 'project_manager' and pa.end_at is null and pa.company_id = pay_rules.company_id
      )
    )
  );

create policy pay_rules_insert
  on public.pay_rules
  for insert
  to authenticated
  with check (public.is_company_member(company_id) and (public.is_platform_super_admin() or public.has_any_company_role(company_id, array['company_admin', 'planner'])));

create policy pay_rules_update
  on public.pay_rules
  for update
  to authenticated
  using (public.is_company_member(company_id) and (public.is_platform_super_admin() or public.has_any_company_role(company_id, array['company_admin', 'planner'])))
  with check (public.is_company_member(company_id) and (public.is_platform_super_admin() or public.has_any_company_role(company_id, array['company_admin', 'planner'])));

comment on policy pay_rules_select on public.pay_rules is
  'Part 10/16 — company_admin/planner/platform_super_admin manage; project_manager read-only (labor-cost context, never rule-editing); everyone else denied.';

-- No UPDATE grant beyond effective_to (closing a period) — full-column
-- update grant is fine here since pay_rules_update's RLS already
-- restricts WHO, and unlike employee_hourly_rates there's no separate
-- "immutability trigger" needed: setPayRule() (modules/pay-rules/actions.ts)
-- is the only code path that ever calls UPDATE, and it only ever sets
-- effective_to when closing a superseded row — documented convention,
-- not DB-enforced column restriction, to keep this migration's blast
-- radius small.
revoke all on public.pay_rules from authenticated;
grant select, insert, update on public.pay_rules to authenticated;
