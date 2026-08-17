-- Task 3 Part 19: absence/attendance review-contest workflow. An employee
-- who believes an already-recorded daily_attendance status is WRONG
-- (e.g. marked absent when they were actually present) can request a
-- review with an explanation — distinct from absence_reports (which is
-- "I was absent today, please confirm it," a NEW self-report) and from
-- daily_attendance_corrections (an audit trail a MANAGER'S OWN correction
-- writes, not something an employee initiates). Reviewer role set is
-- deliberately narrower than canManageDailyWorkforce (which also includes
-- hseq_manager/hse_officer/foreman): project_manager, operations_manager,
-- company_admin, platform_super_admin only — this is a workforce-
-- administration decision, not a safety one.

create type public.attendance_review_status as enum ('pending', 'accepted', 'rejected');

create table public.attendance_review_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  employee_id uuid not null,
  work_date date not null,
  requested_by uuid not null references public.profiles (id) on delete set null,
  explanation text not null,
  status public.attendance_review_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  constraint attendance_review_requests_attendance_fk foreign key (project_id, employee_id, work_date) references public.daily_attendance (project_id, employee_id, work_date) on delete cascade,
  constraint attendance_review_requests_project_fk foreign key (project_id, company_id) references public.projects (id, company_id) on delete cascade,
  constraint attendance_review_requests_employee_fk foreign key (employee_id, company_id) references public.employees (id, company_id) on delete cascade,
  constraint attendance_review_requests_explanation_not_blank check (btrim(explanation) <> '')
);

comment on table public.attendance_review_requests is
  'Employee-initiated "this attendance record is wrong" contest, with an authorized reviewer''s accept/reject decision. Composite FK to daily_attendance (project_id, employee_id, work_date) guarantees this can only ever reference a REAL, already-recorded attendance status — never an invented date. Cross-project/cross-user prevention is structural: the FK chain ties employee_id/project_id/company_id together exactly like every other multi-tenant table here, and the INSERT policy below additionally requires employee_id to resolve to the CALLER''s own employee row.';

-- Duplicate prevention: at most one PENDING request per (project, employee,
-- work_date) — a partial unique index, so a resolved (accepted/rejected)
-- request never blocks submitting a genuinely new one later.
create unique index attendance_review_requests_one_pending_per_day
  on public.attendance_review_requests (project_id, employee_id, work_date)
  where status = 'pending';

create index attendance_review_requests_company_id_idx on public.attendance_review_requests (company_id);
create index attendance_review_requests_employee_id_idx on public.attendance_review_requests (employee_id, created_at desc);

alter table public.attendance_review_requests enable row level security;
alter table public.attendance_review_requests force row level security;

grant select, insert, update on public.attendance_review_requests to authenticated;

-- Reviewer tier — deliberately its OWN function, not a reuse of
-- is_project_manager()/has_any_company_role() inline everywhere, so this
-- exact role set (documented above) has one single source of truth.
create or replace function public.is_attendance_reviewer(target_project_id uuid, target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_platform_super_admin()
    or public.has_any_company_role(target_company_id, array['company_admin', 'operations_manager'])
    or (public.is_project_manager(target_project_id));
$$;

comment on function public.is_attendance_reviewer(uuid, uuid) is
  'The Task 3 Part 19 reviewer tier: project_manager (scoped to that specific project), operations_manager/company_admin (company-wide), or platform_super_admin. Deliberately narrower than canManageDailyWorkforce/is_scaffold_manage_tier-style checks elsewhere — hseq_manager/hse_officer/foreman are NOT reviewers here, this is a workforce-administration decision, not a safety one.';

revoke all on function public.is_attendance_reviewer(uuid, uuid) from public, anon;
grant execute on function public.is_attendance_reviewer(uuid, uuid) to authenticated;

create policy attendance_review_requests_select
  on public.attendance_review_requests
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      exists (select 1 from public.employees e where e.id = attendance_review_requests.employee_id and e.profile_id = auth.uid())
      or public.is_attendance_reviewer(project_id, company_id)
    )
  );

comment on policy attendance_review_requests_select on public.attendance_review_requests is
  'The requesting employee (own row), or an authorized reviewer for that project/company, may see a request.';

-- INSERT: the employee themselves ONLY — employee_id must resolve to the
-- caller's own employee row. Reviewers never create requests on someone
-- else's behalf (that would defeat "employee requests review with
-- explanation").
create policy attendance_review_requests_insert
  on public.attendance_review_requests
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and requested_by = auth.uid()
    and exists (select 1 from public.employees e where e.id = attendance_review_requests.employee_id and e.profile_id = auth.uid())
  );

-- Employee-facing insert wrapper — SECURITY INVOKER, matching
-- report_absence()'s exact convention: the real "cannot request review for
-- someone else" gate is attendance_review_requests_insert's own RLS
-- (requested_by = auth.uid() AND employee_id resolves to the caller's own
-- employee row), this is just a convenience wrapper that resolves
-- company_id server-side instead of trusting a client-supplied value.
create or replace function public.request_attendance_review(target_project_id uuid, target_employee_id uuid, target_work_date date, target_explanation text)
returns public.attendance_review_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_result public.attendance_review_requests;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  insert into public.attendance_review_requests (company_id, project_id, employee_id, work_date, requested_by, explanation)
  values (v_company_id, target_project_id, target_employee_id, target_work_date, auth.uid(), target_explanation)
  returning * into v_result;

  return v_result;
end;
$$;

comment on function public.request_attendance_review(uuid, uuid, date, text) is
  '"[ Request review ]" on My Hours'' Absences tab — attendance_review_requests_insert''s RLS (requested_by = auth.uid() AND the employee row belongs to the caller) is the real "cannot request for someone else" gate. The composite FK to daily_attendance means this also fails cleanly if no such attendance record exists at all. The partial unique index (one pending per day) surfaces as a clean conflict error, not a raw constraint message, via isUniqueViolation() at the app layer.';

revoke all on function public.request_attendance_review(uuid, uuid, date, text) from public, anon;
grant execute on function public.request_attendance_review(uuid, uuid, date, text) to authenticated;

-- No RLS UPDATE policy at all — every decision goes through
-- accept_attendance_review()/reject_attendance_review() below (SECURITY
-- DEFINER, matching the platform_admin_update_project_*()/
-- update_project_location_settings() convention this session settled on
-- after live-testing found a bare RLS-widened UPDATE path unreliable for a
-- comparable case — see 20260901116000's header comment). This ALSO
-- correctly covers platform_super_admin, who typically has NO
-- company_memberships row and would otherwise fail is_company_member on
-- this table entirely, same gap documented in
-- 20260901090000_platform_admin_console.sql.
create or replace function public.validate_attendance_review_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.status <> 'pending' then
    raise exception 'this review request has already been decided';
  end if;
  if new.status = 'pending' then
    raise exception 'a review decision must be accepted or rejected';
  end if;
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.employee_id is distinct from old.employee_id
    or new.work_date is distinct from old.work_date
    or new.requested_by is distinct from old.requested_by
    or new.explanation is distinct from old.explanation
  then
    raise exception 'only the review decision fields may change';
  end if;
  return new;
end;
$$;

comment on function public.validate_attendance_review_update() is
  'Once decided (accepted/rejected), a request is terminal — no re-deciding, no editing the original request fields. Fires regardless of the RLS-bypassing SECURITY DEFINER RPCs below, since triggers always fire independent of how the UPDATE was issued.';

create trigger attendance_review_requests_validate_update
  before update on public.attendance_review_requests
  for each row execute function public.validate_attendance_review_update();

-- ── Decision RPCs ────────────────────────────────────────────────────────
create or replace function public.accept_attendance_review(target_request_id uuid, target_corrected_status public.daily_attendance_status, target_review_note text, target_reason text default null)
returns public.attendance_review_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.attendance_review_requests;
  v_result public.attendance_review_requests;
begin
  select * into v_request from public.attendance_review_requests where id = target_request_id and status = 'pending';
  if v_request.id is null then
    raise exception 'pending review request % not found', target_request_id;
  end if;

  if not (public.is_platform_super_admin() or public.is_attendance_reviewer(v_request.project_id, v_request.company_id)) then
    raise exception 'you are not authorized to review this request';
  end if;

  if target_review_note is null or btrim(target_review_note) = '' then
    raise exception 'a review note is required';
  end if;

  -- Applies the actual correction — same write path
  -- correctAbsenceStatus/Mark Absent already use; a reason is required by
  -- it whenever this would zero out already-submitted worked hours, same
  -- as everywhere else.
  perform public.set_daily_attendance_status(v_request.project_id, v_request.employee_id, v_request.work_date, target_corrected_status, null, target_reason);

  update public.attendance_review_requests
  set status = 'accepted', reviewed_by = auth.uid(), reviewed_at = now(), review_note = target_review_note
  where id = target_request_id
  returning * into v_result;

  return v_result;
end;
$$;

comment on function public.accept_attendance_review(uuid, public.daily_attendance_status, text, text) is
  'Reviewer accepts a contest AND supplies the corrected status in one step — applies it via set_daily_attendance_status() (the same write path every other attendance correction uses) so there is no separate "now go fix it" second step. target_reason is only actually required by set_daily_attendance_status when this would zero out already-submitted worked hours.';

revoke all on function public.accept_attendance_review(uuid, public.daily_attendance_status, text, text) from public, anon;
grant execute on function public.accept_attendance_review(uuid, public.daily_attendance_status, text, text) to authenticated;

create or replace function public.reject_attendance_review(target_request_id uuid, target_review_note text)
returns public.attendance_review_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.attendance_review_requests;
  v_result public.attendance_review_requests;
begin
  select * into v_request from public.attendance_review_requests where id = target_request_id and status = 'pending';
  if v_request.id is null then
    raise exception 'pending review request % not found', target_request_id;
  end if;

  if not (public.is_platform_super_admin() or public.is_attendance_reviewer(v_request.project_id, v_request.company_id)) then
    raise exception 'you are not authorized to review this request';
  end if;

  if target_review_note is null or btrim(target_review_note) = '' then
    raise exception 'a review note is required';
  end if;

  update public.attendance_review_requests
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = target_review_note
  where id = target_request_id
  returning * into v_result;

  return v_result;
end;
$$;

comment on function public.reject_attendance_review(uuid, text) is
  'Reviewer rejects a contest — no data change, just the decision + a required note explaining why.';

revoke all on function public.reject_attendance_review(uuid, text) from public, anon;
grant execute on function public.reject_attendance_review(uuid, text) to authenticated;
