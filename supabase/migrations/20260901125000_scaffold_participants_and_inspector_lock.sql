-- ============================================================================
-- Scaffold erection PARTICIPANTS (replaces the rigid team-only model) +
-- server-validated Inspector self-lock/eligible-alternate enforcement
-- ============================================================================
-- Part 3-5 of this milestone: `scaffold_erection_teams` (added in
-- 20260831093000) only ever recorded WHICH Today's Teams were linked to a
-- scaffold, never WHICH INDIVIDUALS actually worked on it — a worker's
-- presence on a scaffold was implied entirely by team membership, which
-- is wrong: a worker may work on more than one scaffold in a day, and a
-- team is only ever a fast-fill convenience, not the authoritative
-- record. `scaffold_erection_teams` is KEPT UNCHANGED (still useful as an
-- audit trail of which teams were used to fast-fill), but it is no longer
-- the primary/only model — `scaffold_erection_participants` below is the
-- new authoritative "who actually worked on this scaffold" record,
-- independent per scaffold (no unique constraint spanning scaffolds, so
-- the same employee can freely appear on multiple scaffolds the same
-- day — Part 13's explicit requirement).
-- ============================================================================

create type public.scaffold_participant_source as enum ('manual', 'team_import');

comment on type public.scaffold_participant_source is
  'How a scaffold_erection_participants row was added — "team_import" when populated via the Today''s Team fast-fill helper (source_daily_team_id records which team), "manual" when added individually. Purely informational/audit — never changes eligibility or removal rights.';

create table public.scaffold_erection_participants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- Denormalized from the scaffold, server-derived and never client-
  -- trusted (validate_scaffold_erection_participant_insert() below) —
  -- same convention as scaffold_erection_teams.project_id.
  project_id uuid not null,
  scaffold_id uuid not null,
  employee_id uuid not null,
  -- The scaffold's own erection date at the time this participant was
  -- added — stored explicitly (not just implied by the scaffold's
  -- current erected_at) so a later erected_at correction never silently
  -- rewrites which date a historical participant is associated with.
  work_date date not null,
  source public.scaffold_participant_source not null default 'manual',
  -- Which Today's Team this participant was imported from, if any — kept
  -- for audit ("this crew came from Team Alpha + 2 extra people"), never
  -- required (null for manual adds, and still null-able for a team
  -- import if that team link is later deleted — ON DELETE SET NULL, the
  -- participant record itself is never destroyed just because the
  -- import source was later unlinked).
  source_daily_team_id uuid references public.daily_teams (id) on delete set null,
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  -- Soft-removal (mirrors daily_team_members' own convention) — a
  -- removed participant is no longer considered part of the crew, but
  -- the row itself is retained for audit rather than deleted.
  removed_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz,
  constraint scaffold_erection_participants_removed_consistency check ((removed_at is null) = (removed_by is null)),
  constraint scaffold_erection_participants_id_company_id_key unique (id, company_id),
  constraint scaffold_erection_participants_scaffold_fk foreign key (scaffold_id, company_id)
      references public.scaffolds (id, company_id) on delete cascade,
  constraint scaffold_erection_participants_employee_fk foreign key (employee_id, company_id)
      references public.employees (id, company_id) on delete restrict
);

comment on table public.scaffold_erection_participants is
  'The authoritative "who actually worked on this scaffold" record — independent of scaffold_erection_teams (which only records which Today''s Teams were used as a fast-fill convenience). No uniqueness constraint spans scaffolds: the same employee_id may appear as a participant on multiple different scaffolds for the same work_date (Part 13 — a worker moving between scaffold jobs during a day is normal and must never be blocked).';

-- No duplicate ACTIVE participant on the same scaffold (re-adding after a
-- soft-removal is fine and creates a new row — deliberately not
-- prevented, since "removed then re-added" is a legitimate correction).
create unique index scaffold_erection_participants_active_unique on public.scaffold_erection_participants (scaffold_id, employee_id) where removed_at is null;
create index scaffold_erection_participants_scaffold_idx on public.scaffold_erection_participants (scaffold_id) where removed_at is null;
create index scaffold_erection_participants_employee_idx on public.scaffold_erection_participants (employee_id, work_date);
create index scaffold_erection_participants_project_idx on public.scaffold_erection_participants (project_id);

alter table public.scaffold_erection_participants enable row level security;

-- Same read audience as scaffold_erection_teams — the scaffold's own
-- visibility, since participant identity is part of the scaffold's
-- operational record.
create policy scaffold_erection_participants_select
  on public.scaffold_erection_participants
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or (public.has_project_access(project_id) and public.has_any_company_role(company_id, array['project_manager', 'hse_officer', 'foreman', 'inspector']))
    )
  );

-- Mirrors scaffold_erection_teams_insert exactly (Part 14 — "follow
-- existing scaffold edit/create permissions"): the scaffold's own
-- broad-creator or self-eligible-foreman may ADD participants (same
-- authority that lets them register the scaffold and its erection teams
-- in the first place).
create policy scaffold_erection_participants_insert
  on public.scaffold_erection_participants
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and exists (
      select 1 from public.scaffolds s
      where s.id = scaffold_erection_participants.scaffold_id
        and (public.is_scaffold_broad_creator(s.company_id, s.project_id) or public.is_caller_eligible_scaffold_foreman(s.company_id, s.project_id))
    )
  );

-- Mirrors scaffold_erection_teams_delete — REMOVING (soft, via UPDATE) a
-- participant requires manage-tier, same as unlinking an erection team.
create policy scaffold_erection_participants_update
  on public.scaffold_erection_participants
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and exists (select 1 from public.scaffolds s where s.id = scaffold_erection_participants.scaffold_id and public.is_scaffold_manage_tier(s.company_id, s.project_id))
  )
  with check (
    public.is_company_member(company_id)
    and exists (select 1 from public.scaffolds s where s.id = scaffold_erection_participants.scaffold_id and public.is_scaffold_manage_tier(s.company_id, s.project_id))
  );

create or replace function public.validate_scaffold_erection_participant_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_project_id uuid;
  v_erected_at date;
begin
  select company_id, project_id, erected_at into v_company_id, v_project_id, v_erected_at from public.scaffolds where id = new.scaffold_id;
  if v_company_id is null then
    raise exception 'scaffold % not found', new.scaffold_id;
  end if;

  new.company_id := v_company_id;
  new.project_id := v_project_id;
  if new.work_date is null then
    new.work_date := v_erected_at;
  end if;

  perform public.assert_employee_eligible_for_assignment(new.employee_id);

  if new.source_daily_team_id is not null then
    if not exists (select 1 from public.daily_teams dt where dt.id = new.source_daily_team_id and dt.project_id = v_project_id) then
      raise exception 'source_daily_team_id must reference a Today''s Team on the same project';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.validate_scaffold_erection_participant_insert() is
  'Derives company_id/project_id from the scaffold (never client-trusted), defaults work_date to the scaffold''s own erected_at when not explicitly supplied, and requires the employee to be a real, non-archived, same-company person (assert_employee_eligible_for_assignment — the same check every other assignment-style insert in this schema uses).';

create trigger scaffold_erection_participants_validate_insert
  before insert on public.scaffold_erection_participants
  for each row execute function public.validate_scaffold_erection_participant_insert();

-- Only removed_at/removed_by are ever legitimately updated (soft-removal)
-- — every other field is immutable once inserted (matches
-- daily_team_members' own no-edit-in-place convention).
create or replace function public.validate_scaffold_erection_participant_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.scaffold_id is distinct from old.scaffold_id
    or new.employee_id is distinct from old.employee_id
    or new.work_date is distinct from old.work_date
    or new.source is distinct from old.source
    or new.source_daily_team_id is distinct from old.source_daily_team_id
    or new.added_by is distinct from old.added_by
    or new.added_at is distinct from old.added_at then
    raise exception 'only removed_at/removed_by may be changed on a scaffold erection participant';
  end if;
  if old.removed_at is not null then
    raise exception 'this participant record has already been removed';
  end if;
  return new;
end;
$$;

create trigger scaffold_erection_participants_validate_update
  before update on public.scaffold_erection_participants
  for each row execute function public.validate_scaffold_erection_participant_update();

revoke all on public.scaffold_erection_participants from authenticated;
grant select, insert on public.scaffold_erection_participants to authenticated;
grant update (removed_by, removed_at) on public.scaffold_erection_participants to authenticated;

-- ============================================================================
-- Eligible alternate inspectors (Part 6/8/9) — mirrors
-- list_eligible_scaffold_foremen() exactly, project-scoped via
-- project_assignments (broader than team_assignments, since inspector/
-- foreman project involvement isn't specifically about leading a Today's
-- Team the way Responsible-Foreman eligibility is).
-- ============================================================================
create or replace function public.list_eligible_scaffold_inspectors(target_organization_id uuid, target_project_id uuid)
returns table (id uuid, first_name text, last_name text, employee_number text, role_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct on (e.id) e.id, e.first_name, e.last_name, e.employee_number, r.name
  from public.employees e
  join public.project_assignments pa on pa.employee_id = e.id and pa.project_id = target_project_id and pa.company_id = target_organization_id and pa.end_at is null
  join public.company_memberships m on m.user_id = e.profile_id and m.company_id = target_organization_id and m.status = 'active'
  join public.membership_roles mr on mr.membership_id = m.id
  join public.roles r on r.id = mr.role_id and r.name in ('inspector', 'foreman')
  where e.company_id = target_organization_id
    and e.archived_at is null
    and e.employment_status = 'active'
  order by e.id, r.name;
$$;

comment on function public.list_eligible_scaffold_inspectors(uuid, uuid) is
  'Candidate pool for the alternate-inspector picker shown to management/HSE roles (Part 8) — active, non-archived, non-offboarded employees who hold the company inspector or foreman role AND have an open project_assignments row on this project. Employee/Recruiter/Planner/etc never appear here regardless of project assignment.';

revoke all on function public.list_eligible_scaffold_inspectors(uuid, uuid) from public, anon;
grant execute on function public.list_eligible_scaffold_inspectors(uuid, uuid) to authenticated;

-- ============================================================================
-- Server-validated Inspector self-lock / eligible-alternate enforcement
-- (Parts 7/8/9/14) — closes the previously-real gap where inspector_id
-- was accepted from the client with only a "not archived, same company"
-- check (assert_employee_eligible_for_assignment). No UI-only enforcement.
-- ============================================================================
create or replace function public.assert_valid_inspection_inspector(target_company_id uuid, target_project_id uuid, target_inspector_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_caller_employee_id uuid;
  v_caller_is_admin_or_hse_tier boolean;
begin
  select id into v_caller_employee_id from public.employees where company_id = target_company_id and profile_id = auth.uid();

  -- Admin/HSE tier (Part 8) gets a free pick (self or an eligible
  -- alternate); everyone else (Inspector/Foreman tier, Part 7) is locked
  -- to themselves with no exception. company_admin is company-wide;
  -- project_manager is scoped to their own assigned project;
  -- platform_super_admin is global; hseq_manager is company-wide;
  -- hse_officer is project-scoped — this exactly mirrors
  -- canManageScaffold()'s existing tiers plus the two new administrative-
  -- override roles (company_admin, project_manager) this milestone adds.
  v_caller_is_admin_or_hse_tier :=
    public.has_any_company_role(target_company_id, array['hseq_manager', 'company_admin'])
    or (public.has_project_access(target_project_id) and public.has_any_company_role(target_company_id, array['hse_officer']))
    or public.is_project_manager(target_project_id)
    or public.is_platform_super_admin();

  if not v_caller_is_admin_or_hse_tier then
    if v_caller_employee_id is null or target_inspector_id is distinct from v_caller_employee_id then
      raise exception 'the inspector must be yourself';
    end if;
    return;
  end if;

  if v_caller_employee_id is not null and target_inspector_id = v_caller_employee_id then
    return;
  end if;

  if not exists (
    select 1
    from public.employees e
    join public.company_memberships m on m.user_id = e.profile_id and m.company_id = target_company_id and m.status = 'active'
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id and r.name in ('inspector', 'foreman')
    where e.id = target_inspector_id
      and e.company_id = target_company_id
      and e.archived_at is null
  ) then
    raise exception 'the selected inspector is not an eligible Inspector or Foreman in this company';
  end if;
end;
$$;

comment on function public.assert_valid_inspection_inspector(uuid, uuid, uuid) is
  'The real (server-side) enforcement behind Parts 7-9''s Inspector field rules. Inspector/Foreman-tier callers (anyone who is NOT admin/HSE-tier) may only ever set themselves — checked here, not just hidden/disabled in the UI, so a crafted request cannot spoof another inspector. Admin/HSE-tier callers (hseq_manager, hse_officer with project access, company_admin, the project''s own project_manager, platform_super_admin) may pick themselves or any active employee holding the inspector or foreman company role — never an arbitrary Employee/Recruiter/Planner/etc, checked via a real role-membership join, not trusted from the client.';

revoke all on function public.assert_valid_inspection_inspector(uuid, uuid, uuid) from public, anon;
grant execute on function public.assert_valid_inspection_inspector(uuid, uuid, uuid) to authenticated;

-- Wire the check into the existing insert trigger.
create or replace function public.validate_scaffold_inspection_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_previous_scaffold_id uuid;
  v_corrects_status public.scaffold_inspection_status;
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.inspector_id);
  perform public.assert_valid_inspection_inspector(new.company_id, new.project_id, new.inspector_id);

  if new.inspection_reason = 'reinspection_following_defects' and new.previous_inspection_id is null then
    raise exception 'a re-inspection following defects must reference the earlier inspection (previous_inspection_id)';
  end if;

  if new.previous_inspection_id is not null then
    select scaffold_id into v_previous_scaffold_id from public.scaffold_inspections where id = new.previous_inspection_id;
    if v_previous_scaffold_id is distinct from new.scaffold_id then
      raise exception 'previous_inspection_id must reference an inspection of the same scaffold';
    end if;
  end if;

  if new.corrects_inspection_id is not null then
    select status into v_corrects_status from public.scaffold_inspections where id = new.corrects_inspection_id and scaffold_id = new.scaffold_id;
    if v_corrects_status is null then
      raise exception 'corrects_inspection_id must reference a finalized inspection of the same scaffold';
    end if;
    if v_corrects_status <> 'finalized' then
      raise exception 'can only correct a FINALIZED inspection';
    end if;
  end if;

  new.status := 'draft';
  new.outcome := null;
  new.finalized_at := null;
  new.finalized_by := null;
  new.superseded_by_id := null;

  return new;
end;
$$;

-- ============================================================================
-- Administrative-override inspection creation (Part 8) — company_admin,
-- the project's own project_manager, and platform_super_admin previously
-- had ZERO access to create/manage scaffold inspections (canManageScaffold
-- only ever covered hseq_manager unconditionally and hse_officer/
-- inspector project-scoped) — the task explicitly directs adding this.
-- Mirrors scaffold_inspections' existing insert/update RLS shape exactly,
-- OR-ing in the two new roles.
-- ============================================================================
drop policy scaffold_inspections_insert on public.scaffold_inspections;
create policy scaffold_inspections_insert
  on public.scaffold_inspections
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.has_company_role(company_id, 'hseq_manager')
      or public.has_company_role(company_id, 'company_admin')
      or public.is_project_manager(project_id)
      or public.is_platform_super_admin()
      or (public.has_project_access(project_id) and public.has_any_company_role(company_id, array['hse_officer', 'inspector']))
    )
  );

drop policy scaffold_inspections_update on public.scaffold_inspections;
create policy scaffold_inspections_update
  on public.scaffold_inspections
  for update
  to authenticated
  using (public.is_company_member(company_id))
  with check (
    public.is_company_member(company_id)
    and (
      public.has_company_role(company_id, 'hseq_manager')
      or public.has_company_role(company_id, 'company_admin')
      or public.is_project_manager(project_id)
      or public.is_platform_super_admin()
      or (public.has_project_access(project_id) and public.has_any_company_role(company_id, array['hse_officer', 'inspector']))
    )
  );

comment on policy scaffold_inspections_insert on public.scaffold_inspections is
  'Part 8: company_admin (company-wide), the project''s own assigned project_manager, and platform_super_admin can now also create/manage scaffold inspections, in addition to the existing hseq_manager (unconditional)/hse_officer+inspector (project-scoped) tiers. Who the Inspector field may actually be set to is separately enforced by assert_valid_inspection_inspector() via the insert trigger, not by this policy.';
