-- Toolbox Meetings, Toolbox Templates & Safety Flash milestone.
--
-- Replaces the earlier, never-built "Toolbox Talks" plan (structured
-- digital attendance/sign-off — see docs/DATABASE_SCHEMA.md §6's
-- `toolbox_talks`/`toolbox_talk_attendees` proposal, which this migration
-- does NOT implement) with a simpler, DOCUMENT-BASED model: an authorized
-- HSE user uploads one completed PDF per record. The signed attendance
-- sheet / meeting content already lives inside that PDF — there is no
-- digital attendance, acknowledgement, signature, participant roster,
-- corrective/follow-up action, or template-versioning WORKFLOW anywhere in
-- this migration. See docs/ROLES_AND_PERMISSIONS.md §5 footnote 19 for the
-- permission-matrix side of this redesign.
--
-- Three record tables, mirroring each other closely by design (same file-
-- metadata shape, same active/archived status, same controlled-replacement
-- pattern) but kept as separate tables rather than one polymorphic table —
-- same "no polymorphic entity_id; each thing owns its own table" choice
-- already made for scaffold_defects vs. corrective_actions:
--   1. `toolbox_meetings` — a register of completed toolbox meetings.
--      PROJECT-SCOPED numbering (`meeting_number`, unique per project) —
--      project is a required field here, so project-level numbering is
--      the directly-applicable, most natural scope.
--   2. `toolbox_templates` — a reusable, ORGANIZATION-level PDF library.
--      No project dimension at all and no sequential number (the user's
--      spec gives templates no numbering requirement).
--   3. `safety_flashes` — short one-page bulletins. `project_id` is
--      OPTIONAL, so ORG-level numbering (`flash_number`, unique per
--      organization) is used instead of project-level — project-scoped
--      numbering cannot apply universally when a flash may have no
--      project at all. Both numbering scopes are documented here per the
--      milestone's explicit "document the selected numbering scope"
--      instruction.
-- Plus three append-only replacement-history tables (one per record type,
-- same no-polymorphism reasoning) recording every controlled PDF
-- replacement, and two number-counter tables mirroring
-- `organization_employee_number_counters` exactly (RLS enabled+forced,
-- zero policies, zero grants — reachable only through a SECURITY DEFINER
-- trigger).
--
-- NUMBERING MECHANISM: unlike `allocate_employee_number()`'s two-step
-- "RPC call, then a separate INSERT" (which can leak a number if the
-- INSERT that follows is abandoned), meeting_number/flash_number are
-- assigned by a BEFORE INSERT trigger IN THE SAME STATEMENT/TRANSACTION as
-- the row's own INSERT — if the INSERT is rolled back for any reason, the
-- counter increment rolls back with it, so no numbers are ever burned by a
-- failed attempt. This mirrors this session's newer
-- sync_scaffold_inspection_project_id()-style "trigger derives it,
-- ignoring/overwriting whatever the client sent" pattern rather than the
-- older employee-numbering precedent. Both approaches are equally safe
-- against DUPLICATES (that's what matters per the instruction — "do not
-- rely on counting rows... use a database-safe sequence or locked counter
-- mechanism"); this one is additionally gap-free.
--
-- FILE-FIELD LOCKING — LESSON APPLIED FROM 20260803150000: that migration
-- fixed a bug where a BEFORE UPDATE trigger's blanket "this column can
-- never change" check also rejected the legitimate SECURITY DEFINER
-- write that was supposed to be the column's ONLY writer (a same-table
-- trigger fires for every UPDATE regardless of which function issued it).
-- This migration does not repeat that mistake: the file-identity columns
-- (storage_bucket/storage_object_path/original_filename/mime_type/
-- file_size_bytes/file_checksum_sha256/uploaded_by/uploaded_at) are
-- protected ONLY by column-level REVOKE/GRANT (authenticated has no
-- UPDATE grant on them at all — matches employees.employment_status's
-- precedent), NOT by an additional trigger check — so the
-- replace_*_file() SECURITY DEFINER RPCs (owned by the migration role,
-- unaffected by the authenticated-targeted REVOKE) can write them freely.
-- The BEFORE UPDATE triggers below only guard fields that must never
-- change through ANY path, ever (id/organization_id/created_at/
-- created_by/the sequential number/project_id).
--
-- STORAGE: first module in this codebase to actually create a bucket —
-- docs/ARCHITECTURE.md §10 proposed the design (private bucket, signed
-- URLs, org-namespaced paths); nothing has built it until now. One
-- private bucket, `toolbox-documents`, shared by all three record types,
-- namespaced:
--   meetings:  {organization_id}/meetings/{project_id}/{record_id}/{uuid}.pdf
--   templates: {organization_id}/templates/{record_id}/{uuid}.pdf
--   safety flash (project set):   {organization_id}/safety-flash/{project_id}/{record_id}/{uuid}.pdf
--   safety flash (no project):    {organization_id}/safety-flash/org/{record_id}/{uuid}.pdf
-- Every upload (including a "replacement") writes to a FRESH {uuid} path —
-- never overwrites an existing object — so storage.objects grants
-- INSERT+SELECT only to `authenticated`, never UPDATE or DELETE. Replaced
-- objects are never deleted; they remain in storage, tracked in the
-- *_file_replacements tables, satisfying "do not silently overwrite
-- historical evidence" structurally, not just by convention.
--
-- Storage RLS is scoped by organization/project/role from the object path
-- alone (tenant + role isolation — the primary, storage-level gate).
-- Employee's "active records only" restriction is enforced one layer up,
-- at the database-row/signed-URL-issuance layer (an employee's DB query
-- for an archived record's row returns nothing under
-- toolbox_meetings_select/safety_flashes_select RLS, so the app never
-- learns that object's path to mint a signed URL for it in the first
-- place) — the same "RLS broad, next layer narrows further" defense-in-
-- depth split already used for scaffold_defects.

-- ── 1) shared enums ───────────────────────────────────────────────────
create type public.toolbox_document_status as enum ('active', 'archived');

comment on type public.toolbox_document_status is
  'Deliberately just two values per this milestone''s explicit instruction — no draft/scheduled/in-progress/attendance/acknowledgement workflow. An uploaded record IS a completed record.';

-- Shared by toolbox_templates.category and safety_flashes.category — the
-- same safety topics apply to both a reusable template and a one-off
-- bulletin, and the milestone's "Suggested categories" list (given under
-- Templates) reads as generally applicable, not template-specific.
create type public.hseq_document_category as enum (
  'working_at_height',
  'line_of_fire',
  'material_handling',
  'falling_objects',
  'scaffold_erection_dismantling',
  'scaffold_inspection',
  'ppe',
  'access_egress',
  'housekeeping',
  'lifting_operations',
  'mewp_mobile_equipment',
  'tools_equipment',
  'weather_conditions',
  'emergency_response',
  'alcohol_drugs',
  'fit_for_work',
  'incident_lessons_learned',
  'other'
);

-- `language` is intentionally NOT an enum (unlike category, no exact list
-- was specified, and language codes are open-ended/extended more often
-- than a fixed safety-topic taxonomy) — it's a plain `text not null`
-- column on both toolbox_templates and safety_flashes, validated
-- client-side against a curated suggestion list (modules/*/validation.ts)
-- but not DB-enforced, so adding a new language never needs a migration.

-- ── 2) shared helpers ─────────────────────────────────────────────────

-- Role check for an ARBITRARY employee (not the calling user) — every
-- existing role helper (has_organization_role/has_any_organization_role)
-- checks auth.uid() specifically. Needed because "the HSE person who held
-- the meeting" / "issued by" is a THIRD PARTY the caller selects, who must
-- independently hold an HSE role, regardless of who is doing the
-- uploading.
create or replace function public.employee_has_any_organization_role(target_employee_id uuid, target_organization_id uuid, role_names text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.employees e
    join public.organization_memberships m on m.user_id = e.profile_id and m.status = 'active'
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id
    where e.id = target_employee_id
      and e.organization_id = target_organization_id
      and m.organization_id = target_organization_id
      and r.name = any(role_names)
  );
$$;

comment on function public.employee_has_any_organization_role(uuid, uuid, text[]) is
  'True if the EMPLOYEE (not the calling user) is actively employed and their linked profile holds at least one of role_names in target_organization_id. SECURITY DEFINER — same reason as has_any_organization_role: organization_memberships/membership_roles RLS would otherwise block reading another person''s role rows.';

revoke all on function public.employee_has_any_organization_role(uuid, uuid, text[]) from public;
grant execute on function public.employee_has_any_organization_role(uuid, uuid, text[]) to authenticated;

create or replace function public.assert_toolbox_authorized_employee(target_employee_id uuid, target_organization_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_employee_eligible_for_assignment(target_employee_id);
  if not public.employee_has_any_organization_role(target_employee_id, target_organization_id, array['hseq_manager', 'hse_officer']) then
    raise exception 'the selected person must hold the HSE Manager or HSE Officer role in this organization';
  end if;
end;
$$;

-- Manage tier for toolbox_meetings — org-wide hseq_manager, or hse_officer
-- with access to the specific project. Mirrors is_scaffold_manage_tier()
-- exactly (same two roles, same shape).
create or replace function public.is_toolbox_manage_tier(target_organization_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_any_organization_role(target_organization_id, array['hseq_manager'])
    or (
      public.has_any_organization_role(target_organization_id, array['hse_officer'])
      and public.has_project_access(target_project_id)
    );
$$;

-- Manage tier for safety_flashes — same as is_toolbox_manage_tier() but
-- target_project_id may be NULL (an org-wide flash), in which case
-- hse_officer needs no project assignment at all — see
-- docs/ROLES_AND_PERMISSIONS.md §5 footnote 20.
create or replace function public.is_safety_flash_manage_tier(target_organization_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_any_organization_role(target_organization_id, array['hseq_manager'])
    or (
      public.has_any_organization_role(target_organization_id, array['hse_officer'])
      and (target_project_id is null or public.has_project_access(target_project_id))
    );
$$;

-- Manage tier for toolbox_templates — no project dimension at all, so
-- both HSE roles get straightforward org-wide manage access.
create or replace function public.is_toolbox_template_manage_tier(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_any_organization_role(target_organization_id, array['hseq_manager', 'hse_officer']);
$$;

revoke all on function public.is_toolbox_manage_tier(uuid, uuid) from public;
grant execute on function public.is_toolbox_manage_tier(uuid, uuid) to authenticated;
revoke all on function public.is_safety_flash_manage_tier(uuid, uuid) from public;
grant execute on function public.is_safety_flash_manage_tier(uuid, uuid) to authenticated;
revoke all on function public.is_toolbox_template_manage_tier(uuid) from public;
grant execute on function public.is_toolbox_template_manage_tier(uuid) to authenticated;

-- ── 3) number counters (mirrors organization_employee_number_counters) ──
create table public.toolbox_meeting_number_counters (
  project_id uuid primary key,
  organization_id uuid not null,
  next_number integer not null default 1,
  updated_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
alter table public.toolbox_meeting_number_counters enable row level security;
alter table public.toolbox_meeting_number_counters force row level security;
revoke all on public.toolbox_meeting_number_counters from public, anon, authenticated;

create table public.safety_flash_number_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  next_number integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.safety_flash_number_counters enable row level security;
alter table public.safety_flash_number_counters force row level security;
revoke all on public.safety_flash_number_counters from public, anon, authenticated;

create or replace function public.assign_toolbox_meeting_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  insert into public.toolbox_meeting_number_counters (project_id, organization_id, next_number)
  values (new.project_id, new.organization_id, 1)
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
  insert into public.safety_flash_number_counters (organization_id, next_number)
  values (new.organization_id, 1)
  on conflict (organization_id) do nothing;

  update public.safety_flash_number_counters
  set next_number = next_number + 1, updated_at = now()
  where organization_id = new.organization_id
  returning next_number - 1 into v_next;

  new.flash_number := v_next;
  return new;
end;
$$;

-- ── 4) toolbox_meetings ───────────────────────────────────────────────
create table public.toolbox_meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  -- Placeholder default only, so the client never needs to send a value
  -- and the generated Supabase Insert type treats this column as
  -- optional — assign_toolbox_meeting_number() unconditionally
  -- overwrites it before the row is ever written (same reasoning as
  -- scaffold_inspections.project_id's default-free version, but using a
  -- benign default here instead since 0 can never collide with a real
  -- 1-based number).
  meeting_number integer not null default 0,
  title text not null,
  meeting_date date not null,
  work_area text,
  held_by_employee_id uuid not null,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  storage_bucket text not null,
  storage_object_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  file_checksum_sha256 text,
  notes text,
  status public.toolbox_document_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint toolbox_meetings_project_number_key unique (project_id, meeting_number),
  constraint toolbox_meetings_storage_object_path_key unique (storage_object_path),
  constraint toolbox_meetings_id_organization_id_key unique (id, organization_id),
  constraint toolbox_meetings_project_fk foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  constraint toolbox_meetings_held_by_fk foreign key (held_by_employee_id, organization_id) references public.employees (id, organization_id) on delete restrict,
  -- 25 MB platform default ceiling for a scanned meeting PDF — a
  -- documented starting limit for this platform, not a claim that every
  -- real meeting record will be smaller; raise it in a follow-up
  -- migration if real usage needs more.
  constraint toolbox_meetings_file_size_check check (file_size_bytes > 0 and file_size_bytes <= 26214400),
  constraint toolbox_meetings_mime_type_check check (mime_type = 'application/pdf')
);

comment on table public.toolbox_meetings is
  'Register of completed toolbox meetings — one row per uploaded PDF. The PDF already contains the meeting content and paper attendance evidence; there is no digital attendance/acknowledgement tracking here. Never hard-deleted (HSEQ evidence).';
comment on column public.toolbox_meetings.meeting_number is
  'PROJECT-scoped sequential number (unique per project_id) — assigned by assign_toolbox_meeting_number(), a BEFORE INSERT trigger, never client-supplied. Displayed as "TOOLBOX MEETING: #<n>".';
comment on column public.toolbox_meetings.held_by_employee_id is
  'The HSE person who conducted the meeting — must hold hseq_manager or hse_officer (assert_toolbox_authorized_employee(), enforced by trigger). May differ from uploaded_by — see the module''s "HSE Officer A held it, HSE Manager B uploaded it later" example.';

create trigger toolbox_meetings_set_updated_at
  before update on public.toolbox_meetings
  for each row execute function public.set_updated_at();

create trigger toolbox_meetings_assign_number
  before insert on public.toolbox_meetings
  for each row execute function public.assign_toolbox_meeting_number();

create or replace function public.validate_toolbox_meeting_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_toolbox_authorized_employee(new.held_by_employee_id, new.organization_id);
  return new;
end;
$$;

create trigger toolbox_meetings_validate_insert
  before insert on public.toolbox_meetings
  for each row execute function public.validate_toolbox_meeting_insert();

-- Only true, forever-immutable identity fields are checked here — the
-- file-identity columns are protected by column GRANT alone (see the
-- migration header comment on why: a trigger check here would also block
-- replace_toolbox_meeting_file()'s own legitimate write).
create or replace function public.validate_toolbox_meeting_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.project_id is distinct from old.project_id
    or new.meeting_number is distinct from old.meeting_number
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'toolbox meeting identity fields cannot be changed';
  end if;

  if new.held_by_employee_id is distinct from old.held_by_employee_id then
    perform public.assert_toolbox_authorized_employee(new.held_by_employee_id, new.organization_id);
  end if;

  return new;
end;
$$;

create trigger toolbox_meetings_validate_update
  before update on public.toolbox_meetings
  for each row execute function public.validate_toolbox_meeting_update();

create table public.toolbox_meeting_file_replacements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  toolbox_meeting_id uuid not null,
  previous_storage_bucket text not null,
  previous_storage_object_path text not null,
  previous_original_filename text not null,
  new_storage_bucket text not null,
  new_storage_object_path text not null,
  new_original_filename text not null,
  reason text not null check (btrim(reason) <> ''),
  replaced_by uuid not null references public.profiles (id) on delete restrict,
  replaced_at timestamptz not null default now(),
  constraint toolbox_meeting_file_replacements_meeting_fk foreign key (toolbox_meeting_id, organization_id) references public.toolbox_meetings (id, organization_id) on delete cascade
);

comment on table public.toolbox_meeting_file_replacements is
  'Append-only audit trail of every controlled PDF replacement on a toolbox meeting — written exclusively by replace_toolbox_meeting_file(). Old objects are never deleted from storage; this row is how they stay discoverable.';

-- ── 5) toolbox_templates ──────────────────────────────────────────────
create table public.toolbox_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  category public.hseq_document_category not null,
  language text not null,
  description text,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  storage_bucket text not null,
  storage_object_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  file_checksum_sha256 text,
  status public.toolbox_document_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint toolbox_templates_storage_object_path_key unique (storage_object_path),
  constraint toolbox_templates_id_organization_id_key unique (id, organization_id),
  constraint toolbox_templates_file_size_check check (file_size_bytes > 0 and file_size_bytes <= 26214400),
  constraint toolbox_templates_mime_type_check check (mime_type = 'application/pdf')
);

comment on table public.toolbox_templates is
  'Organization-wide reusable PDF template library — no project dimension, no sequential number (not requested by this milestone), not required to be linked from any toolbox meeting. "Upload a replacement" is a controlled new-version upload (replace_toolbox_template_file()), never a silent overwrite.';

create trigger toolbox_templates_set_updated_at
  before update on public.toolbox_templates
  for each row execute function public.set_updated_at();

create or replace function public.validate_toolbox_template_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'toolbox template identity fields cannot be changed';
  end if;
  return new;
end;
$$;

create trigger toolbox_templates_validate_update
  before update on public.toolbox_templates
  for each row execute function public.validate_toolbox_template_update();

create table public.toolbox_template_file_replacements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  toolbox_template_id uuid not null,
  previous_storage_bucket text not null,
  previous_storage_object_path text not null,
  previous_original_filename text not null,
  new_storage_bucket text not null,
  new_storage_object_path text not null,
  new_original_filename text not null,
  reason text not null check (btrim(reason) <> ''),
  replaced_by uuid not null references public.profiles (id) on delete restrict,
  replaced_at timestamptz not null default now(),
  constraint toolbox_template_file_replacements_template_fk foreign key (toolbox_template_id, organization_id) references public.toolbox_templates (id, organization_id) on delete cascade
);

-- ── 6) safety_flashes ─────────────────────────────────────────────────
create table public.safety_flashes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid,
  -- Placeholder default — see toolbox_meetings.meeting_number's comment;
  -- same reasoning, ORG-scoped instead of project-scoped here.
  flash_number integer not null default 0,
  title text not null,
  date_issued date not null,
  category public.hseq_document_category not null,
  language text not null,
  issued_by_employee_id uuid not null,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  storage_bucket text not null,
  storage_object_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  file_checksum_sha256 text,
  summary text,
  status public.toolbox_document_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint safety_flashes_org_number_key unique (organization_id, flash_number),
  constraint safety_flashes_storage_object_path_key unique (storage_object_path),
  constraint safety_flashes_id_organization_id_key unique (id, organization_id),
  constraint safety_flashes_project_fk foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  constraint safety_flashes_issued_by_fk foreign key (issued_by_employee_id, organization_id) references public.employees (id, organization_id) on delete restrict,
  constraint safety_flashes_file_size_check check (file_size_bytes > 0 and file_size_bytes <= 26214400),
  constraint safety_flashes_mime_type_check check (mime_type = 'application/pdf')
  -- No page-count restriction: "do not reject a valid PDF solely because
  -- it contains more than one page" — this platform has no reliable
  -- server-side PDF page-count check available, so none is added rather
  -- than faking one.
);

comment on table public.safety_flashes is
  'Short safety bulletins — ORG-scoped sequential numbering (flash_number, unique per organization_id), because project_id is optional and a project-scoped counter cannot apply to an unscoped flash. No attendance/acknowledgement/follow-up tracking.';
comment on column public.safety_flashes.flash_number is
  'ORGANIZATION-scoped sequential number — assigned by assign_safety_flash_number(), a BEFORE INSERT trigger, never client-supplied. Displayed as "SAFETY FLASH: #<n>".';

create trigger safety_flashes_set_updated_at
  before update on public.safety_flashes
  for each row execute function public.set_updated_at();

create trigger safety_flashes_assign_number
  before insert on public.safety_flashes
  for each row execute function public.assign_safety_flash_number();

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
  perform public.assert_toolbox_authorized_employee(new.issued_by_employee_id, new.organization_id);
  return new;
end;
$$;

create trigger safety_flashes_validate_insert
  before insert on public.safety_flashes
  for each row execute function public.validate_safety_flash_insert();

create or replace function public.validate_safety_flash_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.project_id is distinct from old.project_id
    or new.flash_number is distinct from old.flash_number
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'safety flash identity fields cannot be changed';
  end if;

  if new.issued_by_employee_id is distinct from old.issued_by_employee_id then
    perform public.assert_toolbox_authorized_employee(new.issued_by_employee_id, new.organization_id);
  end if;

  return new;
end;
$$;

create trigger safety_flashes_validate_update
  before update on public.safety_flashes
  for each row execute function public.validate_safety_flash_update();

create table public.safety_flash_file_replacements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  safety_flash_id uuid not null,
  previous_storage_bucket text not null,
  previous_storage_object_path text not null,
  previous_original_filename text not null,
  new_storage_bucket text not null,
  new_storage_object_path text not null,
  new_original_filename text not null,
  reason text not null check (btrim(reason) <> ''),
  replaced_by uuid not null references public.profiles (id) on delete restrict,
  replaced_at timestamptz not null default now(),
  constraint safety_flash_file_replacements_flash_fk foreign key (safety_flash_id, organization_id) references public.safety_flashes (id, organization_id) on delete cascade
);

-- ── 7) controlled file-replacement RPCs ──────────────────────────────
-- All three are SECURITY DEFINER (the only path that can write the
-- locked file-identity columns — see column REVOKE/GRANT in §8) and do
-- their own manage-tier authorization check manually, since SECURITY
-- DEFINER bypasses RLS entirely. The NEW object must already exist in
-- Storage (uploaded by the caller's own authenticated session, subject to
-- storage.objects RLS in the companion migration) before this RPC is
-- called — this RPC only swaps the DB pointer and writes the audit row;
-- it never touches Storage itself.

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
  if not public.is_toolbox_manage_tier(v_row.organization_id, v_row.project_id) then
    raise exception 'insufficient_privilege: not authorized to replace this toolbox meeting''s file';
  end if;

  insert into public.toolbox_meeting_file_replacements (
    organization_id, toolbox_meeting_id,
    previous_storage_bucket, previous_storage_object_path, previous_original_filename,
    new_storage_bucket, new_storage_object_path, new_original_filename,
    reason, replaced_by
  ) values (
    v_row.organization_id, v_row.id,
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
  if not public.is_toolbox_template_manage_tier(v_row.organization_id) then
    raise exception 'insufficient_privilege: not authorized to replace this toolbox template''s file';
  end if;

  insert into public.toolbox_template_file_replacements (
    organization_id, toolbox_template_id,
    previous_storage_bucket, previous_storage_object_path, previous_original_filename,
    new_storage_bucket, new_storage_object_path, new_original_filename,
    reason, replaced_by
  ) values (
    v_row.organization_id, v_row.id,
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
  if not public.is_safety_flash_manage_tier(v_row.organization_id, v_row.project_id) then
    raise exception 'insufficient_privilege: not authorized to replace this safety flash''s file';
  end if;

  insert into public.safety_flash_file_replacements (
    organization_id, safety_flash_id,
    previous_storage_bucket, previous_storage_object_path, previous_original_filename,
    new_storage_bucket, new_storage_object_path, new_original_filename,
    reason, replaced_by
  ) values (
    v_row.organization_id, v_row.id,
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

revoke all on function public.replace_toolbox_meeting_file(uuid, text, text, text, bigint, text, text) from public;
grant execute on function public.replace_toolbox_meeting_file(uuid, text, text, text, bigint, text, text) to authenticated;
revoke all on function public.replace_toolbox_template_file(uuid, text, text, text, bigint, text, text) from public;
grant execute on function public.replace_toolbox_template_file(uuid, text, text, text, bigint, text, text) to authenticated;
revoke all on function public.replace_safety_flash_file(uuid, text, text, text, bigint, text, text) from public;
grant execute on function public.replace_safety_flash_file(uuid, text, text, text, bigint, text, text) to authenticated;

-- ── 8) RLS ────────────────────────────────────────────────────────────
alter table public.toolbox_meetings enable row level security;
alter table public.toolbox_meetings force row level security;
alter table public.toolbox_templates enable row level security;
alter table public.toolbox_templates force row level security;
alter table public.safety_flashes enable row level security;
alter table public.safety_flashes force row level security;
alter table public.toolbox_meeting_file_replacements enable row level security;
alter table public.toolbox_meeting_file_replacements force row level security;
alter table public.toolbox_template_file_replacements enable row level security;
alter table public.toolbox_template_file_replacements force row level security;
alter table public.safety_flash_file_replacements enable row level security;
alter table public.safety_flash_file_replacements force row level security;

-- No DELETE grant anywhere in this section — HSEQ evidence, never
-- hard-deleted (archive is the only "removal" available).

grant select, insert, update on public.toolbox_meetings to authenticated;
revoke update on public.toolbox_meetings from authenticated;
grant update (title, meeting_date, work_area, held_by_employee_id, notes, status, updated_by) on public.toolbox_meetings to authenticated;

grant select, insert, update on public.toolbox_templates to authenticated;
revoke update on public.toolbox_templates from authenticated;
grant update (title, category, language, description, status, updated_by) on public.toolbox_templates to authenticated;

grant select, insert, update on public.safety_flashes to authenticated;
revoke update on public.safety_flashes from authenticated;
grant update (title, date_issued, category, language, issued_by_employee_id, summary, status, updated_by) on public.safety_flashes to authenticated;

-- Replacement-history tables: readable (audit trail), writable only by
-- the replace_*_file() RPCs (SECURITY DEFINER — unaffected by this
-- REVOKE).
grant select on public.toolbox_meeting_file_replacements to authenticated;
grant select on public.toolbox_template_file_replacements to authenticated;
grant select on public.safety_flash_file_replacements to authenticated;

create policy toolbox_meetings_select
  on public.toolbox_meetings
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or (
        public.has_any_organization_role(organization_id, array['hse_officer', 'project_manager', 'foreman', 'inspector'])
        and public.has_project_access(project_id)
      )
      or (
        public.has_any_organization_role(organization_id, array['employee'])
        and public.has_project_access(project_id)
        and status = 'active'
      )
    )
  );

create policy toolbox_meetings_insert
  on public.toolbox_meetings
  for insert
  to authenticated
  with check (public.is_toolbox_manage_tier(organization_id, project_id));

create policy toolbox_meetings_update
  on public.toolbox_meetings
  for update
  to authenticated
  using (public.is_toolbox_manage_tier(organization_id, project_id))
  with check (public.is_toolbox_manage_tier(organization_id, project_id));

create policy toolbox_templates_select
  on public.toolbox_templates
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    -- Employee deliberately excluded — see
    -- docs/ROLES_AND_PERMISSIONS.md §5 footnote 19: templates are an HSE
    -- planning resource, not an employee-facing record.
    and public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager', 'hseq_manager', 'hse_officer', 'project_manager', 'foreman', 'inspector'])
  );

create policy toolbox_templates_insert
  on public.toolbox_templates
  for insert
  to authenticated
  with check (public.is_toolbox_template_manage_tier(organization_id));

create policy toolbox_templates_update
  on public.toolbox_templates
  for update
  to authenticated
  using (public.is_toolbox_template_manage_tier(organization_id))
  with check (public.is_toolbox_template_manage_tier(organization_id));

create policy safety_flashes_select
  on public.safety_flashes
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or (
        public.has_any_organization_role(organization_id, array['hse_officer', 'project_manager', 'foreman', 'inspector'])
        and (project_id is null or public.has_project_access(project_id))
      )
      or (
        public.has_any_organization_role(organization_id, array['employee'])
        and (project_id is null or public.has_project_access(project_id))
        and status = 'active'
      )
    )
  );

create policy safety_flashes_insert
  on public.safety_flashes
  for insert
  to authenticated
  with check (public.is_safety_flash_manage_tier(organization_id, project_id));

create policy safety_flashes_update
  on public.safety_flashes
  for update
  to authenticated
  using (public.is_safety_flash_manage_tier(organization_id, project_id))
  with check (public.is_safety_flash_manage_tier(organization_id, project_id));

create policy toolbox_meeting_file_replacements_select
  on public.toolbox_meeting_file_replacements
  for select
  to authenticated
  using (
    exists (
      select 1 from public.toolbox_meetings tm
      where tm.id = toolbox_meeting_id
        and public.is_organization_member(tm.organization_id)
        and (
          public.has_any_organization_role(tm.organization_id, array['company_admin', 'operations_manager', 'hseq_manager'])
          or (public.has_any_organization_role(tm.organization_id, array['hse_officer', 'project_manager', 'foreman', 'inspector']) and public.has_project_access(tm.project_id))
        )
    )
  );

create policy toolbox_template_file_replacements_select
  on public.toolbox_template_file_replacements
  for select
  to authenticated
  using (public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager', 'hseq_manager', 'hse_officer', 'project_manager', 'foreman', 'inspector']));

create policy safety_flash_file_replacements_select
  on public.safety_flash_file_replacements
  for select
  to authenticated
  using (
    exists (
      select 1 from public.safety_flashes sf
      where sf.id = safety_flash_id
        and public.is_organization_member(sf.organization_id)
        and (
          public.has_any_organization_role(sf.organization_id, array['company_admin', 'operations_manager', 'hseq_manager'])
          or (public.has_any_organization_role(sf.organization_id, array['hse_officer', 'project_manager', 'foreman', 'inspector']) and (sf.project_id is null or public.has_project_access(sf.project_id)))
        )
    )
  );
