-- ============================================================================
-- Workforce attendance correction (Part G) — always notify the employee
-- ============================================================================
-- set_daily_attendance_status() previously only notified the affected
-- employee when their status change ALSO zeroed out already-submitted
-- worked hours — a plain retroactive correction (e.g. "you were actually
-- marked Absent for yesterday, not At Work") never notified them at all.
-- daily_attendance's INSERT/UPDATE RLS grants write access only to
-- company_admin/operations_manager/the project's own project_manager/
-- platform_super_admin (never the employee's own row) — every call to
-- this RPC is therefore, by construction, a manager-initiated change to
-- someone ELSE's record, so notifying "whenever the status actually
-- changed" is always correct here, never a false positive on the
-- employee's own self-service action.
-- ============================================================================
create or replace function public.set_daily_attendance_status(
  target_project_id uuid,
  target_employee_id uuid,
  target_work_date date,
  target_status public.daily_attendance_status,
  target_note text default null,
  target_reason text default null
)
returns table (attendance public.daily_attendance, removed_from_team_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_existing public.daily_attendance;
  v_attendance public.daily_attendance;
  v_removed_team_id uuid;
  v_is_closed boolean;
  v_worked_hours public.worked_hours;
  v_category record;
  v_any_hours_correction boolean := false;
  v_new_total numeric;
  v_recipient_user_id uuid;
  v_status_changed boolean;
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

  v_status_changed := v_existing.id is not null and v_existing.status is distinct from target_status;

  if v_is_closed then
    if v_existing.id is null then
      raise exception 'this absence day is closed — reopen it first to add a new attendance record';
    end if;
    if v_status_changed then
      if target_reason is null or btrim(target_reason) = '' then
        raise exception 'a reason is required to correct attendance on a closed absence day';
      end if;
      insert into public.daily_attendance_corrections (company_id, project_id, employee_id, work_date, previous_status, new_status, reason, changed_by)
      values (v_company_id, target_project_id, target_employee_id, target_work_date, v_existing.status, target_status, target_reason, auth.uid());
    end if;
  end if;

  insert into public.daily_attendance (company_id, project_id, employee_id, work_date, status, note, created_by, updated_by)
  values (v_company_id, target_project_id, target_employee_id, target_work_date, target_status, target_note, auth.uid(), auth.uid())
  on conflict (project_id, employee_id, work_date)
  do update set status = excluded.status, note = excluded.note, updated_by = auth.uid()
  returning * into v_attendance;

  -- NEW: notify the employee whenever a manager actually changed their
  -- recorded status for a date (never on a first-time set with no prior
  -- row, and never a duplicate notification for the hours-zeroing case
  -- below, which already sends its own more specific message).
  if v_status_changed then
    select e.profile_id into v_recipient_user_id from public.employees e where e.id = target_employee_id;
    if v_recipient_user_id is not null then
      insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
      values (
        v_company_id,
        v_recipient_user_id,
        'attendance_corrected',
        'Your attendance was updated',
        format('%s: changed from %s to %s.%s', to_char(target_work_date, 'DD Mon YYYY'), v_existing.status, target_status, case when target_reason is not null and btrim(target_reason) <> '' then ' Reason: ' || target_reason else '' end),
        '/teams'
      );
    end if;
  end if;

  if not public.daily_attendance_permits_work(target_status) then
    with removed as (
      update public.daily_team_members
      set removed_at = now(), removed_by = auth.uid()
      where project_id = target_project_id
        and employee_id = target_employee_id
        and work_date = target_work_date
        and removed_at is null
        and daily_team_id in (select id from public.daily_teams where status = 'open')
      returning daily_team_id
    )
    select daily_team_id into v_removed_team_id from removed limit 1;

    select * into v_worked_hours
    from public.worked_hours
    where project_id = target_project_id and employee_id = target_employee_id and work_date = target_work_date
    for update;

    if v_worked_hours.id is not null then
      for v_category in
        select category, hours from public.worked_hours_breakdown where worked_hours_id = v_worked_hours.id and hours <> 0
      loop
        if v_worked_hours.status = 'submitted' then
          if target_reason is null or btrim(target_reason) = '' then
            raise exception 'a reason is required — marking this employee % will zero out % already-submitted worked hours', target_status, v_category.hours;
          end if;
          insert into public.worked_hours_corrections (company_id, worked_hours_id, project_id, employee_id, category, previous_hours, new_hours, reason, changed_by)
          values (v_company_id, v_worked_hours.id, target_project_id, target_employee_id, v_category.category, v_category.hours, 0, target_reason, auth.uid());
          v_any_hours_correction := true;
        end if;

        update public.worked_hours_breakdown
        set hours = 0, updated_by = auth.uid(), updated_at = now()
        where worked_hours_id = v_worked_hours.id and category = v_category.category;
      end loop;

      if v_any_hours_correction then
        select coalesce(sum(hours), 0) into v_new_total from public.worked_hours_breakdown where worked_hours_id = v_worked_hours.id;
        select e.profile_id into v_recipient_user_id from public.employees e where e.id = target_employee_id;
        if v_recipient_user_id is not null then
          insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
          values (
            v_company_id,
            v_recipient_user_id,
            'worked_hours_corrected',
            'Worked hours reset to 0.0h',
            format('%s: marked %s. Reason: %s', to_char(target_work_date, 'DD Mon YYYY'), target_status, target_reason),
            '/my-hours'
          );
        end if;
      end if;
    end if;
  end if;

  return query select v_attendance, v_removed_team_id;
end;
$$;

comment on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text) is
  'The sole write path for daily_attendance status. Free edit on an OPEN day; a reason is required and audited (daily_attendance_corrections) on a CLOSED one. Notifies the affected employee (type=attendance_corrected) whenever their status actually changes (Part G) — daily_attendance''s own write RLS only ever grants managers/platform_super_admin, so every call here is inherently a change to someone else''s record. Transitioning to a status that does not permit work ALSO atomically removes any OPEN-team daily_team_members row(s) for that (project, employee, work_date) and zeroes every nonzero worked_hours_breakdown category, with its own separate worked_hours_corrected notification when hours were already submitted. RLS on every touched table is the real gate.';

revoke all on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text) from public, anon;
grant execute on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text) to authenticated;
