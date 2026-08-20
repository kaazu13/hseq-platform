-- ============================================================================
-- Part 12: notify the REQUESTER (not just managers) immediately on
-- submitting an absence report or leave request.
-- ============================================================================
-- approve_leave_request()/deny_leave_request()/return_leave_request() and
-- confirm_absence_report() (checked: all four already notify the
-- requesting employee on DECISION, linking to /my-leave) — what was
-- missing is a notification on SUBMISSION itself. Both trigger bodies
-- below are copied verbatim from 20260819093000 with one additional
-- insert appended; the manager-notification call itself is untouched.
--
-- link_path points at the new Account > Requests tab (Part 15,
-- app/(app)/account/requests/page.tsx) with a query param identifying
-- the exact request, so the notification never dead-links to a generic
-- list — clicking it opens/highlights this specific request.
-- ============================================================================

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

  insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
  select new.company_id, e.profile_id, 'absence_report_submitted', 'Your absence request has been sent',
    format('For %s.', to_char(new.work_date, 'DD Mon YYYY')),
    format('/account/requests?type=absence&id=%s', new.id)
  from public.employees e where e.id = new.employee_id and e.profile_id is not null;

  return new;
end;
$$;

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

    insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
    select new.company_id, e.profile_id,
      case when tg_op = 'INSERT' then 'leave_request_submitted_self' else 'leave_request_resubmitted_self' end,
      'Your holiday request has been sent',
      format('%s – %s', to_char(new.start_date, 'DD Mon YYYY'), to_char(new.end_date, 'DD Mon YYYY')),
      format('/account/requests?type=leave&id=%s', new.id)
    from public.employees e where e.id = new.employee_id and e.profile_id is not null;
  end if;
  return new;
end;
$$;

-- Both link_path columns for the DECISION notifications
-- (approve/deny/return) also get upgraded to the same deep-link shape —
-- previously a flat '/my-leave', which satisfied "no dead link" but not
-- "opens the exact request." Re-issuing each function with only its
-- notifications insert's link_path changed; every other line copied
-- verbatim from 20260819092000.
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
    format('%s – %s', to_char(v_result.start_date, 'DD Mon YYYY'), to_char(v_result.end_date, 'DD Mon YYYY')), format('/account/requests?type=leave&id=%s', v_result.id)
  from public.employees e where e.id = v_result.employee_id and e.profile_id is not null;

  return v_result;
end;
$$;

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
  select v_result.company_id, e.profile_id, 'leave_request_denied', 'Leave request denied', target_comment, format('/account/requests?type=leave&id=%s', v_result.id)
  from public.employees e where e.id = v_result.employee_id and e.profile_id is not null;

  return v_result;
end;
$$;

-- confirm_absence_report()/reject_absence_report() already notify the
-- employee (added 20260826090000; confirm_absence_report's signature was
-- further extended with target_reason by 20260901108000) — this only
-- upgrades their link_path from the flat '/dashboard' to the same
-- deep-link shape as everything else here. Every other line copied
-- verbatim from 20260901108000/20260826090000 respectively.
create or replace function public.confirm_absence_report(target_report_id uuid, target_reason text default null)
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
  perform public.set_daily_attendance_status(v_report.project_id, v_report.employee_id, v_report.work_date, v_status, v_report.comment, target_reason);

  update public.absence_reports
  set status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now()
  where id = target_report_id
  returning * into v_result;

  insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
  select v_result.company_id, e.profile_id, 'absence_report_confirmed', 'Absence approved',
    format('You are marked %s for %s.', v_status, to_char(v_result.work_date, 'DD Mon YYYY')),
    format('/account/requests?type=absence&id=%s', v_result.id)
  from public.employees e where e.id = v_result.employee_id and e.profile_id is not null;

  return v_result;
end;
$$;

comment on function public.confirm_absence_report(uuid, text) is
  'Manager confirms a self-reported absence — applies the resulting daily_attendance status and notifies the reporting employee, deep-linked to Account > Requests (20260902170000). target_reason is optional and only actually required (enforced by set_daily_attendance_status) when the employee already has submitted worked hours for that date that this will zero out.';

create or replace function public.reject_absence_report(target_report_id uuid, target_review_note text)
returns public.absence_reports
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_report public.absence_reports;
  v_result public.absence_reports;
begin
  if target_review_note is null or btrim(target_review_note) = '' then
    raise exception 'a review note is required to reject an absence report';
  end if;

  select * into v_report from public.absence_reports where id = target_report_id and status = 'pending';
  if v_report.id is null then
    raise exception 'open absence report % not found', target_report_id;
  end if;

  update public.absence_reports
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = target_review_note
  where id = target_report_id
  returning * into v_result;

  if v_result.id is null then
    raise exception 'open absence report % not found', target_report_id;
  end if;

  insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
  select v_result.company_id, e.profile_id, 'absence_report_rejected', 'Absence request rejected',
    format('Your absence report for %s was rejected. %s', to_char(v_result.work_date, 'DD Mon YYYY'), target_review_note),
    format('/account/requests?type=absence&id=%s', v_result.id)
  from public.employees e where e.id = v_result.employee_id and e.profile_id is not null;

  return v_result;
end;
$$;

comment on function public.reject_absence_report(uuid, text) is
  'Manager rejects a self-reported absence and notifies the reporting employee, deep-linked to Account > Requests (20260902170000), including the required review note.';

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
  select v_result.company_id, e.profile_id, 'leave_request_returned', 'Leave request returned for changes', target_comment, format('/account/requests?type=leave&id=%s', v_result.id)
  from public.employees e where e.id = v_result.employee_id and e.profile_id is not null;

  return v_result;
end;
$$;
