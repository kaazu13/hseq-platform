-- Navigation/notifications/copy-teams milestone. Three independent pieces:
--
-- 1. notify_employee() — a generic SECURITY DEFINER helper (same
--    rolbypassrls mechanism as notify_project_managers(), see
--    20260819093000's header comment) that resolves ONE employee_id to its
--    linked profile_id and writes a notification, regardless of the
--    calling role's own notifications_insert privilege. Needed because
--    move_daily_team_member() and copy_daily_teams_to_date() (below) are
--    both callable by a project Foreman, who can never satisfy
--    notifications_insert's own role check directly.
--
-- 2. Absence/leave decision notifications: confirm_absence_report() and
--    reject_absence_report() currently write NO notification at all
--    (verified by reading their bodies — a real gap, not an oversight this
--    migration invents). Both are only ever callable by an
--    already-privileged manage-tier caller (same role set
--    notifications_insert requires), so a direct guarded INSERT — the
--    exact pattern approve/deny/return_leave_request() already use — is
--    sufficient; no SECURITY DEFINER indirection needed for these two.
--    cancel_leave_request() also writes no notification; it's callable by
--    EITHER the requesting employee or a manager, so the new insert is
--    guarded to only fire when the canceller is someone OTHER than the
--    employee themselves (a manager-initiated cancellation is a real
--    "decision"; a self-cancel isn't news to the person who just did it).
--
-- 3. Team assignment/change notifications — an AFTER INSERT trigger on
--    daily_team_members (SECURITY DEFINER, mirroring
--    absence_reports_notify_managers exactly), NOT inline logic inside
--    move_daily_team_member()/copy_daily_teams_to_date(). This was tried
--    inline first and reverted: move_daily_team_member() is (and must
--    remain) SECURITY INVOKER so RLS stays the real write gate on
--    daily_team_members, but a SECURITY INVOKER function calling
--    notify_employee() executes that call AS THE INVOKING USER, not as
--    notify_employee()'s owner — so notify_employee() would need EXECUTE
--    granted to authenticated to be callable at all, which would let ANY
--    authenticated user invoke it directly with an arbitrary employee_id/
--    title/body/link (real live-tested "permission denied for function
--    notify_employee" failure caught this before it shipped). A trigger
--    fires as its OWNER (postgres) regardless of who performed the
--    triggering INSERT, so it can call notify_employee() without any
--    grant — the same reason 20260819093000 moved absence/leave manager
--    notifications into triggers instead of inline RPC logic. This also
--    means copy_daily_teams_to_date() (below) gets team-assignment
--    notifications for free from the same trigger — no separate call
--    needed there either. The trigger determines "brand new assignment"
--    vs. "moved from a different team" by finding the most recently
--    CLOSED row for the exact same (project, work_date, shift, employee)
--    slot — safe and unambiguous because the partial unique index
--    guarantees at most one OPEN row per slot at any time, and
--    move_daily_team_member() always closes the old row in the same
--    transaction immediately before inserting the new one.
--
-- 4. copy_daily_teams_to_date() — "Copy Teams" (items 6-10). Copies one
--    source day's Foreman/team/worker structure onto ONE destination date,
--    re-validating every Foreman and worker against that destination
--    date's own real state (never a blind clone) — active project
--    assignment, employment status, and daily_attendance permits-work,
--    exactly the same checks validate_daily_team_member_insert() and
--    add_daily_team_foreman() already enforce, duplicated here as
--    pre-checks (not caught exceptions) so an unavailable person is
--    SKIPPED with a reason rather than aborting the whole copy. A
--    destination date that already has ANY daily_teams rows (open or
--    locked) is skipped wholesale by default — "never overwrite existing
--    teams by default" (item 10); this migration does not implement an
--    explicit-confirmation replace mode (out of scope for this pass, see
--    the milestone's final report). The TS layer calls this once per
--    destination date in a range and aggregates the per-date results —
--    keeping this function single-date keeps the "every destination date
--    validated independently" requirement (item 7) structurally true
--    rather than something a multi-date loop inside plpgsql could get
--    wrong.

create or replace function public.notify_employee(
  target_company_id uuid,
  target_recipient_employee_id uuid,
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
  v_recipient_user_id uuid;
begin
  select profile_id into v_recipient_user_id from public.employees where id = target_recipient_employee_id;
  if v_recipient_user_id is not null then
    insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
    values (target_company_id, v_recipient_user_id, notif_type, notif_title, notif_body, notif_link_path);
  end if;
end;
$$;

comment on function public.notify_employee(uuid, uuid, text, text, text, text) is
  'SECURITY DEFINER (owner postgres has rolbypassrls), mirroring notify_project_managers() — resolves ONE employee_id to its linked profile_id and writes a notification regardless of the calling role''s own notifications_insert privilege. Called ONLY from trg_notify_daily_team_member_assigned() (itself SECURITY DEFINER) — never granted to authenticated directly, since a SECURITY INVOKER caller would need its own EXECUTE grant, which would let any authenticated user invoke it directly with an arbitrary employee_id/title/body/link (see this migration''s header comment for why the inline-call approach was tried and reverted).';

revoke all on function public.notify_employee(uuid, uuid, text, text, text, text) from public, anon, authenticated;

-- ============================================================================
-- Absence decisions — confirm_absence_report()/reject_absence_report() now
-- notify the reporting employee. Both bodies are otherwise byte-for-byte
-- identical to 20260819092000_absence_and_leave.sql's originals.
-- ============================================================================
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

  insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
  select v_result.company_id, e.profile_id, 'absence_report_confirmed', 'Absence approved',
    format('You are marked %s for %s.', v_status, to_char(v_result.work_date, 'DD Mon YYYY')),
    '/dashboard'
  from public.employees e where e.id = v_result.employee_id and e.profile_id is not null;

  return v_result;
end;
$$;

comment on function public.confirm_absence_report(uuid) is
  'Manager confirms a self-reported absence — applies the resulting daily_attendance status and notifies the reporting employee. Caller is always manage-tier (RLS-checked elsewhere), same privilege notifications_insert itself requires, so this is a direct guarded INSERT — no SECURITY DEFINER indirection needed.';

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
    '/dashboard'
  from public.employees e where e.id = v_result.employee_id and e.profile_id is not null;

  return v_result;
end;
$$;

comment on function public.reject_absence_report(uuid, text) is
  'Manager rejects a self-reported absence and notifies the reporting employee, including the required review note. Direct guarded INSERT — same rationale as confirm_absence_report().';

-- ============================================================================
-- cancel_leave_request() — notify the employee only when someone OTHER
-- than themselves cancelled it (a manager-initiated cancellation is a real
-- decision worth notifying about; a self-cancel is not).
-- ============================================================================
create or replace function public.cancel_leave_request(target_request_id uuid)
returns public.leave_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request public.leave_requests;
  v_result public.leave_requests;
  v_employee_profile_id uuid;
begin
  select * into v_request from public.leave_requests where id = target_request_id and status in ('pending', 'approved', 'returned');
  if v_request.id is null then
    raise exception 'cancellable leave request % not found', target_request_id;
  end if;

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

  select profile_id into v_employee_profile_id from public.employees where id = v_result.employee_id;
  if v_employee_profile_id is not null and v_employee_profile_id is distinct from auth.uid() then
    insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
    values (
      v_result.company_id, v_employee_profile_id, 'leave_request_cancelled', 'Leave request cancelled',
      format('%s – %s', to_char(v_result.start_date, 'DD Mon YYYY'), to_char(v_result.end_date, 'DD Mon YYYY')),
      '/my-leave'
    );
  end if;

  return v_result;
end;
$$;

comment on function public.cancel_leave_request(uuid) is
  'Cancels a pending/approved/returned leave request — callable by either the requesting employee or a manager (leave_requests_update RLS). Notifies the employee only when the canceller is someone other than themselves (auth.uid() distinct from their own profile_id) — a self-cancel needs no notification, a manager-initiated one does. Direct guarded INSERT: whenever this fires, the caller is by definition NOT the recipient, so the caller''s own notifications_insert privilege is irrelevant to whether the recipient can receive it — but a manager caller already satisfies notifications_insert regardless.';

-- ============================================================================
-- move_daily_team_member() — byte-for-byte the same as 20260820090000's
-- version (re-declared here only so this migration's diff is
-- self-contained to read; no behavior change). Notification is now
-- entirely the trigger's job below.
-- ============================================================================
create or replace function public.move_daily_team_member(
  target_project_id uuid,
  target_work_date date,
  target_daily_team_id uuid,
  target_employee_id uuid,
  target_role public.team_assignment_role default 'member'
)
returns public.daily_team_members
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_shift public.lmra_shift;
  v_existing record;
  v_result public.daily_team_members;
begin
  select company_id, shift into v_company_id, v_shift from public.daily_teams where id = target_daily_team_id;
  if v_company_id is null then
    raise exception 'daily team % not found', target_daily_team_id;
  end if;

  select * into v_existing
  from public.daily_team_members
  where project_id = target_project_id
    and work_date = target_work_date
    and coalesce(shift::text, '') = coalesce(v_shift::text, '')
    and employee_id = target_employee_id
    and removed_at is null
  for update;

  if found then
    if v_existing.daily_team_id = target_daily_team_id and v_existing.role = target_role then
      return v_existing;
    end if;
    update public.daily_team_members
    set removed_at = now(), removed_by = auth.uid()
    where id = v_existing.id;
  end if;

  insert into public.daily_team_members (company_id, project_id, work_date, daily_team_id, employee_id, role, created_by)
  values (v_company_id, target_project_id, target_work_date, target_daily_team_id, target_employee_id, target_role, auth.uid())
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.move_daily_team_member(uuid, date, uuid, uuid, public.team_assignment_role) from public, anon;
grant execute on function public.move_daily_team_member(uuid, date, uuid, uuid, public.team_assignment_role) to authenticated;

-- ============================================================================
-- Team assignment/change notification trigger (items 13/14) — fires for
-- every new OPEN daily_team_members worker row, regardless of insert path
-- (move_daily_team_member() or copy_daily_teams_to_date()). Determines
-- "brand new" vs. "moved from a different team" by finding the most
-- recently CLOSED row for the exact same slot (see this file's header
-- comment for why that's safe/unambiguous). A same-team role change
-- (member -> foreman or back) closes-and-reinserts too, but the old and
-- new daily_team_id are equal in that case, so it falls into neither
-- branch below and is correctly never notified — idempotent saves and
-- pure role changes are both silent by construction, not by an extra
-- "did anything actually change" check.
-- ============================================================================
create or replace function public.trg_notify_daily_team_member_assigned()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_team_id uuid;
  v_old_team_name text;
  v_new_team record;
begin
  select daily_team_id into v_old_team_id
  from public.daily_team_members
  where project_id = new.project_id
    and work_date = new.work_date
    and coalesce(shift::text, '') = coalesce(new.shift::text, '')
    and employee_id = new.employee_id
    and id <> new.id
    and removed_at is not null
  order by removed_at desc
  limit 1;

  select name, work_area, activity, shift into v_new_team from public.daily_teams where id = new.daily_team_id;

  if v_old_team_id is not null and v_old_team_id is distinct from new.daily_team_id then
    select name into v_old_team_name from public.daily_teams where id = v_old_team_id;
    perform public.notify_employee(
      new.company_id, new.employee_id, 'daily_team_changed', 'Your team assignment changed',
      format('%s: moved from %s to %s. Shift: %s. Area: %s. Activity: %s.',
        to_char(new.work_date, 'DD Mon YYYY'), coalesce(v_old_team_name, 'Unknown'), v_new_team.name,
        coalesce(v_new_team.shift::text, '—'), coalesce(v_new_team.work_area, '—'), coalesce(v_new_team.activity, '—')),
      format('/companies/%s/projects/%s/teams?date=%s', new.company_id, new.project_id, new.work_date)
    );
  elsif v_old_team_id is null then
    perform public.notify_employee(
      new.company_id, new.employee_id, 'daily_team_assigned', format('You were assigned to %s', v_new_team.name),
      format('%s. Shift: %s. Area: %s. Activity: %s.',
        to_char(new.work_date, 'DD Mon YYYY'), coalesce(v_new_team.shift::text, '—'), coalesce(v_new_team.work_area, '—'), coalesce(v_new_team.activity, '—')),
      format('/companies/%s/projects/%s/teams?date=%s', new.company_id, new.project_id, new.work_date)
    );
  end if;

  return new;
end;
$$;

create trigger daily_team_members_notify_assignment
  after insert on public.daily_team_members
  for each row
  when (new.role = 'member' and new.removed_at is null)
  execute function public.trg_notify_daily_team_member_assigned();

-- ============================================================================
-- copy_daily_teams_to_date() — items 6-10.
-- ============================================================================
create or replace function public.copy_daily_teams_to_date(
  target_project_id uuid,
  target_source_work_date date,
  target_destination_work_date date
)
returns table (
  destination_work_date date,
  skipped_existing boolean,
  teams_created integer,
  workers_assigned integer,
  workers_skipped_unavailable integer,
  workers_skipped_already_assigned integer,
  teams_requiring_attention integer,
  skipped_worker_details jsonb,
  attention_team_details jsonb
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_existing_count integer;
  v_source_team record;
  v_source_worker record;
  v_new_team_id uuid;
  v_teams_created integer := 0;
  v_workers_assigned integer := 0;
  v_workers_skipped_unavailable integer := 0;
  v_workers_skipped_already_assigned integer := 0;
  v_teams_requiring_attention integer := 0;
  v_skipped_details jsonb := '[]'::jsonb;
  v_attention_details jsonb := '[]'::jsonb;
  v_foreman_ok boolean;
  v_worker_ok boolean;
  v_employee_name text;
  v_attendance_status public.daily_attendance_status;
  v_employment_status public.employment_status;
  v_archived_at timestamptz;
  v_has_active_assignment boolean;
  v_already_assigned boolean;
begin
  if target_destination_work_date = target_source_work_date then
    raise exception 'source and destination dates must differ';
  end if;

  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  perform public.assert_project_not_archived(target_project_id);

  select count(*) into v_existing_count
  from public.daily_teams
  where project_id = target_project_id and work_date = target_destination_work_date;

  if v_existing_count > 0 then
    return query select target_destination_work_date, true, 0, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb;
    return;
  end if;

  for v_source_team in
    select dt.*
    from public.daily_teams dt
    where dt.project_id = target_project_id and dt.work_date = target_source_work_date
    order by dt.display_order, dt.created_at
  loop
    v_foreman_ok := false;

    if v_source_team.foreman_employee_id is not null then
      select employment_status, archived_at into v_employment_status, v_archived_at
      from public.employees where id = v_source_team.foreman_employee_id;

      select status into v_attendance_status
      from public.daily_attendance
      where project_id = target_project_id and employee_id = v_source_team.foreman_employee_id and work_date = target_destination_work_date;

      if v_employment_status = 'active' and v_archived_at is null
         and public.is_eligible_scaffold_foreman(v_source_team.foreman_employee_id, v_company_id, target_project_id)
         and (v_attendance_status is null or public.daily_attendance_permits_work(v_attendance_status)) then
        v_foreman_ok := true;
      end if;
    end if;

    if not v_foreman_ok then
      v_teams_requiring_attention := v_teams_requiring_attention + 1;
      select first_name || ' ' || last_name into v_employee_name from public.employees where id = v_source_team.foreman_employee_id;
      v_attention_details := v_attention_details || jsonb_build_object(
        'sourceTeamName', v_source_team.name,
        'foremanEmployeeId', v_source_team.foreman_employee_id,
        'foremanName', coalesce(v_employee_name, 'Unknown'),
        'reason', 'foreman_unavailable'
      );
      continue;
    end if;

    insert into public.daily_team_foreman_roster (company_id, project_id, work_date, foreman_employee_id, created_by)
    values (v_company_id, target_project_id, target_destination_work_date, v_source_team.foreman_employee_id, auth.uid())
    on conflict (project_id, work_date, foreman_employee_id) do nothing;

    insert into public.daily_teams (company_id, project_id, work_date, name, shift, foreman_employee_id, work_area, activity, display_order, created_by, updated_by)
    values (v_company_id, target_project_id, target_destination_work_date, v_source_team.name, v_source_team.shift, v_source_team.foreman_employee_id, v_source_team.work_area, v_source_team.activity, v_source_team.display_order, auth.uid(), auth.uid())
    returning id into v_new_team_id;

    v_teams_created := v_teams_created + 1;

    for v_source_worker in
      select dtm.employee_id
      from public.daily_team_members dtm
      where dtm.daily_team_id = v_source_team.id and dtm.role = 'member' and dtm.removed_at is null
    loop
      select first_name || ' ' || last_name into v_employee_name from public.employees where id = v_source_worker.employee_id;

      select exists (
        select 1 from public.daily_team_members
        where project_id = target_project_id and work_date = target_destination_work_date
          and employee_id = v_source_worker.employee_id and removed_at is null
          and coalesce(shift::text, '') = coalesce(v_source_team.shift::text, '')
      ) into v_already_assigned;

      if v_already_assigned then
        v_workers_skipped_already_assigned := v_workers_skipped_already_assigned + 1;
        v_skipped_details := v_skipped_details || jsonb_build_object(
          'employeeId', v_source_worker.employee_id, 'name', coalesce(v_employee_name, 'Unknown'),
          'reason', 'already_assigned', 'teamName', v_source_team.name
        );
        continue;
      end if;

      select employment_status, archived_at into v_employment_status, v_archived_at
      from public.employees where id = v_source_worker.employee_id;

      select exists (
        select 1 from public.project_assignments
        where project_id = target_project_id and employee_id = v_source_worker.employee_id and end_at is null
      ) into v_has_active_assignment;

      select status into v_attendance_status
      from public.daily_attendance
      where project_id = target_project_id and employee_id = v_source_worker.employee_id and work_date = target_destination_work_date;

      v_worker_ok := v_employment_status = 'active' and v_archived_at is null and v_has_active_assignment
        and (v_attendance_status is null or public.daily_attendance_permits_work(v_attendance_status));

      if not v_worker_ok then
        v_workers_skipped_unavailable := v_workers_skipped_unavailable + 1;
        v_skipped_details := v_skipped_details || jsonb_build_object(
          'employeeId', v_source_worker.employee_id, 'name', coalesce(v_employee_name, 'Unknown'),
          'reason', 'unavailable', 'teamName', v_source_team.name,
          'attendanceStatus', v_attendance_status
        );
        continue;
      end if;

      begin
        insert into public.daily_team_members (company_id, project_id, work_date, daily_team_id, employee_id, role, created_by)
        values (v_company_id, target_project_id, target_destination_work_date, v_new_team_id, v_source_worker.employee_id, 'member', auth.uid());
        -- Notification is handled by daily_team_members_notify_assignment
        -- (the AFTER INSERT trigger) automatically — no separate call here.

        v_workers_assigned := v_workers_assigned + 1;
      exception when others then
        v_workers_skipped_unavailable := v_workers_skipped_unavailable + 1;
        v_skipped_details := v_skipped_details || jsonb_build_object(
          'employeeId', v_source_worker.employee_id, 'name', coalesce(v_employee_name, 'Unknown'),
          'reason', 'other', 'teamName', v_source_team.name, 'detail', sqlerrm
        );
      end;
    end loop;
  end loop;

  return query select target_destination_work_date, false, v_teams_created, v_workers_assigned, v_workers_skipped_unavailable, v_workers_skipped_already_assigned, v_teams_requiring_attention, v_skipped_details, v_attention_details;
end;
$$;

comment on function public.copy_daily_teams_to_date(uuid, date, date) is
  'Items 6-10: copies one source day''s Foreman/team/worker structure onto ONE destination date, re-validating every Foreman and worker against the destination date''s own real state (employment status, active project assignment, daily_attendance permits-work) rather than blindly cloning. An unavailable Foreman means that source team is entirely skipped and reported as "requires attention" — never a team created without a valid Foreman. A destination date that already has any daily_teams rows (open or locked) is skipped wholesale (never overwrites by default). SECURITY INVOKER — the caller''s own RLS on daily_teams/daily_team_members/daily_team_foreman_roster is the real write gate, same as every other daily-workforce RPC; the app layer additionally restricts this to manage-tier callers (see requireDailyWorkforceManageAccess), same as lock/unlock.';

revoke all on function public.copy_daily_teams_to_date(uuid, date, date) from public, anon;
grant execute on function public.copy_daily_teams_to_date(uuid, date, date) to authenticated;
