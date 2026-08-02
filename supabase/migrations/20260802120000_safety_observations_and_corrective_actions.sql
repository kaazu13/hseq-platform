-- Safety Observations and Corrective Actions milestone.
--
-- Builds on docs/DATABASE_SCHEMA.md's `safety_observations`/`corrective_actions`
-- proposal (§6), extended and deviated from the same way LMRA was (see that
-- migration's header comment for the established precedent this follows):
--   1. `created_by`/`created_at` naming (this codebase's actual convention)
--      instead of the proposal's mix of `observed_by`/`observed_at`.
--      `observer_id` (a real `employees` FK, composite with organization_id
--      — matches `lmra_assessments.responsible_foreman_id`) replaces the
--      proposal's `observed_by uuid FK profiles(id)`: an observation must
--      show who observed it as a real staff member, not just an auth
--      account, consistent with how LMRA names its accountable party.
--   2. `project_id` is NOT NULL here (the proposal had it nullable) — every
--      observation in this milestone's explicit requirements is tied to a
--      specific project/work area; an org-wide, no-project observation
--      isn't part of the stated scope.
--   3. No `location_id` FK to `project_locations` — that table doesn't
--      exist yet; `work_area text` matches the already-implemented
--      `projects.location`/`lmra_assessments.work_area` pattern.
--   4. `category` is a fixed enum (`observation_category`, 13 values, this
--      milestone's exact required list) rather than the proposal's
--      `category_id` FK into the configurable `event_categories` table —
--      this milestone's requirements specify a closed, fixed vocabulary,
--      the same "fixed v1 catalogue, not organization-configurable"
--      precedent as `lmra_hazard_type`/`team_color`/`roles`.
--   5. `status` is a plain two-state workflow (`open`/`closed`, HSE-Manager-
--      gated close — see RLS below) rather than the proposal's more open
--      `observation_status` — this milestone's requirements only ever
--      describe "reviewed" and "closed" as timestamps to record, not a
--      richer state machine; `reviewed_at`/`reviewed_by` are independent
--      milestone timestamps within the `open` state, not separate status
--      values (mirrors how LMRA's `reviewed_at` is set at a status
--      transition without itself being a status value).
--   6. No `deleted_at` — matches LMRA's status-workflow-supersedes-soft-
--      delete precedent; this table is never hard-deleted (no DELETE grant
--      at all) and has no reason to be soft-deleted either once `status`
--      already carries its lifecycle.
--   7. Photos/attachments are explicitly DEFERRED, not built here — this
--      milestone's own instructions gate them on "if the current storage
--      architecture supports them safely." It does not: there is no
--      Supabase Storage bucket, no storage.objects RLS policy, and no
--      Storage client usage anywhere in this codebase today (confirmed by
--      search before writing this migration). Building that from scratch —
--      bucket creation, storage-path RLS mirroring table RLS, upload
--      handling — is a substantial separate piece of infrastructure, not a
--      safe side effect of this milestone. `corrective_actions.closure_evidence`
--      below is a TEXT field (a description of the evidence), not a file
--      reference, for the same reason.
--   8. Anonymous worker reporting is explicitly DEFERRED, not built here —
--      every RLS policy on every table in this schema requires
--      `is_organization_member()`, and every write requires a resolvable
--      `auth.uid()` for `created_by`/audit purposes; there is no
--      unauthenticated-submission pathway anywhere in this codebase's auth
--      model (proxy.ts requires a session for every `(app)` route). Adding
--      one would mean either (a) a genuinely unauthenticated write path
--      that can't be tied to an organization without leaking cross-tenant
--      write access, or (b) a shared "anonymous" service account per
--      organization, which defeats the auditability this schema is built
--      around everywhere else. Neither is a safe fit for "without
--      weakening organization isolation or auditability" — deferred.
--
-- Permissions follow docs/ROLES_AND_PERMISSIONS.md §5's Safety Observations
-- and Corrective Actions rows exactly, and §3's legend (F = create/view/
-- edit/close/approve; M = create/view/edit/approve, not close/delete; C =
-- create/edit own entries, view scope-wide; O = own records only; V =
-- view only). Both rows are notably DIFFERENT shapes from LMRA and from
-- each other:
--   Safety Observations: — | V | V | V⁴ | M | C⁴ | C⁴ | C⁴ | — | — | C¹²
--     No role holds "F" here at all — HSE Manager's "M" is the ceiling.
--     Company Manager/Workforce Coordinator/Project Manager are View-only.
--     HSE Officer/Foreman/Inspector/Employee (footnote 12: "any
--     authenticated Employee can submit... intentionally broad") can all
--     CREATE, but "C" only lets them EDIT THEIR OWN entries — critically,
--     this means a Foreman here does NOT get LMRA's broader "manage
--     everyone's records within my project" — only their own. Reviewing
--     (reviewed_at/reviewed_by) and closing are both HSE-Manager-only:
--     "approve" appears in M's definition but not C's, and closing is
--     treated the same way LMRA treats archiving (RLS admits the attempt,
--     a trigger is the actual gate) — see validate_safety_observation_update().
--   Corrective Actions: — | V | V | M⁴ | F | M⁴¹⁰ | M⁴¹⁰ | M⁴¹⁰ | — | — | O¹¹
--     HSE Manager is unrestricted org-wide ("F"). Project Manager gets a
--     clean, unrestricted-within-project "M⁴" (footnote 10 does not apply
--     to PM). HSE Officer/Foreman/Inspector get "M⁴" WITH footnote 10's
--     explicit carve-out: they can create/manage actions raised from their
--     own findings and update status on actions assigned to them, but
--     cannot CLOSE/REJECT an action assigned to someone else without HSE
--     Manager (or PM) sign-off. Employee gets "O¹¹": can update/comment
--     (status progress only) on an action assigned to them, never
--     due_date/priority/description, never close/reject it themselves.

-- ── 1) enums ──────────────────────────────────────────────────────────
create type public.observation_category as enum (
  'positive_observation',
  'unsafe_act',
  'unsafe_condition',
  'line_of_fire',
  'working_at_height',
  'falling_objects',
  'material_handling',
  'housekeeping',
  'tools_equipment',
  'mobile_equipment_mewp',
  'access_egress',
  'ppe',
  'other'
);

comment on type public.observation_category is
  'Fixed 13-item safety observation category list for this milestone''s explicit requirement — not organization-configurable, same "fixed v1 catalogue" precedent as lmra_hazard_type. Deliberately a SEPARATE enum from lmra_hazard_type even though several labels overlap (line_of_fire, working_at_height, falling_objects, housekeeping, tools_equipment, mobile_equipment_mewp, access_egress) — the two lists diverge enough (this one has positive_observation/unsafe_act/unsafe_condition/material_handling/ppe; LMRA has manual_material_handling/lifting_operations/weather_conditions/simultaneous_operations) that sharing one type would force one list to carry values meaningless to the other.';

create type public.observation_risk_level as enum ('low', 'medium', 'high', 'critical');

comment on type public.observation_risk_level is
  '"High-risk" for dashboard/reporting purposes (e.g. the Safety Overview''s "Open high-risk observations" count) means high or critical — see modules/observations/types.ts''s OBSERVATION_HIGH_RISK_LEVELS.';

create type public.observation_status as enum ('open', 'closed');

comment on type public.observation_status is
  'Deliberately two states, not a richer workflow — see this migration''s header comment, point 5. Closing is HSE-Manager-only and is blocked while any linked corrective_actions row is unresolved (open/in_progress/awaiting_verification) — see validate_safety_observation_update() and assert_no_unresolved_corrective_actions().';

create type public.corrective_action_priority as enum ('low', 'medium', 'high', 'critical');

create type public.corrective_action_status as enum ('open', 'in_progress', 'awaiting_verification', 'closed', 'rejected');

comment on type public.corrective_action_status is
  'open -> in_progress -> awaiting_verification are free forward progress (any authorized editor). awaiting_verification -> closed/rejected ("closing out") requires HSE Manager, the project''s own Project Manager, or (per docs/ROLES_AND_PERMISSIONS.md §5 footnote 10) the action''s own author/assignee among HSE Officer/Foreman/Inspector. closed/rejected -> open ("reopen") requires the same authority set plus a mandatory reason — see validate_corrective_action_update().';

-- ── 2) safety_observations ───────────────────────────────────────────
create table public.safety_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  work_area text not null,
  observed_at timestamptz not null default now(),
  observer_id uuid not null,
  category public.observation_category not null,
  description text not null,
  immediate_action_taken text,
  risk_level public.observation_risk_level not null default 'low',
  is_stop_work boolean not null default false,
  status public.observation_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  constraint safety_observations_work_area_not_blank check (btrim(work_area) <> ''),
  constraint safety_observations_description_not_blank check (btrim(description) <> ''),
  -- Enables composite FKs from safety_observation_participants/
  -- corrective_actions below — same pattern as lmra_assessments.
  constraint safety_observations_id_organization_id_key unique (id, organization_id),
  constraint safety_observations_project_fk foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  constraint safety_observations_observer_fk foreign key (observer_id, organization_id) references public.employees (id, organization_id) on delete restrict
);

comment on table public.safety_observations is
  'A site safety observation — positive recognition or a safety issue (unsafe act/condition/etc.), reported by anyone with project access, not just management (docs/ROLES_AND_PERMISSIONS.md §5 footnote 12: "safety reporting should never be gated behind a manager role"). HSEQ evidence — never hard-deleted (no DELETE grant at all); status = ''closed'' is the terminal state, HSE-Manager-only (see RLS/trigger below).';
comment on column public.safety_observations.observer_id is
  'ON DELETE RESTRICT (not SET NULL) — matches lmra_assessments.responsible_foreman_id: an observation must always show who made it; if that employee record needs removing, this must be reassigned first, never silently orphaned.';
comment on column public.safety_observations.category is
  'positive_observation is how this table distinguishes a positive recognition from a safety issue — see modules/observations/types.ts''s OBSERVATION_CATEGORY_LABELS and the UI''s dedicated positive-vs-issue badge treatment (never rendered with the same tone as an unsafe_act/unsafe_condition badge).';
comment on column public.safety_observations.is_stop_work is
  'A plain boolean, not an enum like LMRA''s go/no_go result — an observation is not itself a formal go/no-go check; this simply flags that the observer judged conditions unsafe enough to stop work when they saw it.';

create index safety_observations_organization_id_idx on public.safety_observations (organization_id);
create index safety_observations_project_id_idx on public.safety_observations (project_id);
create index safety_observations_status_idx on public.safety_observations (organization_id, status);
create index safety_observations_risk_level_idx on public.safety_observations (organization_id, risk_level);
create index safety_observations_observed_at_idx on public.safety_observations (organization_id, observed_at);
create index safety_observations_observer_id_idx on public.safety_observations (observer_id);
create index safety_observations_created_by_idx on public.safety_observations (created_by);

create trigger safety_observations_set_updated_at
  before update on public.safety_observations
  for each row execute function public.set_updated_at();

-- ── 3) safety_observation_participants — people involved, optional ────
create table public.safety_observation_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  observation_id uuid not null references public.safety_observations (id) on delete cascade,
  employee_id uuid not null,
  created_at timestamptz not null default now(),
  constraint safety_observation_participants_one_row_per_employee unique (observation_id, employee_id),
  constraint safety_observation_participants_employee_fk foreign key (employee_id, organization_id) references public.employees (id, organization_id) on delete cascade
);

comment on table public.safety_observation_participants is
  'People involved in the observation, "where appropriate" per this milestone''s requirement — deliberately optional (zero rows is valid, e.g. a positive observation of tidy housekeeping with no specific individual involved). Same join-table shape as lmra_participants.';

create index safety_observation_participants_observation_id_idx on public.safety_observation_participants (observation_id);
create index safety_observation_participants_employee_id_idx on public.safety_observation_participants (employee_id);
create index safety_observation_participants_organization_id_idx on public.safety_observation_participants (organization_id);

-- ── 4) corrective_actions — one observation, many actions ─────────────
create table public.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  observation_id uuid not null,
  -- Denormalized from the parent observation for RLS-policy simplicity/
  -- performance — same rationale as lmra_hazards.organization_id (avoids a
  -- join through safety_observations in every policy) — kept in sync by
  -- sync_corrective_action_project_id() below, mirroring how this codebase
  -- already keeps other denormalized columns correct via trigger rather
  -- than trusting the client to pass the right value.
  project_id uuid not null,
  description text not null,
  responsible_person_id uuid not null,
  priority public.corrective_action_priority not null default 'medium',
  due_date date not null,
  status public.corrective_action_status not null default 'open',
  completion_notes text,
  closure_evidence text,
  reopen_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint corrective_actions_description_not_blank check (btrim(description) <> ''),
  constraint corrective_actions_observation_fk foreign key (observation_id, organization_id) references public.safety_observations (id, organization_id) on delete cascade,
  constraint corrective_actions_project_fk foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  constraint corrective_actions_responsible_person_fk foreign key (responsible_person_id, organization_id) references public.employees (id, organization_id) on delete restrict
);

comment on table public.corrective_actions is
  'A remediation task raised from a safety observation — one observation may have many. HSEQ evidence — never hard-deleted (no DELETE grant at all). "Overdue" is NOT a stored status (this milestone''s explicit requirement: "must be derived consistently rather than manually assigned") — it is due_date < current_date and status not in (''closed'',''rejected''), computed identically everywhere it''s needed (modules/corrective-actions/types.ts''s isCorrectiveActionOverdue()), never a column here.';
comment on column public.corrective_actions.responsible_person_id is
  'ON DELETE RESTRICT — same rationale as safety_observations.observer_id: an action must always show who is accountable.';
comment on column public.corrective_actions.reopen_reason is
  'Required (enforced by validate_corrective_action_update()) whenever status moves TO rejected, or FROM closed/rejected back to open — this milestone''s explicit requirement that both "reopening" and "rejecting" require a reason. Holds the most recent such reason, not a full history (matches this codebase''s existing precedent of not building a separate revision-history table — see lmra_assessments'' table comment).';

create index corrective_actions_organization_id_status_due_date_idx on public.corrective_actions (organization_id, status, due_date);
create index corrective_actions_responsible_person_id_status_idx on public.corrective_actions (responsible_person_id, status);
create index corrective_actions_observation_id_idx on public.corrective_actions (observation_id);
create index corrective_actions_project_id_idx on public.corrective_actions (project_id);

create trigger corrective_actions_set_updated_at
  before update on public.corrective_actions
  for each row execute function public.set_updated_at();

-- Keeps corrective_actions.project_id in sync with its parent observation
-- at insert time — the client supplies observation_id; project_id is
-- derived, never independently trusted from client input (closes off a
-- cross-project spoofing path: a caller cannot claim a corrective action
-- belongs to a project other than its actual parent observation's).
create or replace function public.sync_corrective_action_project_id()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  select project_id into new.project_id
  from public.safety_observations
  where id = new.observation_id and organization_id = new.organization_id;

  if new.project_id is null then
    raise exception 'safety observation % not found in organization %', new.observation_id, new.organization_id;
  end if;

  return new;
end;
$$;

create trigger corrective_actions_sync_project_id
  before insert on public.corrective_actions
  for each row execute function public.sync_corrective_action_project_id();

-- ── 5) insert-time eligibility ─────────────────────────────────────────
create or replace function public.validate_safety_observation_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.observer_id);
  return new;
end;
$$;

create trigger safety_observations_validate_insert
  before insert on public.safety_observations
  for each row execute function public.validate_safety_observation_insert();

create or replace function public.validate_safety_observation_participant_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_employee_eligible_for_assignment(new.employee_id);
  return new;
end;
$$;

create trigger safety_observation_participants_validate_insert
  before insert on public.safety_observation_participants
  for each row execute function public.validate_safety_observation_participant_insert();

-- New corrective actions may only be raised while the parent observation
-- is still open — mirrors assert_lmra_assessment_is_draft()'s "the parent
-- record's lifecycle gates its children" shape, and is also what makes
-- "closing an observation with unresolved actions is blocked" a meaningful,
-- stable guarantee (nothing can slip a fresh unresolved action in after
-- closure is attempted).
create or replace function public.assert_safety_observation_is_open(target_observation_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status public.observation_status;
begin
  select status into v_status from public.safety_observations where id = target_observation_id;

  if v_status is null then
    raise exception 'safety observation % not found', target_observation_id;
  end if;

  if v_status <> 'open' then
    raise exception 'safety observation % is not open (status = %) — corrective actions can only be added while it is open', target_observation_id, v_status;
  end if;
end;
$$;

create or replace function public.validate_corrective_action_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_safety_observation_is_open(new.observation_id);
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.responsible_person_id);
  return new;
end;
$$;

-- AFTER the project_id sync trigger (alphabetical trigger-name ordering
-- within the same timing/event runs "sync" before "validate" — confirmed
-- by naming both explicitly below rather than relying on creation order,
-- since Postgres fires same-timing triggers in name order, not creation
-- order) — validate_corrective_action_insert() needs new.project_id to
-- already be populated by sync_corrective_action_project_id().
create trigger corrective_actions_validate_b_insert
  before insert on public.corrective_actions
  for each row execute function public.validate_corrective_action_insert();

-- ── 6) update-time state-machine guards ────────────────────────────────

-- Blocked while any corrective_actions row for this observation is
-- unresolved (open/in_progress/awaiting_verification) — this milestone's
-- explicit "closing an observation with unresolved mandatory actions must
-- be blocked" requirement. Every corrective action raised against an
-- observation counts (there is no separate "optional" designation in this
-- milestone's requirements — if it exists, it must be resolved).
create or replace function public.assert_no_unresolved_corrective_actions(target_observation_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.corrective_actions
    where observation_id = target_observation_id
      and status not in ('closed', 'rejected')
  ) then
    raise exception 'safety observation % has unresolved corrective actions and cannot be closed', target_observation_id;
  end if;
end;
$$;

-- Mirrors lmra_assessments' validate_lmra_assessment_update() shape: RLS
-- (below) admits an attempt broadly enough that a non-HSE-Manager editor
-- gets "you can't close this," not "you can't touch this row at all"; this
-- trigger is where the HSE-Manager-only close gate and the
-- unresolved-actions block are actually enforced.
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
    or new.organization_id is distinct from old.organization_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'safety observation identity/creation fields cannot be changed';
  end if;

  if new.status = 'closed' and old.status <> 'closed' then
    if not public.has_organization_role(new.organization_id, 'hseq_manager') then
      raise exception 'only an HSE Manager may close a safety observation';
    end if;
    perform public.assert_no_unresolved_corrective_actions(new.id);
  end if;

  -- reviewed_at/reviewed_by are likewise an HSE-Manager-only milestone —
  -- docs/ROLES_AND_PERMISSIONS.md §5's "C" tier (HSE Officer/Foreman/
  -- Inspector/Employee) has no "approve" verb in its definition, unlike
  -- LMRA's Foreman "M" tier which does.
  if new.reviewed_at is distinct from old.reviewed_at or new.reviewed_by is distinct from old.reviewed_by then
    if not public.has_organization_role(new.organization_id, 'hseq_manager') then
      raise exception 'only an HSE Manager may mark a safety observation reviewed';
    end if;
  end if;

  return new;
end;
$$;

create trigger safety_observations_validate_update
  before update on public.safety_observations
  for each row execute function public.validate_safety_observation_update();

create or replace function public.validate_safety_observation_participant_write()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_observation_id uuid;
begin
  if TG_OP = 'DELETE' then
    v_observation_id := old.observation_id;
  else
    v_observation_id := new.observation_id;
  end if;

  perform public.assert_safety_observation_is_open(v_observation_id);

  if TG_OP = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

create trigger safety_observation_participants_validate_insert_open_only
  before insert on public.safety_observation_participants
  for each row execute function public.validate_safety_observation_participant_write();

create trigger safety_observation_participants_validate_delete_open_only
  before delete on public.safety_observation_participants
  for each row execute function public.validate_safety_observation_participant_write();

-- Who may transition a corrective action TO closed/rejected, or FROM
-- closed/rejected back to open ("reopen") — docs/ROLES_AND_PERMISSIONS.md
-- §5 footnote 10: HSE Manager and the project's own Project Manager always
-- may; an HSE Officer/Foreman/Inspector may only for an action they
-- authored OR are personally responsible for; nobody else (Employee
-- included — footnote 11: "cannot... close it") may at all.
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
    public.has_organization_role(target_organization_id, 'hseq_manager')
    or public.is_project_manager(target_project_id)
    or (
      public.has_any_organization_role(target_organization_id, array['hse_officer', 'foreman', 'inspector'])
      and (
        target_created_by = auth.uid()
        or exists (
          select 1 from public.employees e
          where e.id = target_responsible_person_id and e.profile_id = auth.uid()
        )
      )
    );
$$;

comment on function public.can_close_corrective_action(uuid, uuid, uuid, uuid) is
  'Shared by validate_corrective_action_update() (the real enforcement) and modules/corrective-actions/permissions.ts (UI-gating only, same trust boundary as every other permissions.ts in this codebase).';

revoke all on function public.can_close_corrective_action(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.can_close_corrective_action(uuid, uuid, uuid, uuid) to authenticated;

create or replace function public.validate_corrective_action_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.observation_id is distinct from old.observation_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'corrective action identity/creation fields cannot be changed';
  end if;

  -- Employee (O¹¹): status progress only, never due_date/priority/
  -- description/responsible_person_id, and never a direct move to
  -- closed/rejected — enforced here since RLS alone can admit the UPDATE
  -- attempt (they may act on their own assigned action) but cannot express
  -- "these specific columns" as cleanly as a trigger comparing OLD/NEW.
  if not (
    public.has_organization_role(new.organization_id, 'hseq_manager')
    or public.is_project_manager(new.project_id)
    or public.has_any_organization_role(new.organization_id, array['hse_officer', 'foreman', 'inspector'])
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
  end if;

  -- Closing (-> closed/rejected) or reopening (closed/rejected -> open)
  -- both require the same close-tier authority.
  if (new.status in ('closed', 'rejected') and old.status not in ('closed', 'rejected'))
    or (old.status in ('closed', 'rejected') and new.status = 'open') then
    if not public.can_close_corrective_action(new.organization_id, new.project_id, new.created_by, new.responsible_person_id) then
      raise exception 'you do not have authority to close, reject, or reopen this corrective action — see docs/ROLES_AND_PERMISSIONS.md §5 footnote 10';
    end if;
  end if;

  if new.status = 'rejected' and old.status <> 'rejected' and (new.reopen_reason is null or btrim(new.reopen_reason) = '') then
    raise exception 'a reason is required when rejecting a corrective action';
  end if;

  if old.status in ('closed', 'rejected') and new.status = 'open' and (new.reopen_reason is null or btrim(new.reopen_reason) = '') then
    raise exception 'a reason is required when reopening a corrective action';
  end if;

  return new;
end;
$$;

create trigger corrective_actions_validate_update
  before update on public.corrective_actions
  for each row execute function public.validate_corrective_action_update();

-- ── 7) RLS ────────────────────────────────────────────────────────────
alter table public.safety_observations enable row level security;
alter table public.safety_observations force row level security;
alter table public.safety_observation_participants enable row level security;
alter table public.safety_observation_participants force row level security;
alter table public.corrective_actions enable row level security;
alter table public.corrective_actions force row level security;

-- No DELETE grant anywhere on either evidence table — never hard-deleted.
grant select, insert, update on public.safety_observations to authenticated;
grant select, insert, delete on public.safety_observation_participants to authenticated;
grant select, insert, update on public.corrective_actions to authenticated;

-- SELECT: HSE Manager gets unconditional org-wide visibility (docs' "M",
-- no assignment-scoping footnote). Company Manager/Workforce Coordinator/
-- Project Manager get "V"/"V⁴" — view via org-wide role or project access.
-- HSE Officer/Foreman/Inspector are "C⁴" — view is "scope-wide" per the
-- legend, i.e. every observation on a project they have access to, not
-- just their own (only CREATE/EDIT is restricted to their own — see the
-- UPDATE policy below). Employee is footnote-12-restricted: "views are
-- limited to reports they authored" — narrower than the generic "C" view
-- scope, so Employee-held rows are select-visible only via created_by,
-- layered on top of (not instead of) has_project_access.
create policy safety_observations_select
  on public.safety_observations
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or (
        public.has_any_organization_role(organization_id, array['project_manager', 'hse_officer', 'foreman', 'inspector'])
        and public.has_project_access(project_id)
      )
      or created_by = auth.uid()
    )
  );

-- INSERT: HSE Manager (org-wide) OR [HSE Officer/Foreman/Inspector/
-- Employee AND has_project_access(project_id)] — deliberately EXCLUDES
-- company_admin/operations_manager/project_manager by role name even
-- though a Project Manager's own project_assignments row would otherwise
-- satisfy has_project_access(); this is the "V⁴, not C⁴" distinction from
-- docs/ROLES_AND_PERMISSIONS.md §5 that a plain has_project_access() check
-- alone cannot express.
create policy safety_observations_insert
  on public.safety_observations
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and (
      public.has_organization_role(organization_id, 'hseq_manager')
      or (
        public.has_any_organization_role(organization_id, array['hse_officer', 'foreman', 'inspector', 'employee'])
        and public.has_project_access(project_id)
      )
    )
  );

-- UPDATE: HSE Manager may edit any (org-wide "M"); HSE Officer/Foreman/
-- Inspector/Employee may edit only THEIR OWN entries ("C": "create and
-- edit their own entries") — this is the genuine departure from LMRA's
-- Foreman, who could manage every record on their project, not just their
-- own. The HSE-Manager-only close/review gate is enforced by
-- validate_safety_observation_update() above, not here — this policy only
-- decides who may attempt an update at all.
create policy safety_observations_update
  on public.safety_observations
  for update
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_organization_role(organization_id, 'hseq_manager')
      or (
        public.has_any_organization_role(organization_id, array['hse_officer', 'foreman', 'inspector', 'employee'])
        and public.has_project_access(project_id)
        and created_by = auth.uid()
      )
    )
  )
  with check (
    public.is_organization_member(organization_id)
    and (
      public.has_organization_role(organization_id, 'hseq_manager')
      or (
        public.has_any_organization_role(organization_id, array['hse_officer', 'foreman', 'inspector', 'employee'])
        and public.has_project_access(project_id)
        and created_by = auth.uid()
      )
    )
  );

create policy safety_observation_participants_select
  on public.safety_observation_participants
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and exists (
      select 1 from public.safety_observations o
      where o.id = safety_observation_participants.observation_id
        and (
          public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager', 'hseq_manager'])
          or (
            public.has_any_organization_role(organization_id, array['project_manager', 'hse_officer', 'foreman', 'inspector'])
            and public.has_project_access(o.project_id)
          )
          or o.created_by = auth.uid()
        )
    )
  );

create policy safety_observation_participants_insert
  on public.safety_observation_participants
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and exists (
      select 1 from public.safety_observations o
      where o.id = safety_observation_participants.observation_id
        and (
          public.has_organization_role(organization_id, 'hseq_manager')
          or (
            public.has_any_organization_role(organization_id, array['hse_officer', 'foreman', 'inspector', 'employee'])
            and public.has_project_access(o.project_id)
            and o.created_by = auth.uid()
          )
        )
    )
  );

create policy safety_observation_participants_delete
  on public.safety_observation_participants
  for delete
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and exists (
      select 1 from public.safety_observations o
      where o.id = safety_observation_participants.observation_id
        and (
          public.has_organization_role(organization_id, 'hseq_manager')
          or (
            public.has_any_organization_role(organization_id, array['hse_officer', 'foreman', 'inspector', 'employee'])
            and public.has_project_access(o.project_id)
            and o.created_by = auth.uid()
          )
        )
    )
  );

-- corrective_actions SELECT: same shape as safety_observations, but no
-- footnote-12-style narrowing for Employee — an Employee only ever sees an
-- action if it's assigned to them (their real interest here), which
-- has_project_access() alone would not guarantee, so Employee is granted
-- purely via the responsible_person_id match, not has_project_access.
create policy corrective_actions_select
  on public.corrective_actions
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or (
        public.has_any_organization_role(organization_id, array['project_manager', 'hse_officer', 'foreman', 'inspector'])
        and public.has_project_access(project_id)
      )
      or exists (
        select 1 from public.employees e
        where e.id = corrective_actions.responsible_person_id and e.profile_id = auth.uid()
      )
      or created_by = auth.uid()
    )
  );

-- INSERT: HSE Manager (org-wide, "F") OR Project Manager/HSE Officer/
-- Foreman/Inspector with project access ("M⁴"/"M⁴¹⁰" — all may CREATE;
-- footnote 10's carve-out only restricts closing someone else's action,
-- not creating one). Employee cannot create at all (footnote 11 covers
-- update/comment on an assigned action only, never create).
create policy corrective_actions_insert
  on public.corrective_actions
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and (
      public.has_organization_role(organization_id, 'hseq_manager')
      or (
        public.has_any_organization_role(organization_id, array['project_manager', 'hse_officer', 'foreman', 'inspector'])
        and public.has_project_access(project_id)
      )
    )
  );

-- UPDATE: HSE Manager/Project Manager (unrestricted within scope) OR HSE
-- Officer/Foreman/Inspector with project access (their own authored/
-- assigned actions per footnote 10 — the exact "own" boundary is enforced
-- by validate_corrective_action_update() above, not here, since it differs
-- per column/transition) OR the Employee this action is assigned to
-- (footnote 11: update/comment only, enforced the same way). This policy
-- only decides who may attempt an update; validate_corrective_action_update()
-- decides which columns/transitions that attempt is actually allowed to
-- change.
create policy corrective_actions_update
  on public.corrective_actions
  for update
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_organization_role(organization_id, 'hseq_manager')
      or public.is_project_manager(project_id)
      or (
        public.has_any_organization_role(organization_id, array['hse_officer', 'foreman', 'inspector'])
        and public.has_project_access(project_id)
      )
      or exists (
        select 1 from public.employees e
        where e.id = corrective_actions.responsible_person_id and e.profile_id = auth.uid()
      )
    )
  )
  with check (
    public.is_organization_member(organization_id)
    and (
      public.has_organization_role(organization_id, 'hseq_manager')
      or public.is_project_manager(project_id)
      or (
        public.has_any_organization_role(organization_id, array['hse_officer', 'foreman', 'inspector'])
        and public.has_project_access(project_id)
      )
      or exists (
        select 1 from public.employees e
        where e.id = corrective_actions.responsible_person_id and e.profile_id = auth.uid()
      )
    )
  );
