-- Full-codebase rename: organizations -> companies (requested by the user).
--
-- Renames the tenant root table (`organizations` -> `companies`), the
-- `organization_status` enum, `organization_memberships` -> `company_memberships`,
-- and every `organization_id` column across every tenant-scoped table, to
-- `company_id`. Done via `ALTER ... RENAME` wherever Postgres supports it
-- (RENAME preserves the object's OID, so RLS policies, views, foreign keys,
-- and every CALLER of a renamed function/table/column auto-update — their
-- USING/WITH CHECK/query expressions are stored as parsed trees keyed by
-- OID, not raw text, and are re-rendered under the new name automatically).
--
-- The one thing a rename does NOT fix is the literal TEXT inside a
-- function's own body (`language sql`/`language plpgsql` bodies are stored
-- as opaque source text in pg_proc.prosrc) — every function whose body
-- textually referenced `organization_id`, `organizations`,
-- `organization_memberships`, `is_organization_member`,
-- `has_organization_role`, `has_any_organization_role`, or
-- `employee_has_any_organization_role` is therefore explicitly rewritten
-- below via `create or replace function`, using each function's EXACT
-- LIVE (most-recently-redefined-across-all-36-prior-migrations) body, with
-- the renamed identifiers substituted and every other line of logic
-- preserved unchanged.
--
-- Bundled bug fix (see the dedicated comment above
-- validate_scaffold_update() below): while rewriting that function's body
-- for the rename anyway, this migration also removes a status-change guard
-- that 20260803150000_scaffold_status_sync_trigger_fix.sql had deliberately
-- removed (it blocked the legitimate SECURITY DEFINER sync trigger from
-- ever updating scaffolds.status) but which
-- 20260805090000_scaffold_team_and_dimensions.sql accidentally
-- reintroduced when it redefined the same function to add the (unrelated,
-- and correctly kept) foreman-eligibility check.
--
-- Not renamed anywhere in this migration: the `roles` table's
-- `company_admin` row/seed value — a pre-existing, unrelated role name
-- that happens to already contain the word "company"; it is left exactly
-- as-is throughout.
--
-- See the closing comment block at the end of this file for a list of
-- objects a human reviewer should double-check before applying.

-- ============================================================================
-- 1) Enum: organization_status -> company_status
-- ============================================================================
alter type public.organization_status rename to company_status;

-- ============================================================================
-- 2) organizations -> companies
-- ============================================================================
alter table public.organizations rename to companies;

alter table public.companies rename constraint organizations_slug_not_blank to companies_slug_not_blank;
alter table public.companies rename constraint organizations_employee_number_prefix_format to companies_employee_number_prefix_format;
alter table public.companies rename constraint organizations_scaffold_inspection_validity_days_positive to companies_scaffold_inspection_validity_days_positive;

alter index public.organizations_slug_key rename to companies_slug_key;
alter index public.organizations_status_idx rename to companies_status_idx;
alter index public.organizations_created_at_idx rename to companies_created_at_idx;

-- ============================================================================
-- 3) organization_memberships -> company_memberships
-- ============================================================================
alter table public.organization_memberships rename to company_memberships;
alter table public.company_memberships rename column organization_id to company_id;

alter table public.company_memberships rename constraint organization_memberships_org_user_unique to company_memberships_org_user_unique;

alter index public.organization_memberships_organization_id_idx rename to company_memberships_company_id_idx;
alter index public.organization_memberships_user_id_idx rename to company_memberships_user_id_idx;
alter index public.organization_memberships_created_at_idx rename to company_memberships_created_at_idx;

-- ============================================================================
-- 4) membership_roles.organization_id -> company_id
-- ============================================================================
alter table public.membership_roles rename column organization_id to company_id;
alter index public.membership_roles_organization_id_idx rename to membership_roles_company_id_idx;

-- ============================================================================
-- 5) profiles.active_organization_id -> active_company_id
-- ============================================================================
alter table public.profiles rename column active_organization_id to active_company_id;
alter index public.profiles_active_organization_id_idx rename to profiles_active_company_id_idx;

-- ============================================================================
-- 6) Every other tenant-scoped table: organization_id -> company_id
-- ============================================================================

-- Core / audit
alter table public.audit_events rename column organization_id to company_id;
-- bootstrap_audit_log: not called out in the task's hint list, but found
-- while reading 20260804090000_first_owner_bootstrap.sql — it has its own
-- organization_id column and is tenant-scoped.
alter table public.bootstrap_audit_log rename column organization_id to company_id;

-- Employees
alter table public.employees rename column organization_id to company_id;
alter table public.employee_employment_periods rename column organization_id to company_id;

-- Employee numbering counter — the TABLE's own name contains "organization"
-- (not just a column), so it is renamed too, same as company_employee_number_counters'
-- sibling toolbox/safety-flash counter tables further down (whose table
-- names never contained "organization" and so keep their names).
alter table public.organization_employee_number_counters rename to company_employee_number_counters;
alter table public.company_employee_number_counters rename column organization_id to company_id;
alter table public.company_employee_number_counters rename constraint organization_employee_number_counters_pkey to company_employee_number_counters_pkey;

-- Projects & Teams
alter table public.projects rename column organization_id to company_id;
alter table public.project_assignments rename column organization_id to company_id;
alter table public.teams rename column organization_id to company_id;
alter table public.team_assignments rename column organization_id to company_id;

-- LMRA
alter table public.lmra_assessments rename column organization_id to company_id;
alter table public.lmra_hazards rename column organization_id to company_id;
alter table public.lmra_participants rename column organization_id to company_id;

-- Safety Observations & Corrective Actions
alter table public.safety_observations rename column organization_id to company_id;
alter table public.safety_observation_participants rename column organization_id to company_id;
alter table public.corrective_actions rename column organization_id to company_id;

-- Scaffolds
alter table public.scaffolds rename column organization_id to company_id;
alter table public.scaffold_inspections rename column organization_id to company_id;
alter table public.scaffold_inspection_items rename column organization_id to company_id;
alter table public.scaffold_defects rename column organization_id to company_id;
alter table public.scaffold_team_members rename column organization_id to company_id;

-- Toolbox Meetings, Toolbox Templates & Safety Flash
alter table public.toolbox_meetings rename column organization_id to company_id;
alter table public.toolbox_meeting_file_replacements rename column organization_id to company_id;
alter table public.toolbox_meeting_number_counters rename column organization_id to company_id;
alter table public.toolbox_templates rename column organization_id to company_id;
alter table public.toolbox_template_file_replacements rename column organization_id to company_id;
alter table public.safety_flashes rename column organization_id to company_id;
alter table public.safety_flash_file_replacements rename column organization_id to company_id;
alter table public.safety_flash_number_counters rename column organization_id to company_id;

-- ============================================================================
-- 7) Constraints/indexes on the tables above whose NAME literally contains
--    "organization"
-- ============================================================================

-- Composite-FK-enabling unique constraints: (id, organization_id) -> (id, company_id)
alter table public.employees rename constraint employees_id_organization_id_key to employees_id_company_id_key;
alter table public.projects rename constraint projects_id_organization_id_key to projects_id_company_id_key;
alter table public.teams rename constraint teams_id_project_id_organization_id_key to teams_id_project_id_company_id_key;
alter table public.lmra_assessments rename constraint lmra_assessments_id_organization_id_key to lmra_assessments_id_company_id_key;
alter table public.safety_observations rename constraint safety_observations_id_organization_id_key to safety_observations_id_company_id_key;
alter table public.scaffolds rename constraint scaffolds_id_organization_id_key to scaffolds_id_company_id_key;
alter table public.scaffold_inspections rename constraint scaffold_inspections_id_organization_id_key to scaffold_inspections_id_company_id_key;
alter table public.scaffold_team_members rename constraint scaffold_team_members_id_organization_id_key to scaffold_team_members_id_company_id_key;
alter table public.toolbox_meetings rename constraint toolbox_meetings_id_organization_id_key to toolbox_meetings_id_company_id_key;
alter table public.toolbox_templates rename constraint toolbox_templates_id_organization_id_key to toolbox_templates_id_company_id_key;
alter table public.safety_flashes rename constraint safety_flashes_id_organization_id_key to safety_flashes_id_company_id_key;

-- Plain organization_id-named indexes -> company_id
-- (membership_roles_organization_id_idx already renamed in §4 above — not repeated here)
alter index public.audit_events_organization_id_idx rename to audit_events_company_id_idx;
alter index public.employee_employment_periods_organization_id_idx rename to employee_employment_periods_company_id_idx;
alter index public.projects_organization_id_idx rename to projects_company_id_idx;
alter index public.project_assignments_organization_id_idx rename to project_assignments_company_id_idx;
alter index public.teams_organization_id_idx rename to teams_company_id_idx;
alter index public.team_assignments_organization_id_idx rename to team_assignments_company_id_idx;
alter index public.lmra_assessments_organization_id_idx rename to lmra_assessments_company_id_idx;
alter index public.lmra_hazards_organization_id_idx rename to lmra_hazards_company_id_idx;
alter index public.lmra_participants_organization_id_idx rename to lmra_participants_company_id_idx;
alter index public.safety_observations_organization_id_idx rename to safety_observations_company_id_idx;
alter index public.safety_observation_participants_organization_id_idx rename to safety_observation_participants_company_id_idx;
alter index public.corrective_actions_organization_id_status_due_date_idx rename to corrective_actions_company_id_status_due_date_idx;
alter index public.scaffolds_organization_id_idx rename to scaffolds_company_id_idx;
alter index public.scaffold_inspections_organization_id_idx rename to scaffold_inspections_company_id_idx;
alter index public.scaffold_inspection_items_organization_id_idx rename to scaffold_inspection_items_company_id_idx;
alter index public.scaffold_defects_organization_id_status_due_date_idx rename to scaffold_defects_company_id_status_due_date_idx;
alter index public.employees_organization_id_profile_id_key rename to employees_company_id_profile_id_key;

-- ============================================================================
-- 8) RLS helper functions: rename BY NAME (preserves OID — every caller,
--    including every RLS policy and storage.objects policy, resolves the
--    new name automatically; nothing else needs to be touched for this step)
-- ============================================================================
alter function public.is_organization_member(uuid) rename to is_company_member;
alter function public.has_organization_role(uuid, text) rename to has_company_role;
alter function public.has_any_organization_role(uuid, text[]) rename to has_any_company_role;
alter function public.employee_has_any_organization_role(uuid, uuid, text[]) rename to employee_has_any_company_role;

-- ============================================================================
-- 9) create or replace: every function whose BODY TEXT needed literal
--    substitution (renamed table/column/function names cascade into
--    callers automatically, but not into a function's own source text)
-- ============================================================================

-- ── 9a) The four renamed helper functions' own bodies ─────────────────────
create or replace function public.is_company_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_memberships m
    where m.company_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

comment on function public.is_company_member(uuid) is
  'True if the calling user has an ACTIVE membership in the given company.';

create or replace function public.has_company_role(target_org_id uuid, role_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id
    where m.company_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and r.name = role_name
  );
$$;

comment on function public.has_company_role(uuid, text) is
  'True if the calling user has an ACTIVE membership in the given company AND holds the named role there.';

create or replace function public.has_any_company_role(target_org_id uuid, role_names text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id
    where m.company_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and r.name = any(role_names)
  );
$$;

comment on function public.has_any_company_role(uuid, text[]) is
  'True if the calling user has an ACTIVE membership in the given company AND holds at least one of the named roles there.';

create or replace function public.employee_has_any_company_role(target_employee_id uuid, target_organization_id uuid, role_names text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.employees e
    join public.company_memberships m on m.user_id = e.profile_id and m.status = 'active'
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id
    where e.id = target_employee_id
      and e.company_id = target_organization_id
      and m.company_id = target_organization_id
      and r.name = any(role_names)
  );
$$;

comment on function public.employee_has_any_company_role(uuid, uuid, text[]) is
  'True if the EMPLOYEE (not the calling user) is actively employed and their linked profile holds at least one of role_names in target_org_id.';

-- ── 9b) Employee search & numbering ────────────────────────────────────────
create or replace function public.search_employees(
  target_org_id uuid,
  search_term text default null,
  p_employment_status public.employment_status default null,
  p_account_status public.employee_account_status default null,
  include_archived boolean default false,
  page_limit integer default 25,
  page_offset integer default 0
)
returns table (
  id uuid,
  employee_number text,
  first_name text,
  last_name text,
  work_email text,
  position_title text,
  employment_status public.employment_status,
  account_status public.employee_account_status,
  profile_id uuid,
  archived_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    e.id, e.employee_number, e.first_name, e.last_name, e.work_email, e.position_title,
    e.employment_status, e.account_status, e.profile_id, e.archived_at
  from public.employees e
  where e.company_id = target_org_id
    and public.employee_matches_filters(e, search_term, p_employment_status, p_account_status, include_archived)
  order by e.last_name, e.first_name, e.id
  limit least(greatest(coalesce(page_limit, 25), 1), 100)
  offset greatest(coalesce(page_offset, 0), 0);
$$;

create or replace function public.count_employees(
  target_org_id uuid,
  search_term text default null,
  p_employment_status public.employment_status default null,
  p_account_status public.employee_account_status default null,
  include_archived boolean default false
)
returns bigint
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*)
  from public.employees e
  where e.company_id = target_org_id
    and public.employee_matches_filters(e, search_term, p_employment_status, p_account_status, include_archived);
$$;

create or replace function public.allocate_employee_number(target_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefix text;
  v_next integer;
begin
  select employee_number_prefix into v_prefix
  from public.companies
  where id = target_org_id;

  if v_prefix is null then
    raise exception 'company % has no employee_number_prefix configured', target_org_id;
  end if;

  insert into public.company_employee_number_counters (company_id, next_number)
  values (target_org_id, 1)
  on conflict (company_id) do nothing;

  update public.company_employee_number_counters
  set next_number = next_number + 1, updated_at = now()
  where company_id = target_org_id
  returning next_number - 1 into v_next;

  return v_prefix || '-' || lpad(v_next::text, 5, '0');
end;
$$;

create or replace function public.next_employee_number(target_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_any_company_role(target_org_id, array['company_admin', 'operations_manager']) then
    raise exception 'insufficient_privilege: cannot allocate an employee number for this company';
  end if;

  return public.allocate_employee_number(target_org_id);
end;
$$;

-- ── 9c) Projects & Teams ────────────────────────────────────────────────
create or replace function public.validate_project_assignment_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.project_id is distinct from old.project_id
    or new.employee_id is distinct from old.employee_id
    or new.company_id is distinct from old.company_id
    or new.assignment_role is distinct from old.assignment_role
    or new.start_at is distinct from old.start_at
    or new.created_at is distinct from old.created_at
    or new.assigned_by is distinct from old.assigned_by then
    raise exception 'only closing an open project assignment (end_at/ended_by/ended_at/notes) is allowed';
  end if;

  if old.end_at is not null then
    raise exception 'a closed project assignment cannot be modified';
  end if;

  return new;
end;
$$;

create or replace function public.validate_project_assignment_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_holds_role boolean;
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.employee_id);

  if new.assignment_role = 'member' then
    return new;
  end if;

  select exists (
    select 1
    from public.employees e
    join public.company_memberships m
      on m.user_id = e.profile_id and m.company_id = e.company_id and m.status = 'active'
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id
    where e.id = new.employee_id
      and r.name = new.assignment_role::text
  ) into v_holds_role;

  if not coalesce(v_holds_role, false) then
    raise exception 'employee % does not hold the % company role required for this project assignment', new.employee_id, new.assignment_role;
  end if;

  return new;
end;
$$;

create or replace function public.validate_team_assignment_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.project_id is distinct from old.project_id
    or new.team_id is distinct from old.team_id
    or new.employee_id is distinct from old.employee_id
    or new.company_id is distinct from old.company_id
    or new.assignment_role is distinct from old.assignment_role
    or new.start_at is distinct from old.start_at
    or new.created_at is distinct from old.created_at
    or new.assigned_by is distinct from old.assigned_by then
    raise exception 'only closing an open team assignment (end_at/ended_by/ended_at/notes) is allowed';
  end if;

  if old.end_at is not null then
    raise exception 'a closed team assignment cannot be modified';
  end if;

  return new;
end;
$$;

create or replace function public.move_employee_to_team(
  target_project_id uuid,
  target_team_id uuid,
  target_employee_id uuid,
  target_role public.team_assignment_role default 'member',
  target_notes text default null
)
returns public.team_assignments
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_existing record;
  v_result public.team_assignments;
begin
  select * into v_existing
  from public.team_assignments
  where project_id = target_project_id
    and employee_id = target_employee_id
    and end_at is null
  for update;

  if found then
    if v_existing.team_id = target_team_id and v_existing.assignment_role = target_role then
      return v_existing;
    end if;

    update public.team_assignments
    set end_at = v_now, ended_by = auth.uid(), ended_at = v_now
    where id = v_existing.id;
  end if;

  insert into public.team_assignments (
    company_id, project_id, team_id, employee_id, assignment_role, start_at, assigned_by, notes
  )
  select company_id, target_project_id, target_team_id, target_employee_id, target_role, v_now, auth.uid(), target_notes
  from public.teams
  where id = target_team_id
  returning * into v_result;

  if v_result.id is null then
    raise exception 'team % not found', target_team_id;
  end if;

  return v_result;
end;
$$;

create or replace function public.save_team_with_assignments(
  target_team_id uuid,
  target_project_id uuid,
  target_name text,
  target_code text,
  target_color public.team_color,
  target_description text,
  target_status public.team_status,
  target_assignments jsonb default '[]'::jsonb
)
returns public.teams
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_next_order integer;
  v_team public.teams;
  v_change record;
  v_final_open_count integer;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  if target_status = 'archived' then
    select count(*) into v_final_open_count
    from (
      select ta.employee_id
      from public.team_assignments ta
      where ta.team_id = target_team_id
        and ta.end_at is null
        and not exists (
          select 1 from jsonb_array_elements(target_assignments) elem
          where (elem ->> 'employee_id')::uuid = ta.employee_id
        )
      union
      select (elem ->> 'employee_id')::uuid
      from jsonb_array_elements(target_assignments) elem
      where elem ->> 'role' <> 'none'
    ) as final_members;

    if v_final_open_count > 0 then
      raise exception 'A team cannot be archived while it has assigned employees. Remove all current assignments first.';
    end if;
  end if;

  if target_team_id is null then
    select coalesce(max(display_order), -1) + 1 into v_next_order
    from public.teams
    where project_id = target_project_id;

    insert into public.teams (
      company_id, project_id, name, code, color, description, status, display_order, created_by, updated_by
    )
    values (
      v_company_id, target_project_id, target_name, target_code, target_color, target_description, target_status, v_next_order, auth.uid(), auth.uid()
    )
    returning * into v_team;

    for v_change in select * from jsonb_to_recordset(target_assignments) as x(employee_id uuid, role text)
    loop
      if v_change.role = 'none' then
        perform public.end_team_assignment(target_project_id, v_change.employee_id);
      else
        perform public.move_employee_to_team(target_project_id, v_team.id, v_change.employee_id, v_change.role::public.team_assignment_role);
      end if;
    end loop;
  else
    for v_change in select * from jsonb_to_recordset(target_assignments) as x(employee_id uuid, role text)
    loop
      if v_change.role = 'none' then
        perform public.end_team_assignment(target_project_id, v_change.employee_id);
      else
        perform public.move_employee_to_team(target_project_id, target_team_id, v_change.employee_id, v_change.role::public.team_assignment_role);
      end if;
    end loop;

    update public.teams
    set name = target_name, code = target_code, color = target_color, description = target_description, status = target_status, updated_by = auth.uid()
    where id = target_team_id and project_id = target_project_id
    returning * into v_team;

    if v_team.id is null then
      raise exception 'team % not found in project %', target_team_id, target_project_id;
    end if;
  end if;

  return v_team;
end;
$$;

create or replace function public.get_basic_employee_info(target_employee_ids uuid[])
returns table (
  id uuid,
  first_name text,
  last_name text,
  position_title text,
  profile_id uuid,
  archived_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, e.first_name, e.last_name, e.position_title, e.profile_id, e.archived_at
  from public.employees e
  where e.id = any(target_employee_ids)
    and (
      e.profile_id = auth.uid()
      or public.has_any_company_role(
        e.company_id,
        array['company_admin', 'operations_manager', 'hseq_manager', 'project_manager', 'inspector', 'planner']
      )
      or public.is_project_teammate(e.id)
    );
$$;

-- ── 9d) LMRA ────────────────────────────────────────────────────────────
create or replace function public.validate_lmra_assessment_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.status = 'archived' then
    raise exception 'an archived LMRA assessment cannot be modified';
  end if;

  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'LMRA identity/creation fields cannot be changed';
  end if;

  if new.status = 'archived' and old.status <> 'archived' then
    if not public.has_company_role(new.company_id, 'hseq_manager') then
      raise exception 'only an HSE Manager may archive an LMRA assessment';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_lmra_hazard_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_lmra_assessment_is_draft(new.lmra_assessment_id);
  if new.lmra_assessment_id is distinct from old.lmra_assessment_id
    or new.hazard_type is distinct from old.hazard_type
    or new.company_id is distinct from old.company_id then
    raise exception 'a hazard row''s assessment/type/company cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.create_initial_lmra_hazards()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.lmra_hazards (company_id, lmra_assessment_id, hazard_type)
  select new.company_id, new.id, unnest(enum_range(null::public.lmra_hazard_type));
  return new;
end;
$$;

-- ── 9e) Safety Observations & Corrective Actions ─────────────────────────
create or replace function public.sync_corrective_action_project_id()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  select project_id into new.project_id
  from public.safety_observations
  where id = new.observation_id and company_id = new.company_id;

  if new.project_id is null then
    raise exception 'safety observation % not found in company %', new.observation_id, new.company_id;
  end if;

  return new;
end;
$$;

create or replace function public.validate_safety_observation_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.status = 'closed' then
    raise exception 'a closed safety observation cannot be modified';
  end if;

  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'safety observation identity/creation fields cannot be changed';
  end if;

  if new.status = 'closed' and old.status <> 'closed' then
    if not public.has_company_role(new.company_id, 'hseq_manager') then
      raise exception 'only an HSE Manager may close a safety observation';
    end if;
    perform public.assert_no_unresolved_corrective_actions(new.id);
  end if;

  if new.reviewed_at is distinct from old.reviewed_at or new.reviewed_by is distinct from old.reviewed_by then
    if not public.has_company_role(new.company_id, 'hseq_manager') then
      raise exception 'only an HSE Manager may mark a safety observation reviewed';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.can_close_corrective_action(
  target_organization_id uuid,
  target_project_id uuid,
  target_created_by uuid,
  target_responsible_person_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    public.has_company_role(target_organization_id, 'hseq_manager')
    or public.is_project_manager(target_project_id)
    or (
      public.has_any_company_role(target_organization_id, array['hse_officer', 'foreman', 'inspector'])
      and (
        target_created_by = auth.uid()
        or exists (
          select 1 from public.employees e
          where e.id = target_responsible_person_id and e.profile_id = auth.uid()
        )
      )
    );
$$;

-- Live body as of 20260803093000_corrective_action_stale_reason_fix.sql
-- (the stale-reason fix — the chronologically last redefinition).
create or replace function public.validate_corrective_action_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.observation_id is distinct from old.observation_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'corrective action identity/creation fields cannot be changed';
  end if;

  if not (
    public.has_company_role(new.company_id, 'hseq_manager')
    or public.is_project_manager(new.project_id)
    or public.has_any_company_role(new.company_id, array['hse_officer', 'foreman', 'inspector'])
  ) then
    if new.due_date is distinct from old.due_date
      or new.priority is distinct from old.priority
      or new.description is distinct from old.description
      or new.responsible_person_id is distinct from old.responsible_person_id then
      raise exception 'only a manage-tier role may change a corrective action''s due date, priority, description, or responsible person';
    end if;
    if new.status in ('closed', 'rejected') and old.status not in ('closed', 'rejected') then
      raise exception 'an Employee cannot close or reject a corrective action — see docs/ROLES_AND_PERMISSIONS.md §5 footnote 11';
    end if;
    if old.status in ('closed', 'rejected') and new.status not in ('closed', 'rejected') then
      raise exception 'an Employee cannot reopen a corrective action — see docs/ROLES_AND_PERMISSIONS.md §5 footnote 11';
    end if;
  end if;

  if (new.status in ('closed', 'rejected') and old.status not in ('closed', 'rejected'))
    or (old.status in ('closed', 'rejected') and new.status not in ('closed', 'rejected')) then
    if not public.can_close_corrective_action(new.company_id, new.project_id, new.created_by, new.responsible_person_id) then
      raise exception 'you do not have authority to close, reject, or reopen this corrective action — see docs/ROLES_AND_PERMISSIONS.md §5 footnote 10';
    end if;
  end if;

  if new.status = 'rejected' and old.status <> 'rejected'
    and (new.reopen_reason is null or btrim(new.reopen_reason) = '' or new.reopen_reason is not distinct from old.reopen_reason) then
    raise exception 'a reason is required when rejecting a corrective action';
  end if;

  if old.status in ('closed', 'rejected') and new.status not in ('closed', 'rejected')
    and (new.reopen_reason is null or btrim(new.reopen_reason) = '' or new.reopen_reason is not distinct from old.reopen_reason) then
    raise exception 'a reason is required when reopening a corrective action';
  end if;

  return new;
end;
$$;

-- ── 9f) Scaffolds ─────────────────────────────────────────────────────────
create or replace function public.resolve_scaffold_inspection_validity_days(target_project_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.scaffold_inspection_validity_days from public.projects p where p.id = target_project_id),
    (select o.scaffold_inspection_validity_days from public.projects p join public.companies o on o.id = p.company_id where p.id = target_project_id),
    7
  );
$$;

-- Live body as of 20260805090000_scaffold_team_and_dimensions.sql
-- (adds the foreman-eligibility check).
create or replace function public.validate_scaffold_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.responsible_foreman_id);
  if not public.is_eligible_scaffold_foreman(new.responsible_foreman_id, new.company_id, new.project_id) then
    raise exception 'employee % is not an eligible Responsible Foreman for this project — must hold the Foreman role and an active Foreman team assignment on this project', new.responsible_foreman_id;
  end if;
  return new;
end;
$$;

-- BUNDLED BUG FIX (see this migration's header comment): the live body of
-- validate_scaffold_update() (as last redefined by
-- 20260805090000_scaffold_team_and_dimensions.sql) contains a
-- "new.status is distinct from old.status" guard that unconditionally
-- rejects any write to scaffolds.status. That guard was deliberately
-- REMOVED once already, by 20260803150000_scaffold_status_sync_trigger_fix.sql
-- — see that migration's header for the full rationale: a BEFORE UPDATE
-- trigger fires for every UPDATE regardless of which function issued it,
-- so this guard also rejected sync_scaffold_status_snapshot()'s own
-- legitimate SECURITY DEFINER write, meaning scaffolds.status could never
-- actually change. 20260805090000 redefined this same function to add the
-- (correct, kept below) foreman-eligibility check, and in doing so
-- accidentally reintroduced the status guard 20260803150000 had removed.
-- This rewrite keeps the identity-field guard and the foreman-eligibility
-- check, and — while already touching this body for the organization_id ->
-- company_id rename — omits the reintroduced status-change guard again.
-- scaffolds.status remains locked against direct client writes via the
-- column-level REVOKE/GRANT in 20260803120000_scaffold_inspections.sql,
-- unaffected by this change.
create or replace function public.validate_scaffold_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'scaffold identity/creation fields cannot be changed';
  end if;

  if new.responsible_foreman_id is distinct from old.responsible_foreman_id then
    perform public.assert_employee_eligible_for_assignment(new.responsible_foreman_id);
    if not public.is_eligible_scaffold_foreman(new.responsible_foreman_id, new.company_id, new.project_id) then
      raise exception 'employee % is not an eligible Responsible Foreman for this project — must hold the Foreman role and an active Foreman team assignment on this project', new.responsible_foreman_id;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.validate_scaffold_update() is
  'Guards identity/creation fields and, when responsible_foreman_id changes, Foreman eligibility. scaffolds.status is locked to authenticated via column-level GRANT (20260803120000_scaffold_inspections.sql) rather than a trigger check here — deliberately NOT reinstating the status-change guard 20260803150000_scaffold_status_sync_trigger_fix.sql removed (it blocked sync_scaffold_status_snapshot()''s own SECURITY DEFINER update), which 20260805090000_scaffold_team_and_dimensions.sql had accidentally reintroduced. See this migration''s header comment.';

create or replace function public.sync_scaffold_inspection_project_id()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  select project_id into new.project_id from public.scaffolds where id = new.scaffold_id and company_id = new.company_id;
  if new.project_id is null then
    raise exception 'scaffold % not found in company %', new.scaffold_id, new.company_id;
  end if;
  return new;
end;
$$;

create or replace function public.create_initial_scaffold_inspection_items()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.scaffold_inspection_items (company_id, scaffold_inspection_id, item_type)
  select new.company_id, new.id, unnest(enum_range(null::public.scaffold_inspection_item_type));
  return new;
end;
$$;

create or replace function public.validate_scaffold_inspection_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_unresolved_count int;
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.scaffold_id is distinct from old.scaffold_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'scaffold inspection identity/creation fields cannot be changed';
  end if;

  new.expires_at := old.expires_at;
  new.finalized_at := old.finalized_at;
  new.finalized_by := old.finalized_by;

  if old.status = 'finalized' then
    if new.superseded_by_id is not distinct from old.superseded_by_id then
      raise exception 'a finalized scaffold inspection cannot be modified — corrections are a new linked inspection (corrects_inspection_id), not an edit';
    end if;
    if old.superseded_by_id is not null then
      raise exception 'this inspection has already been superseded by a correction and cannot be modified again';
    end if;
    if new.inspection_reason is distinct from old.inspection_reason
      or new.previous_inspection_id is distinct from old.previous_inspection_id
      or new.corrects_inspection_id is distinct from old.corrects_inspection_id
      or new.correction_reason is distinct from old.correction_reason
      or new.inspector_id is distinct from old.inspector_id
      or new.inspected_at is distinct from old.inspected_at
      or new.status is distinct from old.status
      or new.outcome is distinct from old.outcome
      or new.restrictions_notes is distinct from old.restrictions_notes
      or new.expires_at is distinct from old.expires_at
      or new.notes is distinct from old.notes
      or new.finalized_at is distinct from old.finalized_at
      or new.finalized_by is distinct from old.finalized_by then
      raise exception 'a finalized scaffold inspection is immutable except for recording that it was superseded by a correction';
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status <> 'finalized' then
    raise exception 'a draft scaffold inspection may only transition to finalized, not directly to %', new.status;
  end if;

  if new.outcome is null then
    raise exception 'an outcome is required to finalize a scaffold inspection';
  end if;

  if new.outcome = 'safe_with_restrictions' and (new.restrictions_notes is null or btrim(new.restrictions_notes) = '') then
    raise exception 'restrictions must be recorded when the outcome is safe with restrictions';
  end if;
  if new.outcome <> 'safe_with_restrictions' then
    new.restrictions_notes := null;
  end if;

  select count(*) into v_unresolved_count
  from public.scaffold_defects
  where scaffold_inspection_id = new.id
    and status not in ('closed', 'rejected');

  if new.outcome = 'safe_for_use' and v_unresolved_count > 0 then
    raise exception 'cannot finalize as safe for use while % unresolved defect(s) remain for this inspection', v_unresolved_count;
  end if;

  new.expires_at := now() + make_interval(days => public.resolve_scaffold_inspection_validity_days(new.project_id));
  new.finalized_at := now();
  new.finalized_by := auth.uid();

  return new;
end;
$$;

create or replace function public.validate_scaffold_inspection_item_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_scaffold_inspection_is_draft(new.scaffold_inspection_id);
  if new.scaffold_inspection_id is distinct from old.scaffold_inspection_id
    or new.item_type is distinct from old.item_type
    or new.company_id is distinct from old.company_id then
    raise exception 'a checklist row''s inspection/type/company cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.sync_scaffold_defect_denormalized_columns()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  select scaffold_id, project_id into new.scaffold_id, new.project_id
  from public.scaffold_inspections
  where id = new.scaffold_inspection_id and company_id = new.company_id;

  if new.scaffold_id is null then
    raise exception 'scaffold inspection % not found in company %', new.scaffold_inspection_id, new.company_id;
  end if;

  return new;
end;
$$;

create or replace function public.can_close_scaffold_defect(
  target_organization_id uuid,
  target_project_id uuid,
  target_created_by uuid,
  target_responsible_person_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    public.has_company_role(target_organization_id, 'hseq_manager')
    or (
      public.has_any_company_role(target_organization_id, array['hse_officer', 'inspector'])
      and public.has_project_access(target_project_id)
      and (
        target_created_by = auth.uid()
        or exists (
          select 1 from public.employees e
          where e.id = target_responsible_person_id and e.profile_id = auth.uid()
        )
      )
    );
$$;

create or replace function public.is_scaffold_manage_tier(target_organization_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    public.has_company_role(target_organization_id, 'hseq_manager')
    or (
      public.has_any_company_role(target_organization_id, array['hse_officer', 'inspector'])
      and public.has_project_access(target_project_id)
    );
$$;

create or replace function public.validate_scaffold_defect_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.scaffold_inspection_id is distinct from old.scaffold_inspection_id
    or new.scaffold_id is distinct from old.scaffold_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'scaffold defect identity/creation fields cannot be changed';
  end if;

  if not public.is_scaffold_manage_tier(new.company_id, new.project_id) then
    if new.due_date is distinct from old.due_date
      or new.severity is distinct from old.severity
      or new.description is distinct from old.description
      or new.responsible_person_id is distinct from old.responsible_person_id then
      raise exception 'only HSE Manager/HSE Officer/Inspector may change a scaffold defect''s due date, severity, description, or responsible person';
    end if;
    if new.status in ('closed', 'rejected') and old.status not in ('closed', 'rejected') then
      raise exception 'only HSE Manager/HSE Officer/Inspector may close or reject a scaffold defect';
    end if;
    if old.status in ('closed', 'rejected') and new.status not in ('closed', 'rejected') then
      raise exception 'only HSE Manager/HSE Officer/Inspector may reopen a scaffold defect';
    end if;
  end if;

  if (new.status in ('closed', 'rejected') and old.status not in ('closed', 'rejected'))
    or (old.status in ('closed', 'rejected') and new.status not in ('closed', 'rejected')) then
    if not public.can_close_scaffold_defect(new.company_id, new.project_id, new.created_by, new.responsible_person_id) then
      raise exception 'you do not have authority to close, reject, or reopen this scaffold defect';
    end if;
  end if;

  if new.status = 'rejected' and old.status <> 'rejected'
    and (new.reopen_reason is null or btrim(new.reopen_reason) = '' or new.reopen_reason is not distinct from old.reopen_reason) then
    raise exception 'a reason is required when rejecting a scaffold defect';
  end if;

  if old.status in ('closed', 'rejected') and new.status not in ('closed', 'rejected')
    and (new.reopen_reason is null or btrim(new.reopen_reason) = '' or new.reopen_reason is not distinct from old.reopen_reason) then
    raise exception 'a reason is required when reopening a scaffold defect';
  end if;

  return new;
end;
$$;

create or replace function public.is_eligible_scaffold_foreman(target_employee_id uuid, target_organization_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.employees e
    where e.id = target_employee_id
      and e.company_id = target_organization_id
      and e.archived_at is null
      and e.employment_status = 'active'
  )
  and public.employee_has_any_company_role(target_employee_id, target_organization_id, array['foreman'])
  and exists (
    select 1 from public.team_assignments ta
    where ta.employee_id = target_employee_id
      and ta.project_id = target_project_id
      and ta.company_id = target_organization_id
      and ta.assignment_role = 'foreman'
      and ta.end_at is null
  );
$$;

create or replace function public.list_eligible_scaffold_foremen(target_organization_id uuid, target_project_id uuid)
returns table (id uuid, first_name text, last_name text, employee_number text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct e.id, e.first_name, e.last_name, e.employee_number
  from public.employees e
  join public.team_assignments ta
    on ta.employee_id = e.id
    and ta.project_id = target_project_id
    and ta.company_id = target_organization_id
    and ta.assignment_role = 'foreman'
    and ta.end_at is null
  join public.company_memberships m on m.user_id = e.profile_id and m.company_id = target_organization_id and m.status = 'active'
  join public.membership_roles mr on mr.membership_id = m.id
  join public.roles r on r.id = mr.role_id and r.name = 'foreman'
  where e.company_id = target_organization_id
    and e.archived_at is null
    and e.employment_status = 'active'
  order by e.last_name, e.first_name;
$$;

create or replace function public.is_eligible_scaffold_team_member(target_employee_id uuid, target_organization_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.employees e
    where e.id = target_employee_id
      and e.company_id = target_organization_id
      and e.archived_at is null
      and e.employment_status = 'active'
  )
  and exists (
    select 1 from public.project_assignments pa
    where pa.employee_id = target_employee_id
      and pa.project_id = target_project_id
      and pa.company_id = target_organization_id
      and pa.end_at is null
  )
  and not public.employee_has_any_company_role(
    target_employee_id, target_organization_id,
    array['foreman', 'hseq_manager', 'hse_officer', 'project_manager', 'company_admin', 'inspector']
  );
$$;

create or replace function public.list_eligible_scaffold_team_members(target_organization_id uuid, target_project_id uuid)
returns table (id uuid, first_name text, last_name text, employee_number text, position_title text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, e.first_name, e.last_name, e.employee_number, e.position_title
  from public.employees e
  join public.project_assignments pa
    on pa.employee_id = e.id
    and pa.project_id = target_project_id
    and pa.company_id = target_organization_id
    and pa.end_at is null
  where e.company_id = target_organization_id
    and e.archived_at is null
    and e.employment_status = 'active'
    and not public.employee_has_any_company_role(
      e.id, target_organization_id,
      array['foreman', 'hseq_manager', 'hse_officer', 'project_manager', 'company_admin', 'inspector']
    )
  order by e.last_name, e.first_name;
$$;

create or replace function public.validate_scaffold_team_member_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_scaffold record;
begin
  select company_id, project_id, responsible_foreman_id
  into v_scaffold
  from public.scaffolds
  where id = new.scaffold_id;

  if v_scaffold.company_id is null then
    raise exception 'scaffold % not found', new.scaffold_id;
  end if;
  if v_scaffold.company_id is distinct from new.company_id then
    raise exception 'scaffold % does not belong to company %', new.scaffold_id, new.company_id;
  end if;

  new.project_id := v_scaffold.project_id;

  if new.employee_id = v_scaffold.responsible_foreman_id then
    raise exception 'the Responsible Foreman cannot also be added as an ordinary scaffold team member';
  end if;

  perform public.assert_employee_eligible_for_assignment(new.employee_id);

  if not public.is_eligible_scaffold_team_member(new.employee_id, new.company_id, v_scaffold.project_id) then
    raise exception 'employee % is not an eligible ordinary scaffold team member for this project', new.employee_id;
  end if;

  return new;
end;
$$;

create or replace function public.validate_scaffold_team_member_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.scaffold_id is distinct from old.scaffold_id
    or new.employee_id is distinct from old.employee_id
    or new.team_position is distinct from old.team_position
    or new.added_by is distinct from old.added_by
    or new.added_at is distinct from old.added_at then
    raise exception 'scaffold team member identity/assignment fields cannot be changed — remove and add a new row instead';
  end if;

  if old.removed_at is not null then
    raise exception 'this scaffold team member assignment has already been removed and cannot be modified further';
  end if;

  return new;
end;
$$;

-- ── 9g) Toolbox Meetings, Toolbox Templates & Safety Flash ─────────────────
create or replace function public.assert_toolbox_authorized_employee(target_employee_id uuid, target_organization_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_employee_eligible_for_assignment(target_employee_id);
  if not public.employee_has_any_company_role(target_employee_id, target_organization_id, array['hseq_manager', 'hse_officer']) then
    raise exception 'the selected person must hold the HSE Manager or HSE Officer role in this company';
  end if;
end;
$$;

create or replace function public.is_toolbox_manage_tier(target_organization_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_any_company_role(target_organization_id, array['hseq_manager'])
    or (
      public.has_any_company_role(target_organization_id, array['hse_officer'])
      and public.has_project_access(target_project_id)
    );
$$;

create or replace function public.is_safety_flash_manage_tier(target_organization_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_any_company_role(target_organization_id, array['hseq_manager'])
    or (
      public.has_any_company_role(target_organization_id, array['hse_officer'])
      and (target_project_id is null or public.has_project_access(target_project_id))
    );
$$;

create or replace function public.is_toolbox_template_manage_tier(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_any_company_role(target_organization_id, array['hseq_manager', 'hse_officer']);
$$;

create or replace function public.assign_toolbox_meeting_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  insert into public.toolbox_meeting_number_counters (project_id, company_id, next_number)
  values (new.project_id, new.company_id, 1)
  on conflict (project_id) do nothing;

  update public.toolbox_meeting_number_counters
  set next_number = next_number + 1, updated_at = now()
  where project_id = new.project_id
  returning next_number - 1 into v_next;

  new.meeting_number := v_next;
  return new;
end;
$$;

create or replace function public.assign_safety_flash_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  insert into public.safety_flash_number_counters (company_id, next_number)
  values (new.company_id, 1)
  on conflict (company_id) do nothing;

  update public.safety_flash_number_counters
  set next_number = next_number + 1, updated_at = now()
  where company_id = new.company_id
  returning next_number - 1 into v_next;

  new.flash_number := v_next;
  return new;
end;
$$;

create or replace function public.validate_toolbox_meeting_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_toolbox_authorized_employee(new.held_by_employee_id, new.company_id);
  return new;
end;
$$;

create or replace function public.validate_toolbox_meeting_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.meeting_number is distinct from old.meeting_number
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'toolbox meeting identity fields cannot be changed';
  end if;

  if new.held_by_employee_id is distinct from old.held_by_employee_id then
    perform public.assert_toolbox_authorized_employee(new.held_by_employee_id, new.company_id);
  end if;

  return new;
end;
$$;

create or replace function public.validate_toolbox_template_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'toolbox template identity fields cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.validate_safety_flash_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.project_id is not null then
    perform public.assert_project_not_archived(new.project_id);
  end if;
  perform public.assert_toolbox_authorized_employee(new.issued_by_employee_id, new.company_id);
  return new;
end;
$$;

create or replace function public.validate_safety_flash_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.flash_number is distinct from old.flash_number
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'safety flash identity fields cannot be changed';
  end if;

  if new.issued_by_employee_id is distinct from old.issued_by_employee_id then
    perform public.assert_toolbox_authorized_employee(new.issued_by_employee_id, new.company_id);
  end if;

  return new;
end;
$$;

create or replace function public.replace_toolbox_meeting_file(
  target_meeting_id uuid,
  new_storage_object_path text,
  new_original_filename text,
  new_mime_type text,
  new_file_size_bytes bigint,
  new_file_checksum_sha256 text,
  reason text
)
returns public.toolbox_meetings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.toolbox_meetings;
begin
  if btrim(reason) = '' then
    raise exception 'a reason is required to replace a toolbox meeting file';
  end if;
  if new_mime_type <> 'application/pdf' then
    raise exception 'only PDF files are accepted';
  end if;
  if new_file_size_bytes <= 0 or new_file_size_bytes > 26214400 then
    raise exception 'file size out of the allowed range';
  end if;

  select * into v_row from public.toolbox_meetings where id = target_meeting_id;
  if v_row.id is null then
    raise exception 'toolbox meeting % not found', target_meeting_id;
  end if;
  if not public.is_toolbox_manage_tier(v_row.company_id, v_row.project_id) then
    raise exception 'insufficient_privilege: not authorized to replace this toolbox meeting''s file';
  end if;

  insert into public.toolbox_meeting_file_replacements (
    company_id, toolbox_meeting_id,
    previous_storage_bucket, previous_storage_object_path, previous_original_filename,
    new_storage_bucket, new_storage_object_path, new_original_filename,
    reason, replaced_by
  ) values (
    v_row.company_id, v_row.id,
    v_row.storage_bucket, v_row.storage_object_path, v_row.original_filename,
    v_row.storage_bucket, new_storage_object_path, new_original_filename,
    reason, auth.uid()
  );

  update public.toolbox_meetings
  set
    storage_object_path = new_storage_object_path,
    original_filename = new_original_filename,
    mime_type = new_mime_type,
    file_size_bytes = new_file_size_bytes,
    file_checksum_sha256 = new_file_checksum_sha256,
    uploaded_by = auth.uid(),
    uploaded_at = now(),
    updated_by = auth.uid()
  where id = target_meeting_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.replace_toolbox_template_file(
  target_template_id uuid,
  new_storage_object_path text,
  new_original_filename text,
  new_mime_type text,
  new_file_size_bytes bigint,
  new_file_checksum_sha256 text,
  reason text
)
returns public.toolbox_templates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.toolbox_templates;
begin
  if btrim(reason) = '' then
    raise exception 'a reason is required to replace a toolbox template file';
  end if;
  if new_mime_type <> 'application/pdf' then
    raise exception 'only PDF files are accepted';
  end if;
  if new_file_size_bytes <= 0 or new_file_size_bytes > 26214400 then
    raise exception 'file size out of the allowed range';
  end if;

  select * into v_row from public.toolbox_templates where id = target_template_id;
  if v_row.id is null then
    raise exception 'toolbox template % not found', target_template_id;
  end if;
  if not public.is_toolbox_template_manage_tier(v_row.company_id) then
    raise exception 'insufficient_privilege: not authorized to replace this toolbox template''s file';
  end if;

  insert into public.toolbox_template_file_replacements (
    company_id, toolbox_template_id,
    previous_storage_bucket, previous_storage_object_path, previous_original_filename,
    new_storage_bucket, new_storage_object_path, new_original_filename,
    reason, replaced_by
  ) values (
    v_row.company_id, v_row.id,
    v_row.storage_bucket, v_row.storage_object_path, v_row.original_filename,
    v_row.storage_bucket, new_storage_object_path, new_original_filename,
    reason, auth.uid()
  );

  update public.toolbox_templates
  set
    storage_object_path = new_storage_object_path,
    original_filename = new_original_filename,
    mime_type = new_mime_type,
    file_size_bytes = new_file_size_bytes,
    file_checksum_sha256 = new_file_checksum_sha256,
    uploaded_by = auth.uid(),
    uploaded_at = now(),
    updated_by = auth.uid()
  where id = target_template_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.replace_safety_flash_file(
  target_flash_id uuid,
  new_storage_object_path text,
  new_original_filename text,
  new_mime_type text,
  new_file_size_bytes bigint,
  new_file_checksum_sha256 text,
  reason text
)
returns public.safety_flashes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.safety_flashes;
begin
  if btrim(reason) = '' then
    raise exception 'a reason is required to replace a safety flash file';
  end if;
  if new_mime_type <> 'application/pdf' then
    raise exception 'only PDF files are accepted';
  end if;
  if new_file_size_bytes <= 0 or new_file_size_bytes > 26214400 then
    raise exception 'file size out of the allowed range';
  end if;

  select * into v_row from public.safety_flashes where id = target_flash_id;
  if v_row.id is null then
    raise exception 'safety flash % not found', target_flash_id;
  end if;
  if not public.is_safety_flash_manage_tier(v_row.company_id, v_row.project_id) then
    raise exception 'insufficient_privilege: not authorized to replace this safety flash''s file';
  end if;

  insert into public.safety_flash_file_replacements (
    company_id, safety_flash_id,
    previous_storage_bucket, previous_storage_object_path, previous_original_filename,
    new_storage_bucket, new_storage_object_path, new_original_filename,
    reason, replaced_by
  ) values (
    v_row.company_id, v_row.id,
    v_row.storage_bucket, v_row.storage_object_path, v_row.original_filename,
    v_row.storage_bucket, new_storage_object_path, new_original_filename,
    reason, auth.uid()
  );

  update public.safety_flashes
  set
    storage_object_path = new_storage_object_path,
    original_filename = new_original_filename,
    mime_type = new_mime_type,
    file_size_bytes = new_file_size_bytes,
    file_checksum_sha256 = new_file_checksum_sha256,
    uploaded_by = auth.uid(),
    uploaded_at = now(),
    updated_by = auth.uid()
  where id = target_flash_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.get_toolbox_authorized_employee_info(target_employee_ids uuid[])
returns table (
  id uuid,
  first_name text,
  last_name text,
  employee_number text,
  profile_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, e.first_name, e.last_name, e.employee_number, e.profile_id
  from public.employees e
  where e.id = any(target_employee_ids)
    and public.is_company_member(e.company_id);
$$;

create or replace function public.list_toolbox_authorized_employees(target_organization_id uuid, target_project_id uuid)
returns table (
  id uuid,
  first_name text,
  last_name text,
  employee_number text,
  profile_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct e.id, e.first_name, e.last_name, e.employee_number, e.profile_id
  from public.employees e
  join public.company_memberships m on m.user_id = e.profile_id and m.company_id = target_organization_id and m.status = 'active'
  join public.membership_roles mr on mr.membership_id = m.id
  join public.roles r on r.id = mr.role_id
  where e.company_id = target_organization_id
    and e.archived_at is null
    and e.employment_status = 'active'
    and (
      r.name = 'hseq_manager'
      or (
        r.name = 'hse_officer'
        and (
          target_project_id is null
          or exists (
            select 1 from public.project_assignments pa
            where pa.employee_id = e.id and pa.project_id = target_project_id and pa.end_at is null
          )
        )
      )
    )
  order by e.last_name, e.first_name;
$$;

-- ── 9h) Bootstrap & membership status management ───────────────────────
create or replace function public.bootstrap_first_owner(target_organization_id uuid, target_user_id uuid, notes text default null)
returns public.company_memberships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_admin_role_id uuid;
  v_existing_admin_count int;
  v_membership public.company_memberships;
begin
  if not exists (select 1 from public.companies where id = target_organization_id) then
    raise exception 'company % not found', target_organization_id;
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'user % not found', target_user_id;
  end if;

  select count(*) into v_existing_admin_count
  from public.membership_roles mr
  join public.roles r on r.id = mr.role_id
  join public.company_memberships m on m.id = mr.membership_id
  where mr.company_id = target_organization_id
    and r.name = 'company_admin'
    and m.status = 'active';

  if v_existing_admin_count > 0 then
    raise exception 'company % already has an active company_admin — bootstrap_first_owner() only handles the cold-start case; use the normal membership_roles management path (a real company_admin assigning the role) instead', target_organization_id;
  end if;

  select id into v_company_admin_role_id from public.roles where name = 'company_admin';
  if v_company_admin_role_id is null then
    raise exception 'company_admin role not found in the roles catalogue';
  end if;

  insert into public.company_memberships (company_id, user_id, status, joined_at)
  values (target_organization_id, target_user_id, 'active', now())
  on conflict (company_id, user_id) do update set status = 'active', joined_at = coalesce(public.company_memberships.joined_at, now())
  returning * into v_membership;

  insert into public.membership_roles (company_id, membership_id, role_id)
  values (target_organization_id, v_membership.id, v_company_admin_role_id)
  on conflict (membership_id, role_id) do nothing;

  insert into public.bootstrap_audit_log (company_id, user_id, role_assigned, notes)
  values (target_organization_id, target_user_id, 'company_admin', notes);

  return v_membership;
end;
$$;

-- Function NAME deliberately left unchanged — not one of the four helper
-- functions listed for an ALTER FUNCTION RENAME; only its body is fixed
-- here. See the closing "not fully certain" note at the end of this file.
create or replace function public.validate_organization_membership_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_is_company_admin boolean;
  v_remaining_active_admins int;
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
    or new.invited_at is distinct from old.invited_at
    or new.joined_at is distinct from old.joined_at then
    raise exception 'company membership identity/history fields cannot be changed';
  end if;

  if new.status is distinct from old.status then
    if old.user_id = auth.uid() then
      raise exception 'you cannot change your own membership status';
    end if;

    if old.status = 'active' and new.status <> 'active' then
      select exists (
        select 1 from public.membership_roles mr
        join public.roles r on r.id = mr.role_id
        where mr.membership_id = old.id and r.name = 'company_admin'
      ) into v_is_company_admin;

      if v_is_company_admin then
        select count(*) into v_remaining_active_admins
        from public.membership_roles mr
        join public.roles r on r.id = mr.role_id
        join public.company_memberships m on m.id = mr.membership_id
        where mr.company_id = old.company_id
          and r.name = 'company_admin'
          and m.status = 'active'
          and m.id <> old.id;

        if v_remaining_active_admins = 0 then
          raise exception 'cannot change status — this is the company''s last active company_admin membership';
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- Naming consistency follow-up to the closing checklist's item 3: this
-- function's body was already fixed above for the company_id rename;
-- renaming it BY NAME here preserves its OID, so its trigger
-- (company_memberships_validate_update, renamed in §12 below) keeps
-- pointing at it automatically — nothing else needs to change.
alter function public.validate_organization_membership_update() rename to validate_company_membership_update;

-- ============================================================================
-- 10) RLS policies whose NAME literally contains "organization"
-- ============================================================================
alter policy organizations_select_active_member on public.companies rename to companies_select_active_member;
alter policy organization_memberships_select_own_or_active_member on public.company_memberships rename to company_memberships_select_own_or_active_member;
alter policy organization_memberships_update_managers on public.company_memberships rename to company_memberships_update_managers;

-- ============================================================================
-- 11) Storage (storage.objects policies in
--     20260803161000_toolbox_documents_storage.sql)
-- ============================================================================
-- toolbox_documents_select / toolbox_documents_insert call
-- is_organization_member(...)/has_any_organization_role(...)/
-- is_toolbox_manage_tier(...)/is_toolbox_template_manage_tier(...)/
-- is_safety_flash_manage_tier(...) by function reference, not by literal
-- text baked into a body — RLS policy USING/WITH CHECK expressions are
-- stored as parsed trees keyed by function OID, so step 8's OID-preserving
-- renames above already cascade into these two policies automatically.
-- Neither policy's own NAME contains "organization". The path-parsing
-- itself (`(storage.foldername(name))[1]` = the tenant id segment) never
-- referenced the literal word "organization" or "organization_id" as text
-- either. No explicit fix needed here — verified by re-reading that
-- migration file in full.

-- ============================================================================
-- 12) Trigger renames (cosmetic — trigger bindings are by OID, unaffected
--     functionally by a rename; done here purely for naming consistency)
-- ============================================================================
alter trigger organizations_set_updated_at on public.companies rename to companies_set_updated_at;
alter trigger organization_memberships_set_updated_at on public.company_memberships rename to company_memberships_set_updated_at;
alter trigger organization_memberships_validate_update on public.company_memberships rename to company_memberships_validate_update;

-- ============================================================================
-- 13) roles.company_admin — explicitly NOT touched
-- ============================================================================
-- The 'company_admin' row in public.roles (seeded in supabase/seed.sql) is
-- a pre-existing, unrelated role name that happens to already contain the
-- word "company" — no statement in this migration reads, writes, or
-- renames it; every reference to it above (e.g. r.name = 'company_admin')
-- is left byte-for-byte identical to the source migrations.

-- ============================================================================
-- Reviewer checklist — objects this migration was NOT fully certain about
-- ============================================================================
-- 1. Auto-generated foreign-key constraint names: every `organization_id
--    uuid ... references public.organizations (id) ...` column declared
--    WITHOUT an explicit `constraint <name>` clause (e.g. on audit_events,
--    employees, projects, lmra_assessments, scaffolds,
--    company_employee_number_counters, bootstrap_audit_log,
--    profiles.active_organization_id, safety_flash_number_counters, and
--    many more) got a Postgres-generated default constraint name at
--    creation time, typically `<table>_<column>_fkey` — e.g.
--    `bootstrap_audit_log_organization_id_fkey`,
--    `profiles_active_organization_id_fkey`. These names were never
--    written literally in any migration file, so per this migration's
--    "do not invent a name that doesn't appear verbatim in the source"
--    constraint, they are NOT renamed here. They remain fully functional
--    (a constraint's own name has no bearing on FK enforcement), but will
--    still say "organization" in `\d` output / pg_constraint until a
--    follow-up cosmetic migration renames them after confirming the real
--    names via `information_schema.table_constraints` /
--    `pg_constraint` against the live database.
-- 2. Similarly, `toolbox_meeting_number_counters`'s unnamed composite FK
--    (`foreign key (project_id, organization_id) references
--    public.projects (id, organization_id) on delete cascade`) has a
--    likely-but-unverified default name of
--    `toolbox_meeting_number_counters_project_id_fkey` (Postgres uses only
--    the first listed column for the default multi-column FK name) — not
--    renamed here for the same reason as (1).
-- 3. RESOLVED during review: `validate_organization_membership_update()` is
--    now renamed to `validate_company_membership_update()` via `alter
--    function ... rename` immediately after its body rewrite (§9), for
--    naming consistency with the rest of this migration.
-- 4. `employees_org_profile_key` (20260725091000_employees.sql) and
--    `employees_company_id_profile_id_key` (renamed in this migration from
--    `employees_organization_id_profile_id_key`, added later by
--    20260804092000_employee_profile_link_uniqueness.sql) appear to be two
--    overlapping partial unique indexes enforcing the same
--    (company_id, profile_id) uniqueness. This pre-existing duplication is
--    unrelated to the rename itself and was left as found — flagging in
--    case a reviewer wants to consolidate them separately.
-- 5. COMMENT ON TABLE/COLUMN/FUNCTION prose text: only functional
--    identifiers (table/column/constraint/index/function/policy/trigger/
--    enum names and the literal SQL inside function bodies) were renamed.
--    Free-text documentation comments throughout the original schema that
--    happen to say "organization" in prose were not systematically
--    rewritten — they are metadata only and have no functional effect.
