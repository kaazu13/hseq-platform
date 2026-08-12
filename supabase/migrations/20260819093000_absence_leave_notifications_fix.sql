-- Fixes a real bug found via live-DB testing immediately after
-- 20260819092000: report_absence()'s manager-notification loop ran as
-- SECURITY INVOKER (the reporting EMPLOYEE's own privilege), so (a) its
-- `join public.profiles p on p.id = cm.user_id` silently dropped every
-- manager's row under profiles_select_own's `id = auth.uid()` policy, and
-- even after removing that join (ii) below), (b) notifications_insert's
-- own WITH CHECK requires the INSERTING user to already hold
-- company_admin/operations_manager/project_manager — an employee never
-- does. Verified live: the original report_absence() call succeeded
-- (absence_reports insert is legitimately employee-writable) but zero
-- notifications rows were produced.
--
-- Fix: move manager-notification delivery into AFTER INSERT/UPDATE
-- triggers on absence_reports/leave_requests. Trigger functions execute
-- with the privileges of their OWNER (postgres, confirmed rolbypassrls =
-- true in this project), so they bypass RLS regardless of which role fired
-- the triggering statement — the same mechanism this migration's own
-- helper functions (is_company_member, has_project_access, etc.) already
-- rely on. This is safe specifically because these triggers take no
-- caller-supplied recipient/content beyond the already-validated row
-- itself (company_id/project_id/employee_id, all already constrained by
-- FKs) — there is no free-text or arbitrary-recipient injection surface.
create or replace function public.notify_project_managers(
  target_company_id uuid,
  target_project_id uuid,
  notif_type text,
  notif_title text,
  notif_body text,
  notif_link_path text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient uuid;
begin
  for v_recipient in
    select distinct cm.user_id
    from public.company_memberships cm
    join public.membership_roles mr on mr.membership_id = cm.id
    join public.roles r on r.id = mr.role_id
    where cm.company_id = target_company_id and cm.status = 'active' and r.name in ('company_admin', 'operations_manager')
    union
    select distinct e.profile_id
    from public.project_assignments pa
    join public.employees e on e.id = pa.employee_id
    where pa.project_id = target_project_id and pa.assignment_role = 'project_manager' and pa.end_at is null and e.profile_id is not null
  loop
    insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
    values (target_company_id, v_recipient, notif_type, notif_title, notif_body, notif_link_path);
  end loop;
end;
$$;

comment on function public.notify_project_managers(uuid, uuid, text, text, text, text) is
  'SECURITY DEFINER (owner postgres has rolbypassrls) so it can resolve recipients and write notifications regardless of the calling role''s own visibility/permissions — used only from the two triggers below, never granted directly to authenticated (no free-text-from-arbitrary-caller injection surface: company_id/project_id/type/title/body/link_path here are always trigger-supplied from an already-inserted, FK-constrained row, never raw client input).';

revoke all on function public.notify_project_managers(uuid, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.trg_notify_managers_of_absence_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.notify_project_managers(
    new.company_id, new.project_id, 'absence_reported', 'Absence reported',
    format('An employee reported themselves absent for %s.', to_char(new.work_date, 'DD Mon YYYY')),
    format('/companies/%s/projects/%s/absences?date=%s', new.company_id, new.project_id, new.work_date)
  );
  return new;
end;
$$;

create trigger absence_reports_notify_managers
  after insert on public.absence_reports
  for each row execute function public.trg_notify_managers_of_absence_report();

create or replace function public.trg_notify_managers_of_leave_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or (old.status = 'returned' and new.status = 'pending') then
    perform public.notify_project_managers(
      new.company_id, new.project_id,
      case when tg_op = 'INSERT' then 'leave_request_submitted' else 'leave_request_resubmitted' end,
      case when tg_op = 'INSERT' then 'Leave request submitted' else 'Leave request resubmitted' end,
      format('%s – %s', to_char(new.start_date, 'DD Mon YYYY'), to_char(new.end_date, 'DD Mon YYYY')),
      format('/companies/%s/projects/%s/leave', new.company_id, new.project_id)
    );
  end if;
  return new;
end;
$$;

create trigger leave_requests_notify_managers_insert
  after insert on public.leave_requests
  for each row execute function public.trg_notify_managers_of_leave_request();

create trigger leave_requests_notify_managers_resubmit
  after update on public.leave_requests
  for each row
  when (old.status = 'returned' and new.status = 'pending')
  execute function public.trg_notify_managers_of_leave_request();

-- report_absence()/resubmit_leave_request() no longer need to (and, per
-- the bug above, cannot) send manager notifications themselves — the
-- triggers above now do it unconditionally and correctly on every insert/
-- resubmit, regardless of insert path (RPC or, in principle, a future
-- direct client insert). Redefined with the dead notification-loop
-- removed; every other check is unchanged.
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
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  insert into public.absence_reports (company_id, project_id, employee_id, work_date, reason, comment, reported_by)
  values (v_company_id, target_project_id, target_employee_id, target_work_date, target_reason, target_comment, auth.uid())
  returning * into v_result;

  return v_result;
end;
$$;

comment on function public.report_absence(uuid, uuid, date, public.absence_report_reason, text) is
  '"[ Report Absence ]" (Phase 7) — RLS''s absence_reports_insert policy (reported_by = auth.uid() AND the employee row belongs to the caller) is the real "cannot report for someone else" gate. Manager notification is handled by the absence_reports_notify_managers trigger, not here (SECURITY INVOKER cannot see other users'' profiles/insert notifications on their behalf — see this migration''s header).';

create or replace function public.resubmit_leave_request(target_request_id uuid, target_start_date date, target_end_date date, target_leave_type public.leave_type, target_comment text default null)
returns public.leave_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid;
  v_result public.leave_requests;
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

  return v_result;
end;
$$;

comment on function public.resubmit_leave_request(uuid, date, date, public.leave_type, text) is
  'Employee amends and resubmits a RETURNED request (Phase 8) — only the original requesting employee may call this (checked explicitly, on top of RLS). Manager notification is handled by the leave_requests_notify_managers_resubmit trigger, not here.';
