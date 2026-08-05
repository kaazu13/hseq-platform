-- Scaffold Registration overhaul milestone: real scaffold dimensions
-- (replacing the single "maximum height" field) and a proper, eligibility-
-- enforced scaffold team (replacing the free-text "erected by /
-- responsible scaffold team" field with a structured, searchable
-- Responsible Foreman + scaffold_team_members table).
--
-- ── Dimensions ───────────────────────────────────────────────────────
-- `max_height_meters numeric(6,2)` is replaced by three columns —
-- `height_metres`/`length_metres`/`width_metres`, each `numeric(10,2)`
-- (a strict superset of the old column's range/precision, so no existing
-- value can fail to convert). Precision policy: 2 decimal places,
-- ROUNDED by Postgres's own `numeric(p,2)` semantics on write — not
-- silently truncated differently in different code paths, and not
-- rejected outright for e.g. "5.756", which a user might paste from a
-- spec sheet. `max_load_class` is untouched — it stays its own separate
-- field, as required.
--
-- The old column is DROPPED in this same migration, not kept alongside
-- the new ones: this migration updates every query/action/type/view that
-- referenced it in the same change set (see the milestone's implementation
-- report for the full list), so there is no external consumer left relying
-- on `max_height_meters` that a compatibility shim would serve. Existing
-- values are copied to `height_metres` first — see the UPDATE below —
-- so no historical data is lost, only the column name/shape changes.
--
-- ── Root cause of "Invalid input: expected string, received number" ──
-- modules/scaffolds/validation.ts's `maxHeightMeters` field was
-- (correctly) `z.string()...transform(...)` — the schema's INPUT is a
-- string, its OUTPUT is a number. modules/scaffolds/components/
-- scaffold-form.tsx's `handleSubmit` pre-converted the raw form value to
-- a `number` client-side BEFORE calling the schema
-- (`Number(rawMaxHeightMeters)`), based on a stale comment claiming the
-- action's input type "expects the already-coerced number|undefined
-- shape." It doesn't — `createScaffold`/`updateScaffold` both re-run
-- `scaffoldFormSchema.safeParse(input)` server-side, and a `z.string()`
-- field rejects a `number` input outright with exactly that message. Fixed
-- systematically: the client now passes the raw string through untouched
-- for all three dimension fields, matching every other string-input field
-- in this form (and every other form in this codebase) — the schema is
-- the ONLY place that coerces, both client- and server-side, since it's
-- literally the same code running in both places.
--
-- ── Scaffold team ────────────────────────────────────────────────────
-- `scaffold_team_members` — a proper relational table (not JSON/CSV in a
-- text column), one row per (scaffold, employee) assignment, added
-- non-destructively (never hard-deleted — `removed_at`/`removed_by`
-- close a row, matching the `project_assignments`/`team_assignments`
-- "close by setting end" convention already used everywhere else in this
-- schema) so historical team composition is preserved as evidence, not
-- silently rewritten when a team member changes. A partial unique index
-- keyed on ONLY the active (`removed_at is null`) rows enforces "one
-- active slot per position" and "one active membership per employee" —
-- a removed-then-re-added employee, or a re-filled position, is simply a
-- new row, keeping the full history intact.
--
-- Eligibility is enforced by database function + trigger, not just a
-- filtered picker (Part 7's explicit requirement) — the same class of
-- fix as scaffolds.responsible_foreman_id, which was previously validated
-- only via the generic assert_employee_eligible_for_assignment() (active
-- employment) and is now ALSO checked against the actual Foreman role/
-- project-team-assignment model via is_eligible_scaffold_foreman().
--
-- Role model used for eligibility (confirmed by reading the actual
-- schema, not assumed):
--   - "Foreman" exists ONLY as team_assignments.assignment_role='foreman'
--     at the project level (never project_assignments — see
--     20260728090000_projects_and_teams.sql's own header comment) PLUS
--     the organization-level `foreman` role via membership_roles/roles.
--     Both are required here — "must have the Foreman role" (org-level)
--     "and be eligible for the selected project" (team_assignments) are
--     treated as two independently-required conditions, per this
--     milestone's explicit wording. There is no documented org-wide
--     Foreman scope to fall back to (unlike HSE Manager) — Foreman is
--     always project/team-assignment-driven, so only project-assigned
--     Foremen are ever eligible.
--   - Ordinary scaffold team members: this platform has NO reliable
--     trade/job-title field (`employees.position_title` is free text,
--     never structured — confirmed by reading the table definition) —
--     per this milestone's explicit fallback instruction, no
--     "Scaffolder" classification is fabricated. Eligibility is instead:
--     active employee, on the selected project's roster
--     (project_assignments, open row — the same eligibility source every
--     other picker in this codebase already uses), EXCLUDING anyone who
--     holds any of the specialist/management organization roles named in
--     the milestone brief (foreman, hseq_manager, hse_officer,
--     project_manager, inspector, company_admin). An employee holding
--     no elevated role, or only `employee`, is eligible. A structured
--     trade/job-title field remains a genuine, documented future need —
--     this is the honest, disclosed limitation the brief asked for, not
--     a pretended solution.

-- ── 1) dimensions ─────────────────────────────────────────────────────
alter table public.scaffolds add column height_metres numeric(10, 2);
alter table public.scaffolds add column length_metres numeric(10, 2);
alter table public.scaffolds add column width_metres numeric(10, 2);

alter table public.scaffolds add constraint scaffolds_height_positive check (height_metres is null or height_metres > 0);
alter table public.scaffolds add constraint scaffolds_length_positive check (length_metres is null or length_metres > 0);
alter table public.scaffolds add constraint scaffolds_width_positive check (width_metres is null or width_metres > 0);

update public.scaffolds set height_metres = max_height_meters where max_height_meters is not null;

alter table public.scaffolds drop column max_height_meters;

comment on column public.scaffolds.height_metres is 'Scaffold height in metres, numeric(10,2) — rounded to 2 decimal places on write, not truncated/rejected. Migrated from the removed max_height_meters column.';
comment on column public.scaffolds.length_metres is 'Scaffold length in metres, numeric(10,2).';
comment on column public.scaffolds.width_metres is 'Scaffold width in metres, numeric(10,2).';

-- Column-level UPDATE grant must be reissued in full — a newly added
-- column is never automatically covered by a previously-granted column
-- list, and dropping max_height_meters removes it from the grant
-- automatically but the statement is still restated here for clarity.
revoke update on public.scaffolds from authenticated;
grant update (
  tag_number, work_area, structure_reference, scaffold_type, intended_use,
  max_load_class, height_metres, length_metres, width_metres, erected_by,
  responsible_foreman_id, erected_at, notes, updated_by
) on public.scaffolds to authenticated;

-- ── 2) Foreman eligibility (organization role + project team assignment) ──
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
      and e.organization_id = target_organization_id
      and e.archived_at is null
      and e.employment_status = 'active'
  )
  and public.employee_has_any_organization_role(target_employee_id, target_organization_id, array['foreman'])
  and exists (
    select 1 from public.team_assignments ta
    where ta.employee_id = target_employee_id
      and ta.project_id = target_project_id
      and ta.organization_id = target_organization_id
      and ta.assignment_role = 'foreman'
      and ta.end_at is null
  );
$$;

comment on function public.is_eligible_scaffold_foreman(uuid, uuid, uuid) is
  'True only if the employee is active, holds the organization-level foreman role (membership_roles), AND has an open team_assignments row with assignment_role=''foreman'' on the target project. Both checks are required — see this migration''s header comment for why. SECURITY DEFINER: needs to evaluate an arbitrary referenced employee, not the caller.';

revoke all on function public.is_eligible_scaffold_foreman(uuid, uuid, uuid) from public, anon;
grant execute on function public.is_eligible_scaffold_foreman(uuid, uuid, uuid) to authenticated;

-- Candidate list for the Responsible Foreman picker — minimal safe fields
-- only (id, name, employee number), per Part 7's "do not expose private
-- employee information unnecessarily."
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
    and ta.organization_id = target_organization_id
    and ta.assignment_role = 'foreman'
    and ta.end_at is null
  join public.organization_memberships m on m.user_id = e.profile_id and m.organization_id = target_organization_id and m.status = 'active'
  join public.membership_roles mr on mr.membership_id = m.id
  join public.roles r on r.id = mr.role_id and r.name = 'foreman'
  where e.organization_id = target_organization_id
    and e.archived_at is null
    and e.employment_status = 'active'
  order by e.last_name, e.first_name;
$$;

comment on function public.list_eligible_scaffold_foremen(uuid, uuid) is
  'Candidate pool for the Responsible Foreman picker — active employees who both hold the organization foreman role AND have an open Foreman team_assignments row on this project. An employee who is "a foreman" in name only, with no activated platform account holding the role, will not appear here — see this migration''s header comment.';

revoke all on function public.list_eligible_scaffold_foremen(uuid, uuid) from public, anon;
grant execute on function public.list_eligible_scaffold_foremen(uuid, uuid) to authenticated;

-- ── 3) ordinary scaffold team-member eligibility ─────────────────────
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
      and e.organization_id = target_organization_id
      and e.archived_at is null
      and e.employment_status = 'active'
  )
  and exists (
    select 1 from public.project_assignments pa
    where pa.employee_id = target_employee_id
      and pa.project_id = target_project_id
      and pa.organization_id = target_organization_id
      and pa.end_at is null
  )
  and not public.employee_has_any_organization_role(
    target_employee_id, target_organization_id,
    array['foreman', 'hseq_manager', 'hse_officer', 'project_manager', 'company_admin', 'inspector']
  );
$$;

comment on function public.is_eligible_scaffold_team_member(uuid, uuid, uuid) is
  'True if the employee is active, on the project roster (project_assignments, open row), and does NOT hold any specialist/management organization role. No trade/job-title field exists on this platform yet (employees.position_title is free text) — see this migration''s header comment for the documented, disclosed limitation this implements instead of fabricating a "Scaffolder" classification.';

revoke all on function public.is_eligible_scaffold_team_member(uuid, uuid, uuid) from public, anon;
grant execute on function public.is_eligible_scaffold_team_member(uuid, uuid, uuid) to authenticated;

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
    and pa.organization_id = target_organization_id
    and pa.end_at is null
  where e.organization_id = target_organization_id
    and e.archived_at is null
    and e.employment_status = 'active'
    and not public.employee_has_any_organization_role(
      e.id, target_organization_id,
      array['foreman', 'hseq_manager', 'hse_officer', 'project_manager', 'company_admin', 'inspector']
    )
  order by e.last_name, e.first_name;
$$;

comment on function public.list_eligible_scaffold_team_members(uuid, uuid) is
  'Candidate pool for scaffold team-member slots. position_title is returned as-is (often null) — never mapped to a fabricated "Scaffolder" label.';

revoke all on function public.list_eligible_scaffold_team_members(uuid, uuid) from public, anon;
grant execute on function public.list_eligible_scaffold_team_members(uuid, uuid) to authenticated;

-- ── 4) tighten scaffolds.responsible_foreman_id validation ───────────
create or replace function public.validate_scaffold_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.responsible_foreman_id);
  if not public.is_eligible_scaffold_foreman(new.responsible_foreman_id, new.organization_id, new.project_id) then
    raise exception 'employee % is not an eligible Responsible Foreman for this project — must hold the Foreman role and an active Foreman team assignment on this project', new.responsible_foreman_id;
  end if;
  return new;
end;
$$;

create or replace function public.validate_scaffold_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'scaffold identity/creation fields cannot be changed';
  end if;

  if new.status is distinct from old.status then
    raise exception 'scaffolds.status is a synced snapshot from finalized inspections and cannot be set directly — see sync_scaffold_status_snapshot()';
  end if;

  if new.responsible_foreman_id is distinct from old.responsible_foreman_id then
    perform public.assert_employee_eligible_for_assignment(new.responsible_foreman_id);
    if not public.is_eligible_scaffold_foreman(new.responsible_foreman_id, new.organization_id, new.project_id) then
      raise exception 'employee % is not an eligible Responsible Foreman for this project — must hold the Foreman role and an active Foreman team assignment on this project', new.responsible_foreman_id;
    end if;
  end if;

  return new;
end;
$$;

-- ── 5) scaffold_team_members ──────────────────────────────────────────
create table public.scaffold_team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Denormalized from the scaffold, never client-trusted — derived by
  -- validate_scaffold_team_member_insert() below, same convention as
  -- every other denormalized project_id in this schema.
  project_id uuid not null,
  scaffold_id uuid not null,
  employee_id uuid not null,
  -- 1-based slot number within THIS scaffold's team, suggested range
  -- documented at the application layer (1-50, see modules/scaffolds/
  -- validation.ts) — the upper bound here is deliberately generous
  -- rather than exactly 50, so the app-layer limit can be the single
  -- source of truth for the "reasonable" bound without the database
  -- needing to change if that number is ever revisited.
  team_position integer not null,
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  removed_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz,
  constraint scaffold_team_members_position_range check (team_position > 0 and team_position <= 200),
  constraint scaffold_team_members_removed_consistency check ((removed_at is null) = (removed_by is null)),
  constraint scaffold_team_members_id_organization_id_key unique (id, organization_id),
  constraint scaffold_team_members_scaffold_fk foreign key (scaffold_id, organization_id) references public.scaffolds (id, organization_id) on delete cascade,
  constraint scaffold_team_members_project_fk foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  constraint scaffold_team_members_employee_fk foreign key (employee_id, organization_id) references public.employees (id, organization_id) on delete restrict
);

comment on table public.scaffold_team_members is
  'Ordinary scaffold team members (never the Responsible Foreman, who stays on scaffolds.responsible_foreman_id) — one row per assignment, added non-destructively. removed_at/removed_by close a row rather than deleting it, so historical team composition is preserved as HSEQ evidence, matching project_assignments/team_assignments'' own convention. "Current team" = rows where removed_at is null.';
comment on column public.scaffold_team_members.team_position is
  'Display order (Team member 1, 2, 3...) — not a meaningful identity, just stable numbering for the form/detail view.';

-- Exactly one ACTIVE membership per employee per scaffold — the DB-level
-- backstop for "the same employee cannot occupy multiple team-member
-- slots," independent of whatever the UI/Server Function already filters.
create unique index scaffold_team_members_active_employee_key
  on public.scaffold_team_members (scaffold_id, employee_id)
  where removed_at is null;

-- Exactly one ACTIVE row per slot number per scaffold.
create unique index scaffold_team_members_active_position_key
  on public.scaffold_team_members (scaffold_id, team_position)
  where removed_at is null;

create index scaffold_team_members_scaffold_id_idx on public.scaffold_team_members (scaffold_id) where removed_at is null;

create or replace function public.validate_scaffold_team_member_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_scaffold record;
begin
  select organization_id, project_id, responsible_foreman_id
  into v_scaffold
  from public.scaffolds
  where id = new.scaffold_id;

  if v_scaffold.organization_id is null then
    raise exception 'scaffold % not found', new.scaffold_id;
  end if;
  if v_scaffold.organization_id is distinct from new.organization_id then
    raise exception 'scaffold % does not belong to organization %', new.scaffold_id, new.organization_id;
  end if;

  -- project_id is ALWAYS derived from the scaffold, regardless of what
  -- the client sent — never client-trusted, same as every other
  -- denormalized project_id in this schema.
  new.project_id := v_scaffold.project_id;

  if new.employee_id = v_scaffold.responsible_foreman_id then
    raise exception 'the Responsible Foreman cannot also be added as an ordinary scaffold team member';
  end if;

  perform public.assert_employee_eligible_for_assignment(new.employee_id);

  if not public.is_eligible_scaffold_team_member(new.employee_id, new.organization_id, v_scaffold.project_id) then
    raise exception 'employee % is not an eligible ordinary scaffold team member for this project', new.employee_id;
  end if;

  return new;
end;
$$;

create trigger scaffold_team_members_validate_insert
  before insert on public.scaffold_team_members
  for each row execute function public.validate_scaffold_team_member_insert();

-- Only removed_at/removed_by may ever change (non-destructive removal) —
-- everything else about a team-member row is immutable once inserted;
-- "changing" a slot's occupant is remove-then-insert, never an update in
-- place, so history is never rewritten.
create or replace function public.validate_scaffold_team_member_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
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

create trigger scaffold_team_members_validate_update
  before update on public.scaffold_team_members
  for each row execute function public.validate_scaffold_team_member_update();

-- ── 6) RLS ────────────────────────────────────────────────────────────
alter table public.scaffold_team_members enable row level security;
alter table public.scaffold_team_members force row level security;

-- No DELETE grant at all — HSEQ evidence, never hard-deleted.
grant select, insert, update on public.scaffold_team_members to authenticated;
revoke update on public.scaffold_team_members from authenticated;
grant update (removed_by, removed_at) on public.scaffold_team_members to authenticated;

-- Same visibility as the scaffold record itself (scaffolds_select) — team
-- composition is part of the scaffold's operational record, not a
-- separately-scoped concern.
create policy scaffold_team_members_select
  on public.scaffold_team_members
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or public.has_project_access(project_id)
    )
  );

-- Same manage tier as the scaffold record itself (is_scaffold_manage_tier
-- — hseq_manager org-wide, or hse_officer/inspector with project access).
create policy scaffold_team_members_insert
  on public.scaffold_team_members
  for insert
  to authenticated
  with check (public.is_scaffold_manage_tier(organization_id, project_id));

create policy scaffold_team_members_update
  on public.scaffold_team_members
  for update
  to authenticated
  using (public.is_scaffold_manage_tier(organization_id, project_id))
  with check (public.is_scaffold_manage_tier(organization_id, project_id));
