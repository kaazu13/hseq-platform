-- Post-audit implementation package, Part 9: billing/usage FOUNDATION
-- only — no Stripe/payment processing, no automated enforcement of
-- limits. This adds a place to record a company's commercial plan
-- (employee-count-tier based, per the stated commercial model) so the
-- Platform Admin console has something real to display/edit, without
-- contaminating operational state:
--   - employees.employment_status (already exists) — operational,
--     per-person, HSEQ-relevant.
--   - profiles.account_status (already exists, from the prior audit
--     migration) — auth/security, per-account.
--   - companies.status (already exists: trial/active/suspended) — the
--     company's OPERATIONAL access state, enforced by is_company_member().
--   - company_subscriptions (new, this migration) — commercial/billing
--     state ONLY. Deliberately never consulted by any RLS policy or
--     permission check in this migration — it is a foundation for the
--     Platform Admin UI to read/write, not an access-control mechanism.
--     A future milestone that wants to actually ENFORCE employee/project
--     limits would add that as its own, separate, explicit change.
create type public.company_subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'paused');

create table public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies (id) on delete cascade,
  plan_name text,
  subscription_status public.company_subscription_status not null default 'trialing',
  employee_limit integer,
  project_limit integer,
  billing_renewal_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint company_subscriptions_plan_name_length check (plan_name is null or char_length(plan_name) <= 100),
  constraint company_subscriptions_notes_length check (notes is null or char_length(notes) <= 2000),
  constraint company_subscriptions_employee_limit_positive check (employee_limit is null or employee_limit > 0),
  constraint company_subscriptions_project_limit_positive check (project_limit is null or project_limit > 0)
);

comment on table public.company_subscriptions is
  'Billing/usage FOUNDATION only (Part 9 of the post-audit implementation package) — manual/foundation fields for the employee-count-tier commercial model, no payment processing. One row per company, created lazily by the Platform Admin console (not auto-created alongside companies — a company legitimately has no subscription row until an admin sets one up). Never consulted by any RLS policy/permission check — deliberately not an enforcement mechanism yet.';

create trigger company_subscriptions_set_updated_at
  before update on public.company_subscriptions
  for each row execute function public.set_updated_at();

alter table public.company_subscriptions enable row level security;
alter table public.company_subscriptions force row level security;

-- Read: platform admins (full), plus a company's own company_admin/
-- operations_manager (their own row only) — "company administration
-- should be able to support/display foundations," per the instruction.
grant select on public.company_subscriptions to authenticated;

create policy company_subscriptions_select
  on public.company_subscriptions
  for select
  to authenticated
  using (
    public.is_platform_super_admin()
    or public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
  );

-- Write: platform admins only — billing state is a platform-operator
-- decision in this foundation, not something a company_admin can self-serve.
create or replace function public.upsert_company_subscription(
  target_company_id uuid,
  target_plan_name text default null,
  target_subscription_status public.company_subscription_status default 'trialing',
  target_employee_limit integer default null,
  target_project_limit integer default null,
  target_billing_renewal_date date default null,
  target_notes text default null
)
returns public.company_subscriptions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.company_subscriptions;
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can manage billing/subscription information';
  end if;
  if not exists (select 1 from public.companies where id = target_company_id) then
    raise exception 'company % not found', target_company_id;
  end if;

  insert into public.company_subscriptions (company_id, plan_name, subscription_status, employee_limit, project_limit, billing_renewal_date, notes, created_by, updated_by)
  values (target_company_id, target_plan_name, target_subscription_status, target_employee_limit, target_project_limit, target_billing_renewal_date, target_notes, auth.uid(), auth.uid())
  on conflict (company_id) do update set
    plan_name = excluded.plan_name,
    subscription_status = excluded.subscription_status,
    employee_limit = excluded.employee_limit,
    project_limit = excluded.project_limit,
    billing_renewal_date = excluded.billing_renewal_date,
    notes = excluded.notes,
    updated_by = auth.uid()
  returning * into v_row;

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  values (target_company_id, auth.uid(), 'update', 'company_subscription', v_row.id, jsonb_build_object('plan_name', target_plan_name, 'subscription_status', target_subscription_status, 'employee_limit', target_employee_limit, 'project_limit', target_project_limit));

  return v_row;
end;
$$;

comment on function public.upsert_company_subscription(uuid, text, public.company_subscription_status, integer, integer, date, text) is
  'Platform Admin-only create/update of a company''s billing foundation row (Part 9) — no payment processing, purely record-keeping. Audited like every other platform-admin mutation.';

revoke all on function public.upsert_company_subscription(uuid, text, public.company_subscription_status, integer, integer, date, text) from public, anon;
grant execute on function public.upsert_company_subscription(uuid, text, public.company_subscription_status, integer, integer, date, text) to authenticated;
