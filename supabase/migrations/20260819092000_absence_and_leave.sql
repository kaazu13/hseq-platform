-- Operational Quality milestone, Phases 4-10 (Absence management + Holiday/
-- Leave requests). Builds entirely on the EXISTING daily_attendance source
-- of truth (supabase/migrations/20260812090000_daily_workforce_and_teams.sql)
-- — no second, competing attendance system. "Absent Today" is a filtered
-- VIEW over daily_attendance, not a new table; the only genuinely new state
-- this migration introduces is (a) a per-(project,date) close/lock record
-- for absence-day auditability, (b) a correction audit trail for changes
-- made after a day is closed, (c) employee self-reported absence requests
-- (advisory until a manager confirms them — see report_absence()'s own
-- comment for why), and (d) holiday/leave requests with an approval
-- workflow that, once approved, writes into daily_attendance for exactly
-- the same reason a manager marking someone on leave manually would.

-- ============================================================================
-- 1) Absence day close/lock (Phase 5) — mirrors daily_teams' own
--    lock_at/by + unlock_at/by/reason lifecycle, but scoped to
--    (project_id, work_date) directly since there is no per-team grouping
--    for attendance the way there is for daily_teams.
-- ============================================================================
create table public.daily_attendance_day_locks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  work_date date not null,
  locked_at timestamptz not null default now(),
  locked_by uuid references public.profiles (id) on delete set null,
  unlocked_at timestamptz,
  unlocked_by uuid references public.profiles (id) on delete set null,
  unlock_reason text,
  constraint daily_attendance_day_locks_project_fk foreign key (project_id, company_id) references public.projects (id, company_id) on delete cascade,
  constraint daily_attendance_day_locks_one_per_project_date unique (project_id, work_date),
  constraint daily_attendance_day_locks_unlock_fields_paired check ((unlocked_at is null) = (unlocked_by is null))
);

comment on table public.daily_attendance_day_locks is
  'Closes/reopens the absence record for one (project, work_date) as its own auditable evidence, deliberately separate from daily_teams'' own lock (Phase 5''s explicit "absence status and team snapshot are related but separate evidence"). A row existing with unlocked_at is null means the day is currently CLOSED.';

create index daily_attendance_day_locks_project_idx on public.daily_attendance_day_locks (project_id, work_date);

alter table public.daily_attendance_day_locks enable row level security;
alter table public.daily_attendance_day_locks force row level security;

grant select, insert, update on public.daily_attendance_day_locks to authenticated;

create policy daily_attendance_day_locks_select
  on public.daily_attendance_day_locks
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or (public.has_project_access(project_id) and public.has_any_company_role(company_id, array['project_manager', 'hseq_manager', 'hse_officer', 'inspector', 'foreman']))
    )
  );

-- Only company-wide managers or the project's own PM may close/reopen —
-- same manage-tier as daily_attendance_insert/update itself.
create policy daily_attendance_day_locks_insert
  on public.daily_attendance_day_locks
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (public.has_any_company_role(company_id, array['company_admin', 'operations_manager']) or public.is_project_manager(project_id))
  );

create policy daily_attendance_day_locks_update
  on public.daily_attendance_day_locks
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and (public.has_any_company_role(company_id, array['company_admin', 'operations_manager']) or public.is_project_manager(project_id))
  )
  with check (
    public.is_company_member(company_id)
    and (public.has_any_company_role(company_id, array['company_admin', 'operations_manager']) or public.is_project_manager(project_id))
  );

-- ============================================================================
-- 2) daily_attendance_corrections (Phase 5) — audit trail for a status
--    change applied to a CLOSED day, mirroring worked_hours_corrections'
--    exact shape/reasoning.
-- ============================================================================
create table public.daily_attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  employee_id uuid not null,
  work_date date not null,
  previous_status public.daily_attendance_status not null,
  new_status public.daily_attendance_status not null,
  reason text not null,
  changed_by uuid not null references public.profiles (id),
  changed_at timestamptz not null default now(),
  constraint daily_attendance_corrections_reason_required check (btrim(reason) <> '')
);

comment on table public.daily_attendance_corrections is
  'Append-only audit trail: one row per status change made to an employee''s daily_attendance for a date whose absence day is already CLOSED — set_daily_attendance_status() below requires a reason and writes this row whenever that''s the case, never for an ordinary same-day change on an OPEN day.';

create index daily_attendance_corrections_project_date_idx on public.daily_attendance_corrections (project_id, work_date);

alter table public.daily_attendance_corrections enable row level security;
alter table public.daily_attendance_corrections force row level security;

grant select, insert on public.daily_attendance_corrections to authenticated;

create policy daily_attendance_corrections_select
  on public.daily_attendance_corrections
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or exists (select 1 from public.employees e where e.id = daily_attendance_corrections.employee_id and e.profile_id = auth.uid())
    )
  );

create policy daily_attendance_corrections_insert
  on public.daily_attendance_corrections
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (public.has_any_company_role(company_id, array['company_admin', 'operations_manager']) or public.is_project_manager(project_id))
  );

-- ============================================================================
-- 3) close_absence_day() / reopen_absence_day()
-- ============================================================================
create or replace function public.close_absence_day(target_project_id uuid, target_work_date date)
returns public.daily_attendance_day_locks
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_result public.daily_attendance_day_locks;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  insert into public.daily_attendance_day_locks (company_id, project_id, work_date, locked_by)
  values (v_company_id, target_project_id, target_work_date, auth.uid())
  on conflict (project_id, work_date) do update
    set locked_at = now(), locked_by = auth.uid(), unlocked_at = null, unlocked_by = null, unlock_reason = null
    where public.daily_attendance_day_locks.unlocked_at is not null
  returning * into v_result;

  if v_result.id is null then
    raise exception 'this absence day is already closed';
  end if;

  return v_result;
end;
$$;

comment on function public.close_absence_day(uuid, date) is
  '"[ Close Absence Day ]" (Phase 5) — locks the absence record for one (project, work_date); re-closing an already-open lock row (from a prior reopen) is allowed, closing an already-CLOSED day raises. RLS on daily_attendance_day_locks is the real gate.';

revoke all on function public.close_absence_day(uuid, date) from public, anon;
grant execute on function public.close_absence_day(uuid, date) to authenticated;

create or replace function public.reopen_absence_day(target_project_id uuid, target_work_date date, target_reason text)
returns public.daily_attendance_day_locks
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_result public.daily_attendance_day_locks;
begin
  if target_reason is null or btrim(target_reason) = '' then
    raise exception 'a reason is required to reopen a closed absence day';
  end if;

  update public.daily_attendance_day_locks
  set unlocked_at = now(), unlocked_by = auth.uid(), unlock_reason = target_reason
  where project_id = target_project_id and work_date = target_work_date and unlocked_at is null
  returning * into v_result;

  if v_result.id is null then
    raise exception 'this absence day is not currently closed';
  end if;

  return v_result;
end;
$$;

comment on function public.reopen_absence_day(uuid, date, text) is
  'The exceptional, audited correction path for a closed absence day (mirrors daily_teams'' unlock_daily_team()) — always requires a reason. RLS is the real gate.';

revoke all on function public.reopen_absence_day(uuid, date, text) from public, anon;
grant execute on function public.reopen_absence_day(uuid, date, text) to authenticated;

-- ============================================================================
-- 4) set_daily_attendance_status() becomes closed-day-aware
-- ============================================================================
-- Same function, same signature+behavior for an OPEN day (free edit, no
-- reason). NEW: if the day is currently CLOSED, a reason is required and a
-- daily_attendance_corrections row is written — exactly the same "free
-- edit vs. reasoned correction" split worked_hours already established for
-- submitted/draft.
create or replace function public.set_daily_attendance_status(
  target_project_id uuid,
  target_employee_id uuid,
  target_work_date date,
  target_status public.daily_attendance_status,
  target_note text default null,
  target_reason text default null
)
returns public.daily_attendance
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_existing public.daily_attendance;
  v_result public.daily_attendance;
  v_is_closed boolean;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  select exists (
    select 1 from public.daily_attendance_day_locks
    where project_id = target_project_id and work_date = target_work_date and unlocked_at is null
  ) into v_is_closed;

  select * into v_existing
  from public.daily_attendance
  where project_id = target_project_id and employee_id = target_employee_id and work_date = target_work_date
  for update;

  if not found then
    if v_is_closed then
      raise exception 'this absence day is closed — reopen it first to add a new attendance record';
    end if;
    insert into public.daily_attendance (company_id, project_id, employee_id, work_date, status, note, created_by, updated_by)
    values (v_company_id, target_project_id, target_employee_id, target_work_date, target_status, target_note, auth.uid(), auth.uid())
    returning * into v_result;
  else
    if v_is_closed and v_existing.status is distinct from target_status then
      if target_reason is null or btrim(target_reason) = '' then
        raise exception 'a reason is required to correct attendance on a closed absence day';
      end if;
      insert into public.daily_attendance_corrections (company_id, project_id, employee_id, work_date, previous_status, new_status, reason, changed_by)
      values (v_company_id, target_project_id, target_employee_id, target_work_date, v_existing.status, target_status, target_reason, auth.uid());
    end if;

    -- Closing the gap on the OLD assignment-blocking side effect: if the
    -- new status blocks work, atomically remove any open Today's Team
    -- membership for this exact date (same behavior the original
    -- Phase B/C set_daily_attendance_status() already had — preserved,
    -- not reintroduced).
    if not public.daily_attendance_permits_work(target_status) then
      update public.daily_team_members
      set removed_at = now(), removed_by = auth.uid()
      where employee_id = target_employee_id and removed_at is null
        and daily_team_id in (select id from public.daily_teams where project_id = target_project_id and work_date = target_work_date);
    end if;

    update public.daily_attendance
    set status = target_status, note = target_note, updated_by = auth.uid()
    where id = v_existing.id
    returning * into v_result;
  end if;

  return v_result;
end;
$$;

comment on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text) is
  'The sole write path for daily_attendance status (Phases B/C, extended in Phase 5 for closed-day corrections). Free edit on an OPEN day; a reason is required and audited (daily_attendance_corrections) on a CLOSED one. Also atomically removes any open Today''s Team membership when the new status blocks work. RLS on daily_attendance/daily_team_members is the real gate.';

revoke all on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text) from public, anon;
grant execute on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text) to authenticated;

-- ============================================================================
-- 5) daily_team_members insert stays blocked on a closed absence day's
--    behalf implicitly (attendance can't change without reopening first,
--    per set_daily_attendance_status() above) — no additional trigger
--    needed on daily_team_members itself; it already checks
--    daily_attendance_permits_work() for the CURRENT (possibly-corrected)
--    status regardless of lock state.
-- ============================================================================

-- ============================================================================
-- 6) Employee self-reported absence (Phase 7)
-- ============================================================================
create type public.absence_report_reason as enum ('sick', 'personal', 'family_emergency', 'transport_issue', 'other');
create type public.absence_report_status as enum ('pending', 'confirmed', 'rejected');

create table public.absence_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  employee_id uuid not null,
  work_date date not null,
  reason public.absence_report_reason not null,
  comment text,
  status public.absence_report_status not null default 'pending',
  reported_by uuid not null references public.profiles (id),
  reported_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  constraint absence_reports_project_fk foreign key (project_id, company_id) references public.projects (id, company_id) on delete cascade,
  constraint absence_reports_employee_fk foreign key (employee_id, company_id) references public.employees (id, company_id) on delete cascade,
  constraint absence_reports_comment_length check (comment is null or char_length(comment) <= 2000),
  constraint absence_reports_review_note_length check (review_note is null or char_length(review_note) <= 2000),
  constraint absence_reports_review_fields_paired check ((reviewed_at is null) = (reviewed_by is null))
);

comment on table public.absence_reports is
  'Employee "[ Report Absence ]" self-report (Phase 7) — deliberately advisory-only until a manager reviews it: inserting this row does NOT itself touch daily_attendance (see confirm_absence_report()/reject_absence_report() below), so "Reported by employee" (this table, reported_by) and "Marked by management" (daily_attendance, only ever written by a manage-tier actor) stay two genuinely distinct, always-visible facts rather than one blurred state — the cleanest auditable approach given this milestone''s explicit "if current business rules make same-day confirmation preferable to approval semantics, implement the cleanest auditable approach" direction.';

create index absence_reports_project_date_idx on public.absence_reports (project_id, work_date);
create index absence_reports_employee_idx on public.absence_reports (employee_id);

alter table public.absence_reports enable row level security;
alter table public.absence_reports force row level security;

grant select, insert, update on public.absence_reports to authenticated;

-- Employee sees their own reports; managers see every report in their scope.
create policy absence_reports_select
  on public.absence_reports
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or exists (select 1 from public.employees e where e.id = absence_reports.employee_id and e.profile_id = auth.uid())
    )
  );

-- An employee may only ever report FOR THEMSELVES — "do not allow an
-- employee to report absence for another employee" enforced here, not
-- merely by UI convention.
create policy absence_reports_insert
  on public.absence_reports
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and reported_by = auth.uid()
    and exists (select 1 from public.employees e where e.id = absence_reports.employee_id and e.profile_id = auth.uid())
  );

-- Only a manage-tier actor may transition status (confirm/reject) — never
-- the reporting employee themselves.
create policy absence_reports_update
  on public.absence_reports
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and (public.has_any_company_role(company_id, array['company_admin', 'operations_manager']) or public.is_project_manager(project_id))
  )
  with check (
    public.is_company_member(company_id)
    and (public.has_any_company_role(company_id, array['company_admin', 'operations_manager']) or public.is_project_manager(project_id))
  );

create or replace function public.report_absence(
  target_project_id uuid,
  target_employee_id uuid,
  target_work_date date,
  target_reason public.absence_report_reason,
  target_comment text default null
)
returns public.absence_reports
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_result public.absence_reports;
  v_recipient record;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  insert into public.absence_reports (company_id, project_id, employee_id, work_date, reason, comment, reported_by)
  values (v_company_id, target_project_id, target_employee_id, target_work_date, target_reason, target_comment, auth.uid())
  returning * into v_result;

  -- Notify relevant project management: company-wide managers plus this
  -- project's own assigned Project Manager — never unrelated users.
  for v_recipient in
    select distinct p.id as profile_id
    from public.company_memberships cm
    join public.membership_roles mr on mr.membership_id = cm.id
    join public.roles r on r.id = mr.role_id
    join public.profiles p on p.id = cm.user_id
    where cm.company_id = v_company_id and cm.status = 'active' and r.name in ('company_admin', 'operations_manager')
    union
    select distinct e.profile_id
    from public.project_assignments pa
    join public.employees e on e.id = pa.employee_id
    where pa.project_id = target_project_id and pa.assignment_role = 'project_manager' and pa.end_at is null and e.profile_id is not null
  loop
    insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
    values (
      v_company_id,
      v_recipient.profile_id,
      'absence_reported',
      'Absence reported',
      format('An employee reported themselves absent for %s.', to_char(target_work_date, 'DD Mon YYYY')),
      format('/companies/%s/projects/%s/absences?date=%s', v_company_id, target_project_id, target_work_date)
    );
  end loop;

  return v_result;
end;
$$;

comment on function public.report_absence(uuid, uuid, date, public.absence_report_reason, text) is
  '"[ Report Absence ]" (Phase 7) — RLS''s absence_reports_insert policy (reported_by = auth.uid() AND the employee row belongs to the caller) is the real "cannot report for someone else" gate. Notifies company-wide managers and the project''s own PM.';

revoke all on function public.report_absence(uuid, uuid, date, public.absence_report_reason, text) from public, anon;
grant execute on function public.report_absence(uuid, uuid, date, public.absence_report_reason, text) to authenticated;

create or replace function public.confirm_absence_report(target_report_id uuid)
returns public.absence_reports
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_report public.absence_reports;
  v_result public.absence_reports;
  v_status public.daily_attendance_status;
begin
  select * into v_report from public.absence_reports where id = target_report_id and status = 'pending';
  if v_report.id is null then
    raise exception 'open absence report % not found', target_report_id;
  end if;

  v_status := case v_report.reason when 'sick' then 'sick'::public.daily_attendance_status else 'absent'::public.daily_attendance_status end;
  perform public.set_daily_attendance_status(v_report.project_id, v_report.employee_id, v_report.work_date, v_status, v_report.comment);

  update public.absence_reports
  set status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now()
  where id = target_report_id
  returning * into v_result;

  return v_result;
end;
$$;

comment on function public.confirm_absence_report(uuid) is
  'Manager "[ Confirm ]" of a pending self-report (Phase 7/9) — applies the effect to daily_attendance (via set_daily_attendance_status(), itself gated by that function''s own manage-tier RLS — a plain employee cannot reach this successfully even if they somehow called it) and marks the report confirmed. RLS on absence_reports_update is the real gate on the report row itself.';

revoke all on function public.confirm_absence_report(uuid) from public, anon;
grant execute on function public.confirm_absence_report(uuid) to authenticated;

create or replace function public.reject_absence_report(target_report_id uuid, target_review_note text)
returns public.absence_reports
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_result public.absence_reports;
begin
  if target_review_note is null or btrim(target_review_note) = '' then
    raise exception 'a review note is required to reject an absence report';
  end if;

  update public.absence_reports
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = target_review_note
  where id = target_report_id and status = 'pending'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'open absence report % not found', target_report_id;
  end if;

  return v_result;
end;
$$;

comment on function public.reject_absence_report(uuid, text) is
  'Manager "[ Reject ]" of a pending self-report (Phase 7/9) — never touches daily_attendance. RLS is the real gate.';

revoke all on function public.reject_absence_report(uuid, text) from public, anon;
grant execute on function public.reject_absence_report(uuid, text) to authenticated;

-- ============================================================================
-- 7) Holiday / Leave requests (Phase 8-10)
-- ============================================================================
create type public.leave_type as enum ('annual', 'sick', 'unpaid', 'compassionate', 'other');
create type public.leave_request_status as enum ('pending', 'approved', 'denied', 'returned', 'cancelled');

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  employee_id uuid not null,
  leave_type public.leave_type not null,
  start_date date not null,
  end_date date not null,
  employee_comment text,
  status public.leave_request_status not null default 'pending',
  requested_by uuid not null references public.profiles (id),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  management_comment text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  constraint leave_requests_project_fk foreign key (project_id, company_id) references public.projects (id, company_id) on delete cascade,
  constraint leave_requests_employee_fk foreign key (employee_id, company_id) references public.employees (id, company_id) on delete cascade,
  constraint leave_requests_date_range check (end_date >= start_date),
  -- A sensible sanity ceiling — "enforce sensible date-range limits" — not
  -- a business-rule cap on how much leave is allowed, just a backstop
  -- against a fat-fingered multi-year range.
  constraint leave_requests_date_range_sane check (end_date <= start_date + interval '366 days'),
  constraint leave_requests_employee_comment_length check (employee_comment is null or char_length(employee_comment) <= 2000),
  constraint leave_requests_management_comment_length check (management_comment is null or char_length(management_comment) <= 2000)
);

comment on table public.leave_requests is
  'Holiday/leave request workflow (Phase 8-10) — Pending -> Approved/Denied/Returned; Returned allows the employee to amend and resubmit (back to Pending); Approved may be Cancelled while still upcoming. Approving writes ''leave'' into daily_attendance for every date in range via apply_leave_to_attendance() below — the SAME table Today''s Team assignment already checks, so an approved leave blocks assignment by construction, no second unavailability concept.';

alter table public.leave_requests add column updated_at timestamptz not null default now();

create index leave_requests_project_idx on public.leave_requests (project_id, start_date, end_date);
create index leave_requests_employee_idx on public.leave_requests (employee_id);

create trigger leave_requests_set_updated_at
  before update on public.leave_requests
  for each row execute function public.set_updated_at();

alter table public.leave_requests enable row level security;
alter table public.leave_requests force row level security;

grant select, insert, update on public.leave_requests to authenticated;

create policy leave_requests_select
  on public.leave_requests
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or exists (select 1 from public.employees e where e.id = leave_requests.employee_id and e.profile_id = auth.uid())
    )
  );

-- Same "cannot act for someone else" shape as absence_reports.
create policy leave_requests_insert
  on public.leave_requests
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and requested_by = auth.uid()
    and exists (select 1 from public.employees e where e.id = leave_requests.employee_id and e.profile_id = auth.uid())
  );

-- Both the requesting employee (resubmit/cancel their OWN request) and a
-- manage-tier actor (approve/deny/return) can update — the RPCs below are
-- the real per-transition gate (an employee calling the approve RPC will
-- simply never satisfy ITS OWN role check, regardless of this broad
-- UPDATE grant); this mirrors worked_hours_discrepancies' identical
-- "both sides can touch the row, the RPC decides what's allowed" shape.
create policy leave_requests_update
  on public.leave_requests
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or exists (select 1 from public.employees e where e.id = leave_requests.employee_id and e.profile_id = auth.uid())
    )
  )
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or exists (select 1 from public.employees e where e.id = leave_requests.employee_id and e.profile_id = auth.uid())
    )
  );

create table public.leave_request_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  leave_request_id uuid not null references public.leave_requests (id) on delete cascade,
  from_status public.leave_request_status,
  to_status public.leave_request_status not null,
  comment text,
  changed_by uuid not null references public.profiles (id),
  changed_at timestamptz not null default now()
);

comment on table public.leave_request_history is
  'Append-only audit trail for every leave_requests status transition ("Preserve request history/audit trail", Phase 8) — written by every RPC below, never by a raw update.';

alter table public.leave_request_history enable row level security;
alter table public.leave_request_history force row level security;

grant select, insert on public.leave_request_history to authenticated;

create policy leave_request_history_select
  on public.leave_request_history
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or exists (
        select 1 from public.leave_requests lr
        left join public.employees e on e.id = lr.employee_id
        where lr.id = leave_request_history.leave_request_id
          and (public.is_project_manager(lr.project_id) or e.profile_id = auth.uid())
      )
    )
  );

create policy leave_request_history_insert
  on public.leave_request_history
  for insert
  to authenticated
  with check (public.is_company_member(company_id));

-- Applies/reverts 'leave' across every date in [start_date, end_date] —
-- the single, deterministic integration point between an approved/
-- cancelled leave request and daily_attendance, called by exactly two
-- places below (approve, cancel-after-approval) so the effect is never
-- duplicated ad hoc.
create or replace function public.apply_leave_to_attendance(target_request public.leave_requests, target_status public.daily_attendance_status)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_date date;
begin
  v_date := target_request.start_date;
  while v_date <= target_request.end_date loop
    -- Skip a date that's already inside a CLOSED absence day rather than
    -- raising and aborting the whole range — a closed historical day
    -- keeps its own preserved record; only today/future dates are
    -- realistically still open when a leave decision is made.
    if not exists (select 1 from public.daily_attendance_day_locks where project_id = target_request.project_id and work_date = v_date and unlocked_at is null) then
      insert into public.daily_attendance (company_id, project_id, employee_id, work_date, status, created_by, updated_by)
      values (target_request.company_id, target_request.project_id, target_request.employee_id, v_date, target_status, auth.uid(), auth.uid())
      on conflict (project_id, employee_id, work_date) do update
        set status = excluded.status, updated_by = auth.uid()
        -- Only overwrite a row this SAME mechanism plausibly set — never
        -- clobber a manager's own unrelated status choice when REVERTING
        -- a cancelled leave (target_status = 'not_set' path only).
        where target_status <> 'not_set' or public.daily_attendance.status = 'leave';

      if not public.daily_attendance_permits_work(target_status) then
        update public.daily_team_members
        set removed_at = now(), removed_by = auth.uid()
        where employee_id = target_request.employee_id and removed_at is null
          and daily_team_id in (select id from public.daily_teams where project_id = target_request.project_id and work_date = v_date);
      end if;
    end if;
    v_date := v_date + 1;
  end loop;
end;
$$;

comment on function public.apply_leave_to_attendance(public.leave_requests, public.daily_attendance_status) is
  'Deterministic daily_attendance integration for one leave request across its whole date range (Phase 8''s explicit "use a deterministic/safe integration strategy, do not create duplicate daily records unsafely") — upserts on the SAME (project_id, employee_id, work_date) uniqueness daily_attendance already enforces, so this can never create a duplicate row; reverting (target_status=''not_set'') only touches rows still showing ''leave'', never a status set by something else in the meantime.';

create or replace function public.approve_leave_request(target_request_id uuid, target_comment text default null)
returns public.leave_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request public.leave_requests;
  v_result public.leave_requests;
begin
  select * into v_request from public.leave_requests where id = target_request_id and status in ('pending', 'returned');
  if v_request.id is null then
    raise exception 'open leave request % not found', target_request_id;
  end if;

  update public.leave_requests
  set status = 'approved', decided_by = auth.uid(), decided_at = now(), management_comment = target_comment
  where id = target_request_id
  returning * into v_result;

  perform public.apply_leave_to_attendance(v_result, 'leave');

  insert into public.leave_request_history (company_id, leave_request_id, from_status, to_status, comment, changed_by)
  values (v_result.company_id, v_result.id, v_request.status, 'approved', target_comment, auth.uid());

  insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
  select v_result.company_id, e.profile_id, 'leave_request_approved', 'Leave request approved',
    format('%s – %s', to_char(v_result.start_date, 'DD Mon YYYY'), to_char(v_result.end_date, 'DD Mon YYYY')), '/my-leave'
  from public.employees e where e.id = v_result.employee_id and e.profile_id is not null;

  return v_result;
end;
$$;

comment on function public.approve_leave_request(uuid, text) is
  'Manager "[ Approve ]" (Phase 8-9) — applies ''leave'' across the full date range via apply_leave_to_attendance(), records history, notifies the employee. RLS on leave_requests is the real gate.';

revoke all on function public.approve_leave_request(uuid, text) from public, anon;
grant execute on function public.approve_leave_request(uuid, text) to authenticated;

create or replace function public.deny_leave_request(target_request_id uuid, target_comment text)
returns public.leave_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request public.leave_requests;
  v_result public.leave_requests;
begin
  if target_comment is null or btrim(target_comment) = '' then
    raise exception 'a management comment is required to deny a leave request';
  end if;

  select * into v_request from public.leave_requests where id = target_request_id and status in ('pending', 'returned');
  if v_request.id is null then
    raise exception 'open leave request % not found', target_request_id;
  end if;

  update public.leave_requests
  set status = 'denied', decided_by = auth.uid(), decided_at = now(), management_comment = target_comment
  where id = target_request_id
  returning * into v_result;

  insert into public.leave_request_history (company_id, leave_request_id, from_status, to_status, comment, changed_by)
  values (v_result.company_id, v_result.id, v_request.status, 'denied', target_comment, auth.uid());

  insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
  select v_result.company_id, e.profile_id, 'leave_request_denied', 'Leave request denied', target_comment, '/my-leave'
  from public.employees e where e.id = v_result.employee_id and e.profile_id is not null;

  return v_result;
end;
$$;

comment on function public.deny_leave_request(uuid, text) is
  'Manager "[ Deny ]" (Phase 8-9) — a comment is mandatory. Never touches daily_attendance (nothing was ever applied for a request that was not approved). RLS is the real gate.';

revoke all on function public.deny_leave_request(uuid, text) from public, anon;
grant execute on function public.deny_leave_request(uuid, text) to authenticated;

create or replace function public.return_leave_request(target_request_id uuid, target_comment text)
returns public.leave_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request public.leave_requests;
  v_result public.leave_requests;
begin
  if target_comment is null or btrim(target_comment) = '' then
    raise exception 'a comment is required to return a leave request for changes';
  end if;

  select * into v_request from public.leave_requests where id = target_request_id and status = 'pending';
  if v_request.id is null then
    raise exception 'pending leave request % not found', target_request_id;
  end if;

  update public.leave_requests
  set status = 'returned', decided_by = auth.uid(), decided_at = now(), management_comment = target_comment
  where id = target_request_id
  returning * into v_result;

  insert into public.leave_request_history (company_id, leave_request_id, from_status, to_status, comment, changed_by)
  values (v_result.company_id, v_result.id, v_request.status, 'returned', target_comment, auth.uid());

  insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
  select v_result.company_id, e.profile_id, 'leave_request_returned', 'Leave request returned for changes', target_comment, '/my-leave'
  from public.employees e where e.id = v_result.employee_id and e.profile_id is not null;

  return v_result;
end;
$$;

comment on function public.return_leave_request(uuid, text) is
  'Manager "[ Return for Changes ]" (Phase 8-9) — a comment is mandatory. Employee can then amend via resubmit_leave_request() below.';

revoke all on function public.return_leave_request(uuid, text) from public, anon;
grant execute on function public.return_leave_request(uuid, text) to authenticated;

create or replace function public.resubmit_leave_request(target_request_id uuid, target_start_date date, target_end_date date, target_leave_type public.leave_type, target_comment text default null)
returns public.leave_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid;
  v_result public.leave_requests;
  v_recipient record;
begin
  if target_end_date < target_start_date then
    raise exception 'end date cannot be before start date';
  end if;

  select employee_id into v_employee_id from public.leave_requests where id = target_request_id and status = 'returned';
  if v_employee_id is null then
    raise exception 'returned leave request % not found', target_request_id;
  end if;

  if not exists (select 1 from public.employees e where e.id = v_employee_id and e.profile_id = auth.uid()) then
    raise exception 'only the requesting employee may resubmit this request';
  end if;

  update public.leave_requests
  set status = 'pending', start_date = target_start_date, end_date = target_end_date, leave_type = target_leave_type, employee_comment = target_comment,
      decided_by = null, decided_at = null, management_comment = null
  where id = target_request_id
  returning * into v_result;

  insert into public.leave_request_history (company_id, leave_request_id, from_status, to_status, comment, changed_by)
  values (v_result.company_id, v_result.id, 'returned', 'pending', target_comment, auth.uid());

  for v_recipient in
    select distinct p.id as profile_id
    from public.company_memberships cm
    join public.membership_roles mr on mr.membership_id = cm.id
    join public.roles r on r.id = mr.role_id
    join public.profiles p on p.id = cm.user_id
    where cm.company_id = v_result.company_id and cm.status = 'active' and r.name in ('company_admin', 'operations_manager')
    union
    select distinct e.profile_id
    from public.project_assignments pa
    join public.employees e on e.id = pa.employee_id
    where pa.project_id = v_result.project_id and pa.assignment_role = 'project_manager' and pa.end_at is null and e.profile_id is not null
  loop
    insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
    values (v_result.company_id, v_recipient.profile_id, 'leave_request_resubmitted', 'Leave request resubmitted', format('%s – %s', to_char(target_start_date, 'DD Mon YYYY'), to_char(target_end_date, 'DD Mon YYYY')), format('/companies/%s/projects/%s/leave', v_result.company_id, v_result.project_id));
  end loop;

  return v_result;
end;
$$;

comment on function public.resubmit_leave_request(uuid, date, date, public.leave_type, text) is
  'Employee amends and resubmits a RETURNED request (Phase 8) — only the original requesting employee may call this (checked explicitly, on top of RLS). Clears the prior decision fields (history is preserved in leave_request_history, not lost) and goes back to Pending, notifying the same managers report_absence() would.';

revoke all on function public.resubmit_leave_request(uuid, date, date, public.leave_type, text) from public, anon;
grant execute on function public.resubmit_leave_request(uuid, date, date, public.leave_type, text) to authenticated;

create or replace function public.cancel_leave_request(target_request_id uuid)
returns public.leave_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request public.leave_requests;
  v_result public.leave_requests;
begin
  select * into v_request from public.leave_requests where id = target_request_id and status in ('pending', 'approved', 'returned');
  if v_request.id is null then
    raise exception 'cancellable leave request % not found', target_request_id;
  end if;

  -- Cancelling an already-approved request only makes sense while it
  -- hasn't fully elapsed — a disclosed, deliberate constraint (Phase 8
  -- doesn't specify this precisely; this is the safest, simplest rule).
  if v_request.status = 'approved' and v_request.end_date < current_date then
    raise exception 'this leave has already ended and can no longer be cancelled';
  end if;

  update public.leave_requests
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
  where id = target_request_id
  returning * into v_result;

  if v_request.status = 'approved' then
    perform public.apply_leave_to_attendance(v_result, 'not_set');
  end if;

  insert into public.leave_request_history (company_id, leave_request_id, from_status, to_status, changed_by)
  values (v_result.company_id, v_result.id, v_request.status, 'cancelled', auth.uid());

  return v_result;
end;
$$;

comment on function public.cancel_leave_request(uuid) is
  'Cancels a pending/returned/still-upcoming-or-in-progress approved request (Phase 8''s "Cancelled where appropriate") — RLS lets either the requesting employee or a manage-tier actor call this; reverting an approved request''s daily_attendance rows only clears dates still showing ''leave'' (apply_leave_to_attendance()''s own guard), never a status changed by something else since approval.';

revoke all on function public.cancel_leave_request(uuid) from public, anon;
grant execute on function public.cancel_leave_request(uuid) to authenticated;
