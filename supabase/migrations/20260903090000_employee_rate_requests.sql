-- ============================================================================
-- Rate/salary review request workflow (Parts 5-9 of the workforce-
-- completion package)
-- ============================================================================
-- Deliberately does NOT touch employee_hourly_rates directly on submit —
-- a request is its own record; only an explicit approval creates a new
-- rate-history row (via the SAME close-then-insert logic
-- setEmployeeHourlyRate() already uses, called from the approval action).
-- ============================================================================

create type public.employee_rate_request_status as enum ('pending', 'approved', 'rejected', 'withdrawn');

create table public.employee_rate_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  current_rate_at_request numeric(10, 2),
  requested_rate numeric(10, 2),
  currency text not null default 'EUR',
  reason text,
  status public.employee_rate_request_status not null default 'pending',
  submitted_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decision_reason text,
  approved_rate numeric(10, 2),
  effective_from date,
  resulting_rate_id uuid references public.employee_hourly_rates (id) on delete set null,
  constraint employee_rate_requests_requested_rate_non_negative check (requested_rate is null or requested_rate >= 0),
  constraint employee_rate_requests_approved_rate_non_negative check (approved_rate is null or approved_rate >= 0),
  constraint employee_rate_requests_employee_fk foreign key (employee_id, company_id) references public.employees (id, company_id) on delete cascade,
  constraint employee_rate_requests_decision_consistency check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status = 'withdrawn' and reviewed_by is null)
    or (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint employee_rate_requests_rejected_reason_required check (status <> 'rejected' or (decision_reason is not null and btrim(decision_reason) <> ''))
);

comment on table public.employee_rate_requests is
  'Part 5 — an employee''s request for a rate review. Submitting NEVER changes employee_hourly_rates directly; only an approval (approve_employee_rate_request()) does, by calling the same close-then-insert history logic and recording the new row in resulting_rate_id. Full history preserved — a request row is never deleted or overwritten after decision, matching employee_hourly_rates'' own immutability convention.';

create index employee_rate_requests_employee_idx on public.employee_rate_requests (employee_id, submitted_at desc);
create index employee_rate_requests_company_status_idx on public.employee_rate_requests (company_id, status);

alter table public.employee_rate_requests enable row level security;

-- Part 6 — employee sees/creates own only. Reviewers (company_admin/
-- planner/platform_super_admin) see/decide any in company scope.
-- project_manager gets READ-ONLY for requests belonging to employees in
-- THEIR OWN project(s) — resolved via project_assignments, never a
-- second, competing membership concept.
create policy employee_rate_requests_select
  on public.employee_rate_requests
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.is_platform_super_admin()
      or public.has_any_company_role(company_id, array['company_admin', 'planner'])
      or exists (select 1 from public.employees e where e.id = employee_rate_requests.employee_id and e.profile_id = auth.uid())
      or exists (
        select 1
        from public.project_assignments pa
        join public.employees pme on pme.id = pa.employee_id and pme.profile_id = auth.uid()
        where pa.assignment_role = 'project_manager'
          and pa.end_at is null
          and pa.company_id = employee_rate_requests.company_id
          and exists (
            select 1 from public.project_assignments target_pa
            where target_pa.employee_id = employee_rate_requests.employee_id
              and target_pa.project_id = pa.project_id
              and target_pa.end_at is null
          )
      )
    )
  );

comment on policy employee_rate_requests_select on public.employee_rate_requests is
  'Part 6/9 — company_admin/planner/platform_super_admin see any; the employee sees their own; a project_manager sees (READ ONLY — no insert/update policy grants them anything) requests for employees who share an active project_assignments row on one of the PM''s own project_manager-assigned projects.';

create policy employee_rate_requests_insert
  on public.employee_rate_requests
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and status = 'pending'
    and exists (select 1 from public.employees e where e.id = employee_rate_requests.employee_id and e.profile_id = auth.uid())
  );

comment on policy employee_rate_requests_insert on public.employee_rate_requests is
  'An employee may only ever submit a request for THEMSELVES (own employee_id, matched by profile_id), always starting pending — never able to insert a pre-decided row.';

-- Reviewers close out a pending request (approve/reject); the SAME
-- reviewer tier may also let the requesting employee withdraw their own
-- still-pending request (checked in the WITH CHECK below).
create policy employee_rate_requests_update
  on public.employee_rate_requests
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.is_platform_super_admin()
      or public.has_any_company_role(company_id, array['company_admin', 'planner'])
      or (status = 'pending' and exists (select 1 from public.employees e where e.id = employee_rate_requests.employee_id and e.profile_id = auth.uid()))
    )
  )
  with check (
    public.is_company_member(company_id)
    and (
      public.is_platform_super_admin()
      or public.has_any_company_role(company_id, array['company_admin', 'planner'])
      or (status = 'withdrawn' and exists (select 1 from public.employees e where e.id = employee_rate_requests.employee_id and e.profile_id = auth.uid()))
    )
  );

comment on policy employee_rate_requests_update on public.employee_rate_requests is
  'Part 6 — company_admin/planner/platform_super_admin may transition a pending request to approved/rejected (real field validation is in approve/reject the RPCs below, which also write the resulting rate-history row). The requesting employee may withdraw (and ONLY withdraw) their own still-pending request. project_manager has no UPDATE grant at all — read-only, per spec.';

revoke all on public.employee_rate_requests from authenticated;
grant select, insert, update on public.employee_rate_requests to authenticated;

-- ── RPCs — approve/reject, mirroring the leave_requests decision-RPC shape ──

create or replace function public.approve_employee_rate_request(target_request_id uuid, target_approved_rate numeric, target_effective_from date, target_decision_reason text default null)
returns public.employee_rate_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request public.employee_rate_requests;
  v_result public.employee_rate_requests;
  v_current_rate_id uuid;
  v_new_rate_id uuid;
begin
  select * into v_request from public.employee_rate_requests where id = target_request_id and status = 'pending';
  if v_request.id is null then
    raise exception 'open rate request % not found', target_request_id;
  end if;
  if target_approved_rate is null or target_approved_rate < 0 then
    raise exception 'a valid, non-negative approved rate is required';
  end if;
  if target_effective_from is null then
    raise exception 'an effective-from date is required';
  end if;

  select id into v_current_rate_id from public.employee_hourly_rates where employee_id = v_request.employee_id and company_id = v_request.company_id and effective_to is null;
  if v_current_rate_id is not null then
    update public.employee_hourly_rates set effective_to = target_effective_from - 1 where id = v_current_rate_id;
  end if;

  insert into public.employee_hourly_rates (company_id, employee_id, hourly_rate, currency, effective_from, reason, changed_by)
  values (v_request.company_id, v_request.employee_id, target_approved_rate, v_request.currency, target_effective_from, coalesce(target_decision_reason, 'Approved rate review request'), auth.uid())
  returning id into v_new_rate_id;

  update public.employee_rate_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), decision_reason = target_decision_reason, approved_rate = target_approved_rate, effective_from = target_effective_from, resulting_rate_id = v_new_rate_id
  where id = target_request_id
  returning * into v_result;

  insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
  select v_result.company_id, e.profile_id, 'rate_request_approved', 'Your rate review request was approved',
    format('New rate: %s/hour, effective %s.%s', target_approved_rate, to_char(target_effective_from, 'DD Mon YYYY'), case when target_decision_reason is not null then ' ' || target_decision_reason else '' end),
    format('/account/rates?requestId=%s', v_result.id)
  from public.employees e where e.id = v_result.employee_id and e.profile_id is not null;

  return v_result;
end;
$$;

comment on function public.approve_employee_rate_request(uuid, numeric, date, text) is
  'Part 7 — company_admin/planner/platform_super_admin only (RLS on the UPDATE this performs is the real gate — this function itself is security invoker, so it only succeeds if the caller''s own UPDATE would pass RLS). Closes the prior open rate period and inserts a new one via the same close-then-insert shape setEmployeeHourlyRate() (modules/rates/actions.ts) uses directly, so there is only ONE rate-changing code path, not two competing ones.';

revoke all on function public.approve_employee_rate_request(uuid, numeric, date, text) from public, anon;
grant execute on function public.approve_employee_rate_request(uuid, numeric, date, text) to authenticated;

create or replace function public.reject_employee_rate_request(target_request_id uuid, target_decision_reason text)
returns public.employee_rate_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_result public.employee_rate_requests;
begin
  if target_decision_reason is null or btrim(target_decision_reason) = '' then
    raise exception 'a decision reason is required to reject a rate request';
  end if;

  update public.employee_rate_requests
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), decision_reason = target_decision_reason
  where id = target_request_id and status = 'pending'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'open rate request % not found', target_request_id;
  end if;

  insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
  select v_result.company_id, e.profile_id, 'rate_request_rejected', 'Your rate review request was declined',
    target_decision_reason, format('/account/rates?requestId=%s', v_result.id)
  from public.employees e where e.id = v_result.employee_id and e.profile_id is not null;

  return v_result;
end;
$$;

comment on function public.reject_employee_rate_request(uuid, text) is
  'Part 7 — company_admin/planner/platform_super_admin only (same RLS-backed gate as approve). Never touches employee_hourly_rates. Decision reason is mandatory.';

revoke all on function public.reject_employee_rate_request(uuid, text) from public, anon;
grant execute on function public.reject_employee_rate_request(uuid, text) to authenticated;

-- ── Submission notifications (requester self-notify + reviewer notify) ──

create or replace function public.trg_notify_of_rate_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient uuid;
  v_employee_name text;
begin
  select (e.first_name || ' ' || e.last_name) into v_employee_name from public.employees e where e.id = new.employee_id;

  insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
  select new.company_id, e.profile_id, 'rate_request_submitted_self', 'Your rate review request has been sent',
    case when new.requested_rate is not null then format('Requested %s/hour.', new.requested_rate) else 'Review requested.' end,
    format('/account/rates?requestId=%s', new.id)
  from public.employees e where e.id = new.employee_id and e.profile_id is not null;

  -- Company Admin + planner (eligible reviewers) — same "loop, insert per
  -- recipient" shape as notify_project_managers(), not reused directly
  -- since the recipient set here is different (no project_manager leg).
  for v_recipient in
    select distinct cm.user_id
    from public.company_memberships cm
    join public.membership_roles mr on mr.membership_id = cm.id
    join public.roles r on r.id = mr.role_id
    where cm.company_id = new.company_id and cm.status = 'active' and r.name in ('company_admin', 'planner')
  loop
    insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
    values (new.company_id, v_recipient, 'rate_request_submitted', 'New rate review request', format('From %s.', coalesce(v_employee_name, 'an employee')), format('/companies/%s/rate-requests?id=%s', new.company_id, new.id));
  end loop;

  -- Part 9 — Project Manager gets an INFORMATIONAL notification only
  -- (never becomes an approver just by receiving this) if the employee
  -- belongs to one of the PM's own projects.
  for v_recipient in
    select distinct pme.profile_id
    from public.project_assignments pa
    join public.employees pme on pme.id = pa.employee_id
    where pa.assignment_role = 'project_manager' and pa.end_at is null and pa.company_id = new.company_id and pme.profile_id is not null
      and exists (select 1 from public.project_assignments target_pa where target_pa.employee_id = new.employee_id and target_pa.project_id = pa.project_id and target_pa.end_at is null)
  loop
    insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
    values (new.company_id, v_recipient, 'rate_request_submitted_pm_info', 'Rate review request submitted', format('%s submitted a rate review request (informational — you are not an approver).', coalesce(v_employee_name, 'An employee')), format('/companies/%s/rate-requests?id=%s', new.company_id, new.id));
  end loop;

  return new;
end;
$$;

create trigger employee_rate_requests_notify_insert
  after insert on public.employee_rate_requests
  for each row execute function public.trg_notify_of_rate_request();

comment on function public.trg_notify_of_rate_request() is
  'Part 9 — SECURITY DEFINER (same rationale as notify_project_managers()): resolves recipients and writes notifications regardless of the inserting employee''s own limited visibility into other people''s memberships/roles.';
