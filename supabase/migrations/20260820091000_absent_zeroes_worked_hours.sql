-- Item 1: an employee marked with a status that does not permit work
-- (absent, sick, leave, training, off_site) must not retain nonzero
-- worked hours for that (project, work_date) — server/database-enforced,
-- not only in the UI. Draft hours are zeroed silently; SUBMITTED hours
-- require the same `target_reason` set_daily_attendance_status() already
-- takes for a closed-day correction, are recorded as an audited
-- worked_hours_corrections entry per nonzero category, and notify the
-- employee. Changing back to a work-permitting status never restores the
-- old values — the breakdown rows are genuinely zeroed, not merely
-- hidden, so there is nothing to "restore" even if that were attempted.
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

  if v_is_closed then
    if v_existing.id is null then
      raise exception 'this absence day is closed — reopen it first to add a new attendance record';
    end if;
    if v_existing.status is distinct from target_status then
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

  if not public.daily_attendance_permits_work(target_status) then
    update public.daily_team_members
    set removed_at = now(), removed_by = auth.uid()
    where project_id = target_project_id
      and employee_id = target_employee_id
      and work_date = target_work_date
      and removed_at is null
    returning daily_team_id into v_removed_team_id;

    -- Item 1: zero out worked hours for this employee/project/date. Lock
    -- the parent worked_hours row first (mirrors upsert_worked_hours_categories()'s
    -- own for-update discipline) so this can never race a concurrent
    -- hours edit.
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
  'The sole write path for daily_attendance status. Free edit on an OPEN day; a reason is required and audited (daily_attendance_corrections) on a CLOSED one. Item 1: transitioning to a status that does not permit work ALSO atomically removes any open Today''s Team membership AND zeroes every nonzero worked_hours_breakdown category for that (project, employee, work_date) — silently if the hours were still draft, with a required reason + worked_hours_corrections audit row + employee notification if they were already submitted. Changing back to a work-permitting status never restores the old values (they were genuinely zeroed, not hidden) — a PM must deliberately re-enter hours. RLS on every touched table is the real gate.';

revoke all on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text) from public, anon;
grant execute on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text) to authenticated;

-- ============================================================================
-- Prevent NEW worked hours from being entered while an employee's
-- attendance status for that exact date does not permit work — closes the
-- other half of item 1 ("prevent new worked hours from being entered
-- while that unavailable status remains"). Zero-value entries are still
-- allowed through (a no-op / explicit re-zero), so this can never
-- deadlock against the zeroing logic above.
-- ============================================================================
create or replace function public.upsert_worked_hours_categories(
  target_project_id uuid,
  target_employee_id uuid,
  target_work_date date,
  target_categories jsonb,
  target_note text default null,
  target_reason text default null
)
returns public.worked_hours
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_worked_hours public.worked_hours;
  v_old_total numeric;
  v_entry record;
  v_existing_hours numeric;
  v_any_correction boolean := false;
  v_recipient_user_id uuid;
  v_new_total numeric;
  v_attendance_status public.daily_attendance_status;
  v_requested_total numeric;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  select status into v_attendance_status
  from public.daily_attendance
  where project_id = target_project_id and employee_id = target_employee_id and work_date = target_work_date;

  if v_attendance_status is not null and not public.daily_attendance_permits_work(v_attendance_status) then
    select coalesce(sum((x.hours)), 0) into v_requested_total
    from jsonb_to_recordset(target_categories) as x(category public.worked_hours_category, hours numeric);

    if v_requested_total <> 0 then
      raise exception 'cannot enter worked hours — this employee is marked % for %', v_attendance_status, target_work_date;
    end if;
  end if;

  select * into v_worked_hours
  from public.worked_hours
  where project_id = target_project_id and employee_id = target_employee_id and work_date = target_work_date
  for update;

  if not found then
    insert into public.worked_hours (company_id, project_id, employee_id, work_date, hours, note, created_by, updated_by)
    values (v_company_id, target_project_id, target_employee_id, target_work_date, 0, target_note, auth.uid(), auth.uid())
    returning * into v_worked_hours;
  end if;

  v_old_total := v_worked_hours.hours;

  for v_entry in select * from jsonb_to_recordset(target_categories) as x(category public.worked_hours_category, hours numeric)
  loop
    select hours into v_existing_hours from public.worked_hours_breakdown where worked_hours_id = v_worked_hours.id and category = v_entry.category;

    if v_existing_hours is distinct from v_entry.hours then
      if v_worked_hours.status = 'submitted' then
        if target_reason is null or btrim(target_reason) = '' then
          raise exception 'a reason is required to correct already-submitted worked hours';
        end if;

        insert into public.worked_hours_corrections (company_id, worked_hours_id, project_id, employee_id, category, previous_hours, new_hours, reason, changed_by)
        values (v_company_id, v_worked_hours.id, target_project_id, target_employee_id, v_entry.category, coalesce(v_existing_hours, 0), v_entry.hours, target_reason, auth.uid());
        v_any_correction := true;
      end if;

      insert into public.worked_hours_breakdown (company_id, project_id, worked_hours_id, category, hours, created_by, updated_by)
      values (v_company_id, target_project_id, v_worked_hours.id, v_entry.category, v_entry.hours, auth.uid(), auth.uid())
      on conflict (worked_hours_id, category) do update set hours = excluded.hours, updated_by = auth.uid(), updated_at = now();
    end if;
  end loop;

  if target_note is not null then
    update public.worked_hours set note = target_note, updated_by = auth.uid() where id = v_worked_hours.id;
  end if;

  if v_any_correction then
    select coalesce(sum(hours), 0) into v_new_total from public.worked_hours_breakdown where worked_hours_id = v_worked_hours.id;
    select e.profile_id into v_recipient_user_id from public.employees e where e.id = target_employee_id;
    if v_recipient_user_id is not null then
      insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
      values (
        v_company_id,
        v_recipient_user_id,
        'worked_hours_corrected',
        'Worked hours updated',
        format('%s: total %s h -> %s h. Reason: %s', to_char(target_work_date, 'DD Mon YYYY'), v_old_total, v_new_total, target_reason),
        '/my-hours'
      );
    end if;
  end if;

  select * into v_worked_hours from public.worked_hours where id = v_worked_hours.id;
  return v_worked_hours;
end;
$$;

comment on function public.upsert_worked_hours_categories(uuid, uuid, date, jsonb, text, text) is
  'Item 1: rejects a nonzero category total while the employee''s daily_attendance for this exact date does not permit work (a plain re-save of all-zero values is still allowed, so this can never conflict with set_daily_attendance_status()''s own zeroing pass). Otherwise unchanged from the prior version — free edit on a DRAFT row, reasoned correction required on a SUBMITTED one.';

revoke all on function public.upsert_worked_hours_categories(uuid, uuid, date, jsonb, text, text) from public, anon;
grant execute on function public.upsert_worked_hours_categories(uuid, uuid, date, jsonb, text, text) to authenticated;

create or replace function public.bulk_apply_worked_hours(
  target_project_id uuid,
  target_work_date date,
  target_category public.worked_hours_category,
  target_hours numeric,
  target_employee_ids uuid[]
)
returns setof public.worked_hours
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_employee_id uuid;
  v_worked_hours_id uuid;
  v_status public.worked_hours_status;
  v_attendance_status public.daily_attendance_status;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  foreach v_employee_id in array target_employee_ids loop
    begin
      select status into v_attendance_status
      from public.daily_attendance
      where project_id = target_project_id and employee_id = v_employee_id and work_date = target_work_date;

      -- Item 1: "do not apply hours to absent/unavailable employees" —
      -- skip them silently, same partial-batch-tolerance shape as the
      -- existing 24h-cap/already-submitted skip below (never fails the
      -- whole batch for one ineligible employee).
      if v_attendance_status is not null and not public.daily_attendance_permits_work(v_attendance_status) and target_hours <> 0 then
        continue;
      end if;

      insert into public.worked_hours (company_id, project_id, employee_id, work_date, hours, created_by, updated_by)
      values (v_company_id, target_project_id, v_employee_id, target_work_date, 0, auth.uid(), auth.uid())
      on conflict (project_id, employee_id, work_date) do nothing;

      select id, status into v_worked_hours_id, v_status
      from public.worked_hours
      where project_id = target_project_id and employee_id = v_employee_id and work_date = target_work_date;

      if v_status = 'draft' then
        insert into public.worked_hours_breakdown (company_id, project_id, worked_hours_id, category, hours, created_by, updated_by)
        values (v_company_id, target_project_id, v_worked_hours_id, target_category, target_hours, auth.uid(), auth.uid())
        on conflict (worked_hours_id, category) do update
          set hours = excluded.hours, updated_by = auth.uid(), updated_at = now();
      end if;
    exception when raise_exception then
      -- 24h cap exceeded for this one employee (sync_worked_hours_total())
      -- — skip them, continue applying to the rest of the batch.
      continue;
    end;
  end loop;

  return query
  select * from public.worked_hours
  where project_id = target_project_id and work_date = target_work_date and employee_id = any (target_employee_ids);
end;
$$;

comment on function public.bulk_apply_worked_hours(uuid, date, public.worked_hours_category, numeric, uuid[]) is
  'The "Apply [X] [Category] to all" bulk action — upserts ONE category''s hours as a DRAFT value for every listed employee. An employee who already has SUBMITTED hours, for whom this would exceed the 24h/day cap, OR who is currently marked with a status that does not permit work (item 1) is left untouched rather than failing the whole batch.';

revoke all on function public.bulk_apply_worked_hours(uuid, date, public.worked_hours_category, numeric, uuid[]) from public, anon;
grant execute on function public.bulk_apply_worked_hours(uuid, date, public.worked_hours_category, numeric, uuid[]) to authenticated;
