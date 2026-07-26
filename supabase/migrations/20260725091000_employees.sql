-- employees — company employment records. See docs/DATABASE_SCHEMA.md.
--
-- Supersedes the `employee_profiles` design proposed in an earlier
-- revision of that document (renamed table, `position_title` replaces
-- `job_title`/`trade`, `account_status` is new, `supervisor_id` and
-- emergency-contact fields are deferred — not part of this milestone's
-- explicit field list). See the implementation report for the full diff.
--
-- Product-direction note: this table represents EMPLOYEES ONLY. There is
-- deliberately no generic "person"/"contact" concept and no
-- visitor/contractor/agency-worker/external-company distinction — see
-- docs/PRODUCT_REQUIREMENTS.md. `employment_type` (full_time/part_time/
-- contractor/temporary), proposed in the same earlier revision, is
-- dropped for the same reason: this milestone has no contractor concept.

create type public.employment_status as enum ('active', 'inactive', 'on_leave', 'terminated');

create type public.employee_account_status as enum (
  'draft',
  'invited',
  'pending_activation',
  'active',
  'suspended',
  'archived'
);

comment on type public.employment_status is
  'Whether the person is currently working for the organization — independent of `employee_account_status`, which is about platform access, not employment.';
comment on type public.employee_account_status is
  'Platform-access lifecycle for an employee record. `draft` = created with no login account (the only state this milestone''s create flow produces). Invitation/activation flows that would move a record through invited/pending_activation/active are NOT implemented yet — see the implementation report.';

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Nullable by design: an employee record can exist, and be fully usable,
  -- with no linked login identity at all. See docs/ARCHITECTURE.md §3.4
  -- (Cross-Reference Validation Rule) — if this is ever set by a future
  -- activation flow, that flow must validate the referenced profile has an
  -- ACTIVE organization_memberships row for this same organization_id;
  -- nothing in this migration enforces that automatically, because no
  -- application code sets this column yet (see the implementation report).
  profile_id uuid references public.profiles (id) on delete set null,
  employee_number text,
  first_name text not null,
  last_name text not null,
  work_email text,
  phone text,
  position_title text,
  employment_status public.employment_status not null,
  account_status public.employee_account_status not null default 'draft',
  birth_date date,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint employees_first_name_not_blank check (btrim(first_name) <> ''),
  constraint employees_last_name_not_blank check (btrim(last_name) <> ''),
  constraint employees_work_email_lowercase check (work_email = lower(work_email)),
  constraint employees_end_after_start check (
    end_date is null or start_date is null or end_date >= start_date
  )
);

comment on table public.employees is
  'Company employment records. NOT the same thing as profiles (login identity) or organization_memberships (tenant access) — an employee row may have no profile_id at all. See docs/PRODUCT_REQUIREMENTS.md and docs/ARCHITECTURE.md §3.2 for how these relate.';
comment on column public.employees.profile_id is
  'Nullable — set only once/if this employee is linked to a platform login account. No application code sets this yet (no invitation/activation flow in this milestone).';
comment on column public.employees.account_status is
  'Always ''draft'' from this milestone''s create flow. Never permanently deleted through the application — see the `archived`/`archived_at` deletion-behavior note below.';
comment on column public.employees.archived_at is
  'Set together with account_status = ''archived''. The row is never deleted — see docs/DATABASE_SCHEMA.md''s Deletion Behavior Summary.';

-- employee_number is unique per organization, but only when present — an
-- org may have any number of employees with no number assigned, and the
-- SAME number is perfectly fine reused across two different organizations
-- (this is a partial index scoped by organization_id, not a global unique
-- constraint on employee_number alone).
create unique index employees_org_employee_number_key
  on public.employees (organization_id, employee_number)
  where employee_number is not null;

-- At most one employee record per (organization, linked profile) — a
-- person should not be able to correspond to two different employee rows
-- in the same tenant.
create unique index employees_org_profile_key
  on public.employees (organization_id, profile_id)
  where profile_id is not null;

create index employees_org_account_status_idx
  on public.employees (organization_id, account_status);
create index employees_org_employment_status_idx
  on public.employees (organization_id, employment_status);
create index employees_org_name_idx
  on public.employees (organization_id, last_name, first_name);
create index employees_profile_id_idx
  on public.employees (profile_id);

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();
