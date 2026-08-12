-- Item 1/9 of this milestone: the Team Edit dialog gains a Foreman field,
-- and the whole edit (name/shift/work_area/activity/foreman) must save
-- atomically — including rejecting a shift change that would collide with
-- another team's existing member, and correctly moving the old Foreman out
-- of the Foreman slot (never silently demoting them to a normal worker,
-- never leaving them assigned at all once replaced).
--
-- Bug fixed along the way: save_daily_team()'s edit branch changes
-- daily_teams.shift directly but NEVER updates the shift already
-- denormalized onto that team's current daily_team_members rows
-- (sync_daily_team_member_shift() only fires on INSERT, not UPDATE) — so
-- after an edit-path shift change, daily_team_members_one_open_per_slot's
-- per-employee slot could silently disagree with the team's own new shift.
-- update_daily_team_with_foreman() below both checks for and resyncs this.

create or replace function public.update_daily_team_with_foreman(
  target_daily_team_id uuid,
  target_project_id uuid,
  target_work_date date,
  target_name text,
  target_shift public.lmra_shift,
  target_foreman_employee_id uuid default null,
  target_work_area text default null,
  target_activity text default null
)
returns public.daily_teams
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_old_shift public.lmra_shift;
  v_member record;
  v_resync record;
  v_conflict_team_name text;
  v_conflict_employee_name text;
  v_shift_label text;
  v_team public.daily_teams;
begin
  if target_daily_team_id is null then
    raise exception 'a daily team id is required';
  end if;
  if target_name is null or btrim(target_name) = '' then
    raise exception 'a team name is required';
  end if;
  if target_shift is null then
    raise exception 'a shift is required';
  end if;

  select company_id, shift into v_company_id, v_old_shift
  from public.daily_teams
  where id = target_daily_team_id and project_id = target_project_id and work_date = target_work_date;

  if v_company_id is null then
    raise exception 'daily team % not found on % for project %', target_daily_team_id, target_work_date, target_project_id;
  end if;

  -- Foreman swap FIRST (item 9): old Foreman leaves the slot only when a
  -- DIFFERENT new foreman is supplied; a null target_foreman_employee_id
  -- leaves foreman assignment untouched entirely — the legacy/repair path
  -- for a team that has never had one. Doing this before the shift-conflict
  -- check below means that check evaluates the team's real POST-edit
  -- membership, so a foreman who is being replaced never causes a false
  -- rejection over a conflict that will not exist once they are gone.
  if target_foreman_employee_id is not null then
    if not public.is_eligible_scaffold_foreman(target_foreman_employee_id, v_company_id, target_project_id) then
      raise exception 'the selected employee does not hold the foreman role on this project';
    end if;

    perform public.move_daily_team_member(target_project_id, target_work_date, target_daily_team_id, target_foreman_employee_id, 'foreman');

    update public.daily_team_members
    set removed_at = now(), removed_by = auth.uid()
    where daily_team_id = target_daily_team_id
      and role = 'foreman'
      and employee_id <> target_foreman_employee_id
      and removed_at is null;
  end if;

  -- Shift-change conflict check (item 1's explicit "do NOT partially
  -- update the team" requirement): every CURRENTLY remaining member of
  -- this team (workers and foreman alike, post-swap) must be free to hold
  -- the new shift's slot. Any conflict aborts the whole function — since
  -- this all runs inside one statement/transaction, an unhandled
  -- exception here rolls back the foreman swap above too, so nothing is
  -- ever left half-applied.
  if target_shift is distinct from v_old_shift then
    v_shift_label := case target_shift when 'day' then 'Day Shift' when 'night' then 'Night Shift' when 'late' then 'Late Shift' end;

    for v_member in
      select dtm.employee_id
      from public.daily_team_members dtm
      where dtm.daily_team_id = target_daily_team_id and dtm.removed_at is null
    loop
      select dt2.name into v_conflict_team_name
      from public.daily_team_members dtm2
      join public.daily_teams dt2 on dt2.id = dtm2.daily_team_id
      where dtm2.project_id = target_project_id
        and dtm2.work_date = target_work_date
        and dtm2.employee_id = v_member.employee_id
        and dtm2.removed_at is null
        and dtm2.daily_team_id <> target_daily_team_id
        and public.lmra_shift_sort_key(dtm2.shift) = public.lmra_shift_sort_key(target_shift)
      limit 1;

      if v_conflict_team_name is not null then
        select first_name || ' ' || last_name into v_conflict_employee_name from public.employees where id = v_member.employee_id;
        raise exception '% is already assigned to % on %. Move/remove the conflicting worker before changing this team to %.',
          coalesce(v_conflict_employee_name, 'This employee'), v_conflict_team_name, v_shift_label, v_shift_label;
      end if;
    end loop;
  end if;

  update public.daily_teams
  set name = target_name, shift = target_shift, work_area = target_work_area, activity = target_activity, updated_by = auth.uid()
  where id = target_daily_team_id;

  -- Resync denormalized member shifts (the bug this migration fixes — see
  -- header comment): daily_team_members.shift is frozen against direct
  -- UPDATE by validate_daily_team_member_update() (deliberately — only
  -- removed_at/removed_by may ever change on an existing row), so bringing
  -- every current member's slot in line with the team's new shift means
  -- close-then-reinsert, exactly the same shape move_daily_team_member()
  -- already uses for every other membership change — never a second,
  -- divergent way to change a member's slot. The INSERT trigger
  -- (sync_daily_team_member_shift) denormalizes the team's shift — already
  -- updated above — onto each fresh row.
  if target_shift is distinct from v_old_shift then
    for v_resync in
      select id, employee_id, role
      from public.daily_team_members
      where daily_team_id = target_daily_team_id and removed_at is null
    loop
      update public.daily_team_members
      set removed_at = now(), removed_by = auth.uid()
      where id = v_resync.id;

      insert into public.daily_team_members (company_id, project_id, work_date, daily_team_id, employee_id, role, created_by)
      values (v_company_id, target_project_id, target_work_date, target_daily_team_id, v_resync.employee_id, v_resync.role, auth.uid());
    end loop;
  end if;

  select * into v_team from public.daily_teams where id = target_daily_team_id;
  return v_team;
end;
$$;

comment on function public.update_daily_team_with_foreman(uuid, uuid, date, text, public.lmra_shift, uuid, text, text) is
  'Item 1/9: the ONE atomic edit path for an EXISTING Today''s Team — name/shift/work_area/activity plus an optional Foreman change, all-or-nothing. A null target_foreman_employee_id leaves current foreman assignment untouched (legacy/repair-safe); a non-null one atomically swaps the Foreman slot (old Foreman removed, never demoted to a plain worker). A shift change that would collide with another team''s existing member for any of this team''s current employees is rejected with a specific, actionable message and leaves every field untouched (validate_daily_team_update()''s locked-team freeze and validate_daily_team_member_insert()''s locked/eligibility/attendance checks are unchanged and still apply underneath this).';

revoke all on function public.update_daily_team_with_foreman(uuid, uuid, date, text, public.lmra_shift, uuid, text, text) from public, anon;
grant execute on function public.update_daily_team_with_foreman(uuid, uuid, date, text, public.lmra_shift, uuid, text, text) to authenticated;
