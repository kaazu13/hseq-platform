-- Equipment V2 — a genuine greenfield build (confirmed live: no equipment/
-- assets/inventory/tools table or module exists anywhere in this codebase
-- before this migration).
--
-- Design decisions, stated up front so every choice below reads as
-- deliberate rather than arbitrary:
--
-- 1. ONE table (`equipment_items`) represents both individually-tracked
--    assets (harness, radio, tablet — `tracking_mode = 'serialized'`,
--    `quantity` always 1) and bulk consumables/PPE (gloves, glasses —
--    `tracking_mode = 'quantity'`, `quantity`/`available_quantity` free to
--    move). This avoids two parallel schemas for what is structurally the
--    same "a company/project owns N units of something" fact — the only
--    real difference is whether N is pinned to 1 and whether a reference
--    number is expected.
--
-- 2. Company-wide vs project-issued stock reuses the EXACT precedent
--    `safety_flashes` already established: a nullable `project_id`
--    (composite FK to `projects(id, company_id)` still enforced even
--    though the column itself is nullable), with every RLS/manage-tier
--    check gated `project_id is null or has_project_access(project_id)`.
--    No new "scope enum" invented.
--
-- 3. Management-tier permission reuses `canManageDailyWorkforce`'s EXACT
--    role set (company_admin/operations_manager company-wide, or
--    project_manager scoped to their own project) — not a new
--    "Coordinator"/"Company Manager" role, per the task's explicit
--    instruction. A project_manager can only manage items already
--    allocated to their own project (project_id is not null); only
--    company_admin/operations_manager can manage company-wide
--    (project_id is null) stock, mirroring a PM's inherently
--    project-scoped authority.
--
-- 4. `equipment_assignments` (one row per issue-event) rather than a
--    single "current holder" column on `equipment_items` — this is what
--    makes history reconstructable and supports PARTIAL quantity
--    issuance/return (2 of 5 pairs of gloves) uniformly with serialized
--    single-unit issuance, via one shared table. `tracking_mode` is
--    denormalized onto this table (same "denormalize for a partial
--    unique index" convention `daily_team_members.shift` already uses)
--    so "at most one ACTIVE assignment per SERIALIZED item" can be a
--    single partial unique index rather than a cross-table trigger.
--
-- 5. Request-lifecycle history is NOT a separate log table. Unlike
--    `leave_requests` (which has `leave_request_history` because
--    `resubmit_leave_request()` can overwrite a prior decision),
--    equipment requests in this build have no resubmit path — every
--    transition is terminal except approved->issued/fulfilled — so the
--    request row's own `status`/`decided_by`/`decided_at`/
--    `decision_comment` columns ARE a complete, never-overwritten history
--    by construction. `equipment_history` is scoped to ITEM-level events
--    only (added/edited/issued/returned/damaged/lost/recovered/retired).
--    Disclosed scope decision, not an oversight.
--
-- 6. Notifications reuse the existing `notify_employee()`/
--    `notify_project_managers()` SECURITY DEFINER helpers from
--    20260826090000 — both already exist, neither is redefined here. Per
--    that migration's own hard-won lesson, EVERY notification fires from
--    an AFTER INSERT/UPDATE TRIGGER, never a direct call from inside a
--    SECURITY INVOKER RPC body (a SECURITY INVOKER caller lacks EXECUTE
--    on these intentionally-ungranted helpers). One AAFTER UPDATE trigger
--    on `equipment_requests` (keyed off the new `status`) handles
--    approved/denied/returned/fulfilled uniformly — including the
--    fulfilled case, since `issue_equipment()`'s request-linkage path is
--    just a normal `update equipment_requests set status = 'fulfilled'`
--    that the SAME trigger catches. No separate "equipment issued"
--    notification for ad-hoc (non-request) issuance — disclosed scope
--    limitation, not built this pass.
--
-- 7. Explicitly NOT built this pass (disclosed): a dedicated "transfer"
--    RPC (return + reissue already covers it), partial per-unit damage
--    tracking for quantity items beyond a plain quantity decrement, and
--    procurement/accounting fields (cost, supplier, purchase order).

-- ============================================================================
-- 1) Enums
-- ============================================================================
create type public.equipment_tracking_mode as enum ('serialized', 'quantity');
create type public.equipment_status as enum ('available', 'issued', 'reserved', 'out_of_service', 'lost', 'retired');
create type public.equipment_condition as enum ('new', 'good', 'worn', 'damaged', 'requires_inspection');
create type public.equipment_assignment_status as enum ('active', 'returned', 'lost', 'written_off');
create type public.equipment_request_status as enum ('pending', 'approved', 'denied', 'fulfilled', 'cancelled', 'returned');
create type public.equipment_history_event as enum ('added', 'edited', 'issued', 'returned', 'damaged', 'lost', 'recovered', 'out_of_service', 'retired');

-- ============================================================================
-- 2) equipment_items — the catalog: one row per serialized asset, or per
--    quantity-based item-type.
-- ============================================================================
create table public.equipment_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid,
  tracking_mode public.equipment_tracking_mode not null,
  category text not null,
  name text not null,
  description text,
  reference_number text,
  manufacturer text,
  model text,
  specification text,
  quantity integer not null default 1,
  available_quantity integer not null default 1,
  status public.equipment_status not null default 'available',
  condition public.equipment_condition not null default 'new',
  location text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint equipment_items_id_company_id_key unique (id, company_id),
  constraint equipment_items_project_fk foreign key (project_id, company_id) references public.projects (id, company_id) on delete cascade,
  constraint equipment_items_name_not_blank check (btrim(name) <> ''),
  constraint equipment_items_category_not_blank check (btrim(category) <> ''),
  constraint equipment_items_quantity_bounds check (quantity >= 0 and available_quantity >= 0 and available_quantity <= quantity),
  constraint equipment_items_serialized_quantity_one check (tracking_mode <> 'serialized' or quantity = 1),
  constraint equipment_items_reference_unique unique (company_id, reference_number)
);

comment on column public.equipment_items.project_id is
  'Nullable — same precedent as safety_flashes.project_id: null means company-wide inventory, set means allocated to that specific project. Every RLS/manage-tier check gates on "project_id is null or has_project_access(project_id)".';
comment on column public.equipment_items.available_quantity is
  'The single source of truth for "how much can still be issued" — for a serialized item this is always 0 or 1 (mirrors status=issued/available); for a quantity item it tracks the pool directly. Damaged/lost units are permanently removed from both quantity and available_quantity (see mark_equipment_damaged/mark_equipment_lost), never left as a phantom "unavailable but still counted" unit.';

create index equipment_items_company_id_idx on public.equipment_items (company_id);
create index equipment_items_project_id_idx on public.equipment_items (project_id);
create index equipment_items_status_idx on public.equipment_items (company_id, status);

create trigger equipment_items_set_updated_at
  before update on public.equipment_items
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3) equipment_assignments — one row per issue-event. Supports partial
--    quantity issue/return via `quantity`; serialized items always 1.
-- ============================================================================
create table public.equipment_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  equipment_item_id uuid not null,
  tracking_mode public.equipment_tracking_mode not null,
  employee_id uuid not null,
  quantity integer not null default 1,
  status public.equipment_assignment_status not null default 'active',
  issued_at date not null default current_date,
  expected_return_at date,
  returned_at date,
  condition_at_issue public.equipment_condition not null,
  condition_at_return public.equipment_condition,
  note text,
  return_note text,
  issued_by uuid references public.profiles (id) on delete set null,
  returned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_assignments_item_fk foreign key (equipment_item_id, company_id) references public.equipment_items (id, company_id) on delete cascade,
  constraint equipment_assignments_employee_fk foreign key (employee_id, company_id) references public.employees (id, company_id) on delete restrict,
  constraint equipment_assignments_quantity_positive check (quantity > 0),
  constraint equipment_assignments_serialized_quantity_one check (tracking_mode <> 'serialized' or quantity = 1),
  constraint equipment_assignments_returned_fields_paired check ((status = 'active') or (returned_at is not null or status in ('lost', 'written_off')))
);

comment on table public.equipment_assignments is
  'One row per issue-event (both a serialized asset''s single active holder, and a quantity item''s partial issue/return). `tracking_mode` is denormalized from equipment_items purely to let equipment_assignments_one_active_serialized_holder be a plain partial unique index — same convention as daily_team_members.shift.';

create unique index equipment_assignments_one_active_serialized_holder
  on public.equipment_assignments (equipment_item_id)
  where status = 'active' and tracking_mode = 'serialized';

create index equipment_assignments_company_id_idx on public.equipment_assignments (company_id);
create index equipment_assignments_item_id_idx on public.equipment_assignments (equipment_item_id);
create index equipment_assignments_employee_id_idx on public.equipment_assignments (employee_id, status);

create trigger equipment_assignments_set_updated_at
  before update on public.equipment_assignments
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 4) equipment_requests — employee-initiated, project-scoped (an employee
--    always requests within their active project context, never
--    company-wide-ambiguous).
-- ============================================================================
create table public.equipment_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  employee_id uuid not null,
  equipment_item_id uuid,
  item_description text not null,
  specification text,
  quantity integer not null default 1,
  reason text not null,
  status public.equipment_request_status not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_comment text,
  fulfilled_assignment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_requests_project_fk foreign key (project_id, company_id) references public.projects (id, company_id) on delete cascade,
  constraint equipment_requests_employee_fk foreign key (employee_id, company_id) references public.employees (id, company_id) on delete cascade,
  constraint equipment_requests_item_fk foreign key (equipment_item_id, company_id) references public.equipment_items (id, company_id) on delete set null,
  constraint equipment_requests_assignment_fk foreign key (fulfilled_assignment_id) references public.equipment_assignments (id) on delete set null,
  constraint equipment_requests_quantity_positive check (quantity > 0),
  constraint equipment_requests_reason_not_blank check (btrim(reason) <> ''),
  constraint equipment_requests_item_description_not_blank check (btrim(item_description) <> ''),
  constraint equipment_requests_decision_fields_paired check ((status = 'pending') = (decided_at is null))
);

comment on table public.equipment_requests is
  'No resubmit path in this build (unlike leave_requests) — every transition from pending is terminal except approved (which issue_equipment() can later move to fulfilled). This means status/decided_by/decided_at/decision_comment are a COMPLETE, never-overwritten decision history by construction, so no separate equipment_request_history table exists.';

create index equipment_requests_company_id_idx on public.equipment_requests (company_id);
create index equipment_requests_project_id_idx on public.equipment_requests (project_id, status);
create index equipment_requests_employee_id_idx on public.equipment_requests (employee_id);

create trigger equipment_requests_set_updated_at
  before update on public.equipment_requests
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 5) equipment_history — item-level audit log (see header comment #5 for
--    why request-lifecycle events are NOT duplicated in here).
-- ============================================================================
create table public.equipment_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  equipment_item_id uuid not null,
  employee_id uuid,
  event public.equipment_history_event not null,
  quantity integer,
  from_status text,
  to_status text,
  note text,
  actor uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint equipment_history_item_fk foreign key (equipment_item_id, company_id) references public.equipment_items (id, company_id) on delete cascade,
  constraint equipment_history_employee_fk foreign key (employee_id, company_id) references public.employees (id, company_id) on delete set null
);

create index equipment_history_item_id_idx on public.equipment_history (equipment_item_id, created_at desc);
create index equipment_history_company_id_idx on public.equipment_history (company_id);

-- ============================================================================
-- 6) RLS
-- ============================================================================
alter table public.equipment_items enable row level security;
alter table public.equipment_items force row level security;
alter table public.equipment_assignments enable row level security;
alter table public.equipment_assignments force row level security;
alter table public.equipment_requests enable row level security;
alter table public.equipment_requests force row level security;
alter table public.equipment_history enable row level security;
alter table public.equipment_history force row level security;

grant select, insert, update on public.equipment_items to authenticated;
grant select, insert, update on public.equipment_assignments to authenticated;
grant select, insert, update on public.equipment_requests to authenticated;
grant select, insert on public.equipment_history to authenticated;
-- No delete grant anywhere — retire/archive only, matching every other
-- evidentiary table in this codebase.

-- Reused, not reinvented: the exact "company-wide manage tier OR this
-- project's own PM" split modules/daily-workforce/permissions.ts's
-- canManageDailyWorkforce() already established at the DB layer.
create or replace function public.is_equipment_manage_tier(target_company_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    public.has_any_company_role(target_company_id, array['company_admin', 'operations_manager'])
    or (target_project_id is not null and public.is_project_manager(target_project_id));
$$;

comment on function public.is_equipment_manage_tier(uuid, uuid) is
  'Equipment management authority — company_admin/operations_manager manage ANY item (company-wide or any project); a project_manager may only manage items already allocated to their OWN project (target_project_id not null), never company-wide (null-project) stock. Mirrors canManageDailyWorkforce()''s exact role set — no new role invented.';

create policy equipment_items_select
  on public.equipment_items
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (project_id is null or public.has_project_access(project_id) or public.is_equipment_manage_tier(company_id, project_id))
  );

create policy equipment_items_insert
  on public.equipment_items
  for insert
  to authenticated
  with check (public.is_company_member(company_id) and public.is_equipment_manage_tier(company_id, project_id));

create policy equipment_items_update
  on public.equipment_items
  for update
  to authenticated
  using (public.is_company_member(company_id) and public.is_equipment_manage_tier(company_id, project_id))
  with check (public.is_company_member(company_id) and public.is_equipment_manage_tier(company_id, project_id));

create policy equipment_assignments_select
  on public.equipment_assignments
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      exists (select 1 from public.equipment_items ei where ei.id = equipment_assignments.equipment_item_id and public.is_equipment_manage_tier(ei.company_id, ei.project_id))
      or exists (select 1 from public.employees e where e.id = equipment_assignments.employee_id and e.profile_id = auth.uid())
    )
  );

create policy equipment_assignments_insert
  on public.equipment_assignments
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and exists (select 1 from public.equipment_items ei where ei.id = equipment_assignments.equipment_item_id and public.is_equipment_manage_tier(ei.company_id, ei.project_id))
  );

create policy equipment_assignments_update
  on public.equipment_assignments
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and exists (select 1 from public.equipment_items ei where ei.id = equipment_assignments.equipment_item_id and public.is_equipment_manage_tier(ei.company_id, ei.project_id))
  )
  with check (
    public.is_company_member(company_id)
    and exists (select 1 from public.equipment_items ei where ei.id = equipment_assignments.equipment_item_id and public.is_equipment_manage_tier(ei.company_id, ei.project_id))
  );

-- Employee self-service insert — own employee record only, RLS is the
-- real "no arbitrary employee_id from client" gate (mirrors
-- leave_requests_insert exactly).
create policy equipment_requests_select
  on public.equipment_requests
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.is_equipment_manage_tier(company_id, project_id)
      or exists (select 1 from public.employees e where e.id = equipment_requests.employee_id and e.profile_id = auth.uid())
    )
  );

create policy equipment_requests_insert
  on public.equipment_requests
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and public.has_project_access(project_id)
    and exists (select 1 from public.employees e where e.id = equipment_requests.employee_id and e.profile_id = auth.uid())
  );

create policy equipment_requests_update
  on public.equipment_requests
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.is_equipment_manage_tier(company_id, project_id)
      or exists (select 1 from public.employees e where e.id = equipment_requests.employee_id and e.profile_id = auth.uid())
    )
  )
  with check (
    public.is_company_member(company_id)
    and (
      public.is_equipment_manage_tier(company_id, project_id)
      or exists (select 1 from public.employees e where e.id = equipment_requests.employee_id and e.profile_id = auth.uid())
    )
  );

create policy equipment_history_select
  on public.equipment_history
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      exists (select 1 from public.equipment_items ei where ei.id = equipment_history.equipment_item_id and public.is_equipment_manage_tier(ei.company_id, ei.project_id))
      or (equipment_history.employee_id is not null and exists (select 1 from public.employees e where e.id = equipment_history.employee_id and e.profile_id = auth.uid()))
    )
  );

create policy equipment_history_insert
  on public.equipment_history
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and exists (select 1 from public.equipment_items ei where ei.id = equipment_history.equipment_item_id and public.is_equipment_manage_tier(ei.company_id, ei.project_id))
  );

-- ============================================================================
-- 7) RPCs — item lifecycle
-- ============================================================================
create or replace function public.create_equipment_item(
  target_company_id uuid,
  target_project_id uuid,
  target_tracking_mode public.equipment_tracking_mode,
  target_category text,
  target_name text,
  target_description text default null,
  target_reference_number text default null,
  target_manufacturer text default null,
  target_model text default null,
  target_specification text default null,
  target_quantity integer default 1,
  target_condition public.equipment_condition default 'new',
  target_location text default null,
  target_notes text default null
)
returns public.equipment_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_quantity integer;
  v_row public.equipment_items;
begin
  if target_name is null or btrim(target_name) = '' then
    raise exception 'a name is required';
  end if;
  if target_category is null or btrim(target_category) = '' then
    raise exception 'a category is required';
  end if;

  v_quantity := case when target_tracking_mode = 'serialized' then 1 else greatest(coalesce(target_quantity, 1), 0) end;

  if target_project_id is not null then
    perform public.assert_project_not_archived(target_project_id);
  end if;

  insert into public.equipment_items (
    company_id, project_id, tracking_mode, category, name, description, reference_number,
    manufacturer, model, specification, quantity, available_quantity, condition, location, notes, created_by, updated_by
  )
  values (
    target_company_id, target_project_id, target_tracking_mode, target_category, target_name, target_description, nullif(btrim(coalesce(target_reference_number, '')), ''),
    target_manufacturer, target_model, target_specification, v_quantity, v_quantity, coalesce(target_condition, 'new'), target_location, target_notes, auth.uid(), auth.uid()
  )
  returning * into v_row;

  insert into public.equipment_history (company_id, equipment_item_id, event, quantity, to_status, actor)
  values (target_company_id, v_row.id, 'added', v_quantity, v_row.status::text, auth.uid());

  return v_row;
end;
$$;

revoke all on function public.create_equipment_item(uuid, uuid, public.equipment_tracking_mode, text, text, text, text, text, text, text, integer, public.equipment_condition, text, text) from public, anon;
grant execute on function public.create_equipment_item(uuid, uuid, public.equipment_tracking_mode, text, text, text, text, text, text, text, integer, public.equipment_condition, text, text) to authenticated;

create or replace function public.update_equipment_item(
  target_item_id uuid,
  target_project_id uuid,
  target_category text,
  target_name text,
  target_description text default null,
  target_reference_number text default null,
  target_manufacturer text default null,
  target_model text default null,
  target_specification text default null,
  target_location text default null,
  target_notes text default null
)
returns public.equipment_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing public.equipment_items;
  v_row public.equipment_items;
  v_has_active_assignment boolean;
begin
  select * into v_existing from public.equipment_items where id = target_item_id;
  if v_existing.id is null then
    raise exception 'equipment item % not found', target_item_id;
  end if;
  if v_existing.archived_at is not null then
    raise exception 'this item is retired and cannot be edited';
  end if;
  if target_name is null or btrim(target_name) = '' then
    raise exception 'a name is required';
  end if;
  if target_category is null or btrim(target_category) = '' then
    raise exception 'a category is required';
  end if;

  if target_project_id is distinct from v_existing.project_id then
    select exists (select 1 from public.equipment_assignments where equipment_item_id = target_item_id and status = 'active') into v_has_active_assignment;
    if v_has_active_assignment then
      raise exception 'this item has an active assignment — return it before changing its project allocation';
    end if;
    if target_project_id is not null then
      perform public.assert_project_not_archived(target_project_id);
    end if;
  end if;

  update public.equipment_items
  set project_id = target_project_id, category = target_category, name = target_name, description = target_description,
      reference_number = nullif(btrim(coalesce(target_reference_number, '')), ''), manufacturer = target_manufacturer, model = target_model,
      specification = target_specification, location = target_location, notes = target_notes, updated_by = auth.uid()
  where id = target_item_id
  returning * into v_row;

  insert into public.equipment_history (company_id, equipment_item_id, event, actor)
  values (v_row.company_id, v_row.id, 'edited', auth.uid());

  return v_row;
end;
$$;

revoke all on function public.update_equipment_item(uuid, uuid, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_equipment_item(uuid, uuid, text, text, text, text, text, text, text, text, text) to authenticated;

-- ============================================================================
-- 8) RPCs — issue / return (the atomic core)
-- ============================================================================
create or replace function public.issue_equipment(
  target_item_id uuid,
  target_employee_id uuid,
  target_quantity integer,
  target_condition_at_issue public.equipment_condition,
  target_issued_at date default current_date,
  target_expected_return_at date default null,
  target_note text default null,
  target_request_id uuid default null
)
returns public.equipment_assignments
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item public.equipment_items;
  v_employment_status public.employment_status;
  v_archived_at timestamptz;
  v_has_active_assignment boolean;
  v_assignment public.equipment_assignments;
begin
  select * into v_item from public.equipment_items where id = target_item_id for update;
  if v_item.id is null then
    raise exception 'equipment item % not found', target_item_id;
  end if;
  if v_item.archived_at is not null or v_item.status = 'retired' then
    raise exception 'this item is retired and cannot be issued';
  end if;
  if v_item.status in ('lost', 'out_of_service') then
    raise exception 'this item is % and cannot be issued', v_item.status;
  end if;

  if v_item.tracking_mode = 'serialized' and target_quantity is distinct from 1 then
    raise exception 'a serialized item is always issued in quantity 1';
  end if;
  if target_quantity is null or target_quantity <= 0 then
    raise exception 'quantity must be greater than zero';
  end if;
  if target_quantity > v_item.available_quantity then
    raise exception 'only % available, cannot issue %', v_item.available_quantity, target_quantity;
  end if;

  select employment_status, archived_at into v_employment_status, v_archived_at from public.employees where id = target_employee_id;
  if v_employment_status is null then
    raise exception 'employee % not found', target_employee_id;
  end if;
  if v_archived_at is not null or v_employment_status <> 'active' then
    raise exception 'employee % is not currently active and cannot be issued equipment', target_employee_id;
  end if;

  if v_item.project_id is not null then
    if not exists (select 1 from public.project_assignments where project_id = v_item.project_id and employee_id = target_employee_id and end_at is null) then
      raise exception 'this employee is not an active member of this item''s project';
    end if;
  end if;

  if v_item.tracking_mode = 'serialized' then
    select exists (select 1 from public.equipment_assignments where equipment_item_id = target_item_id and status = 'active') into v_has_active_assignment;
    if v_has_active_assignment then
      raise exception 'this item already has an active holder';
    end if;
  end if;

  update public.equipment_items
  set available_quantity = available_quantity - target_quantity,
      status = case when tracking_mode = 'serialized' then 'issued'::public.equipment_status else status end,
      updated_by = auth.uid()
  where id = target_item_id;

  insert into public.equipment_assignments (
    company_id, equipment_item_id, tracking_mode, employee_id, quantity, issued_at, expected_return_at, condition_at_issue, note, issued_by
  )
  values (
    v_item.company_id, target_item_id, v_item.tracking_mode, target_employee_id, target_quantity, coalesce(target_issued_at, current_date),
    target_expected_return_at, target_condition_at_issue, target_note, auth.uid()
  )
  returning * into v_assignment;

  insert into public.equipment_history (company_id, equipment_item_id, employee_id, event, quantity, from_status, to_status, note, actor)
  values (v_item.company_id, target_item_id, target_employee_id, 'issued', target_quantity, v_item.status::text, 'issued', target_note, auth.uid());

  if target_request_id is not null then
    update public.equipment_requests
    set status = 'fulfilled', fulfilled_assignment_id = v_assignment.id, decided_by = coalesce(decided_by, auth.uid()), decided_at = coalesce(decided_at, now()), updated_at = now()
    where id = target_request_id and status = 'approved';
    if not found then
      raise exception 'equipment request % is not in an approved state and cannot be fulfilled', target_request_id;
    end if;
  end if;

  return v_assignment;
end;
$$;

comment on function public.issue_equipment(uuid, uuid, integer, public.equipment_condition, date, date, text, uuid) is
  'Item 5. Atomic: validates availability, employee eligibility (active, and project-assigned when the item is project-scoped), and (for serialized items) that no other active holder exists — the partial unique index is the final backstop, this is the clean user-facing error. Optional target_request_id fulfills an approved request in the SAME transaction, moving it to ''fulfilled'' — the equipment_requests_notify_decision trigger fires from that UPDATE, so no separate notification call is needed here.';

revoke all on function public.issue_equipment(uuid, uuid, integer, public.equipment_condition, date, date, text, uuid) from public, anon;
grant execute on function public.issue_equipment(uuid, uuid, integer, public.equipment_condition, date, date, text, uuid) to authenticated;

create or replace function public.return_equipment(
  target_assignment_id uuid,
  target_returned_quantity integer,
  target_condition_at_return public.equipment_condition,
  target_returned_at date default current_date,
  target_note text default null
)
returns public.equipment_assignments
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_assignment public.equipment_assignments;
  v_item public.equipment_items;
  v_remaining integer;
  v_reusable boolean;
begin
  select * into v_assignment from public.equipment_assignments where id = target_assignment_id for update;
  if v_assignment.id is null then
    raise exception 'equipment assignment % not found', target_assignment_id;
  end if;
  if v_assignment.status <> 'active' then
    raise exception 'this assignment is not active and cannot be returned';
  end if;
  if target_returned_quantity is null or target_returned_quantity <= 0 or target_returned_quantity > v_assignment.quantity then
    raise exception 'returned quantity must be between 1 and %', v_assignment.quantity;
  end if;

  select * into v_item from public.equipment_items where id = v_assignment.equipment_item_id for update;

  -- Damaged/requiring-inspection returns are never silently added back to
  -- available stock (item 7's explicit requirement) — only a still-usable
  -- condition replenishes available_quantity.
  v_reusable := target_condition_at_return in ('new', 'good', 'worn');

  v_remaining := v_assignment.quantity - target_returned_quantity;

  -- equipment_assignments_quantity_positive requires quantity > 0 always
  -- (even once closed) — a full return (v_remaining = 0) leaves `quantity`
  -- frozen at its last active value rather than zeroing it; `status =
  -- 'returned'` is the actual "nothing outstanding" signal, matching
  -- mark_equipment_damaged/mark_equipment_lost's precedent of never
  -- touching quantity to reflect closure.
  update public.equipment_assignments
  set quantity = case when v_remaining > 0 then v_remaining else quantity end,
      status = case when v_remaining = 0 then 'returned'::public.equipment_assignment_status else status end,
      returned_at = case when v_remaining = 0 then coalesce(target_returned_at, current_date) else returned_at end,
      condition_at_return = target_condition_at_return,
      return_note = target_note,
      returned_by = auth.uid()
  where id = target_assignment_id
  returning * into v_assignment;

  -- A serialized item's `quantity` is pinned to 1 by
  -- equipment_items_serialized_quantity_one — a damaged/lost return only
  -- ever moves available_quantity/status/condition for it (the physical
  -- unit still exists, just unusable), matching
  -- mark_equipment_damaged/mark_equipment_lost's exact convention. Only a
  -- non-reusable return of a QUANTITY item permanently removes units from
  -- the pool (quantity AND available_quantity both drop).
  update public.equipment_items
  set available_quantity = available_quantity + (case when v_reusable then target_returned_quantity else 0 end),
      quantity = quantity - (case when (not v_reusable) and tracking_mode = 'quantity' then target_returned_quantity else 0 end),
      condition = target_condition_at_return,
      status = case
        when tracking_mode = 'serialized' and v_reusable then 'available'::public.equipment_status
        when tracking_mode = 'serialized' and not v_reusable then 'out_of_service'::public.equipment_status
        else status
      end,
      updated_by = auth.uid()
  where id = v_item.id;

  insert into public.equipment_history (company_id, equipment_item_id, employee_id, event, quantity, from_status, to_status, note, actor)
  values (v_item.company_id, v_item.id, v_assignment.employee_id, 'returned', target_returned_quantity, v_item.status::text, target_condition_at_return::text, target_note, auth.uid());

  return v_assignment;
end;
$$;

comment on function public.return_equipment(uuid, integer, public.equipment_condition, date, text) is
  'Item 7. Supports partial return (quantity items) via target_returned_quantity <= the assignment''s current quantity — the assignment only closes (status=returned) once it reaches zero. Damaged/requires_inspection returns are removed from the usable pool entirely (never added back to available_quantity, and for a serialized item the item itself goes out_of_service, never straight back to available) — never blindly restocked.';

revoke all on function public.return_equipment(uuid, integer, public.equipment_condition, date, text) from public, anon;
grant execute on function public.return_equipment(uuid, integer, public.equipment_condition, date, text) to authenticated;

-- ============================================================================
-- 9) RPCs — damaged / lost / recover / retire
-- ============================================================================
create or replace function public.mark_equipment_damaged(target_item_id uuid, target_quantity integer, target_note text)
returns public.equipment_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item public.equipment_items;
  v_from_status text;
begin
  if target_note is null or btrim(target_note) = '' then
    raise exception 'a reason is required to mark equipment damaged';
  end if;

  select * into v_item from public.equipment_items where id = target_item_id for update;
  if v_item.id is null then
    raise exception 'equipment item % not found', target_item_id;
  end if;
  if target_quantity is null or target_quantity <= 0 or target_quantity > v_item.quantity then
    raise exception 'quantity must be between 1 and %', v_item.quantity;
  end if;
  if v_item.tracking_mode = 'serialized' and target_quantity <> 1 then
    raise exception 'a serialized item is always damaged in quantity 1';
  end if;
  v_from_status := v_item.status::text;

  -- A serialized item's `quantity` column is pinned to 1 by
  -- equipment_items_serialized_quantity_one — the physical unit still
  -- exists, it's just unusable, so only available_quantity/status/
  -- condition change. A quantity item's damaged units are permanently
  -- removed from the pool (quantity AND available_quantity both drop).
  update public.equipment_items
  set quantity = quantity - (case when tracking_mode = 'quantity' then target_quantity else 0 end),
      available_quantity = greatest(available_quantity - target_quantity, 0),
      condition = 'damaged',
      status = case when tracking_mode = 'serialized' then 'out_of_service'::public.equipment_status else status end,
      updated_by = auth.uid()
  where id = target_item_id
  returning * into v_item;

  if v_item.tracking_mode = 'serialized' then
    update public.equipment_assignments
    set status = 'written_off', returned_at = coalesce(returned_at, current_date), condition_at_return = 'damaged', return_note = target_note, returned_by = auth.uid()
    where equipment_item_id = target_item_id and status = 'active';
  end if;

  insert into public.equipment_history (company_id, equipment_item_id, event, quantity, from_status, to_status, note, actor)
  values (v_item.company_id, v_item.id, 'damaged', target_quantity, v_from_status, v_item.status::text, target_note, auth.uid());

  return v_item;
end;
$$;

revoke all on function public.mark_equipment_damaged(uuid, integer, text) from public, anon;
grant execute on function public.mark_equipment_damaged(uuid, integer, text) to authenticated;

create or replace function public.mark_equipment_lost(target_item_id uuid, target_quantity integer, target_note text)
returns public.equipment_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item public.equipment_items;
  v_from_status text;
begin
  if target_note is null or btrim(target_note) = '' then
    raise exception 'a reason is required to mark equipment lost';
  end if;

  select * into v_item from public.equipment_items where id = target_item_id for update;
  if v_item.id is null then
    raise exception 'equipment item % not found', target_item_id;
  end if;
  if target_quantity is null or target_quantity <= 0 or target_quantity > v_item.quantity then
    raise exception 'quantity must be between 1 and %', v_item.quantity;
  end if;
  if v_item.tracking_mode = 'serialized' and target_quantity <> 1 then
    raise exception 'a serialized item is always lost in quantity 1';
  end if;
  v_from_status := v_item.status::text;

  update public.equipment_items
  set quantity = quantity - (case when tracking_mode = 'quantity' then target_quantity else 0 end),
      available_quantity = greatest(available_quantity - target_quantity, 0),
      status = case when tracking_mode = 'serialized' then 'lost'::public.equipment_status else status end,
      updated_by = auth.uid()
  where id = target_item_id
  returning * into v_item;

  if v_item.tracking_mode = 'serialized' then
    -- Last holder preserved, never deleted — only the status changes.
    update public.equipment_assignments
    set status = 'lost', condition_at_return = 'damaged', return_note = target_note, returned_by = auth.uid()
    where equipment_item_id = target_item_id and status = 'active';
  end if;

  insert into public.equipment_history (company_id, equipment_item_id, event, quantity, from_status, to_status, note, actor)
  values (v_item.company_id, v_item.id, 'lost', target_quantity, v_from_status, v_item.status::text, target_note, auth.uid());

  return v_item;
end;
$$;

comment on function public.mark_equipment_lost(uuid, integer, text) is
  'Item 8. Never deletes the asset or its assignment history — the last holder''s equipment_assignments row is preserved (status flips to lost), and equipment_history keeps a permanent record. quantity/available_quantity are permanently reduced (a lost unit is gone from the pool) — recover_equipment() is the deliberate, audited path back if it turns up.';

revoke all on function public.mark_equipment_lost(uuid, integer, text) from public, anon;
grant execute on function public.mark_equipment_lost(uuid, integer, text) to authenticated;

create or replace function public.recover_equipment(target_item_id uuid, target_quantity integer, target_note text)
returns public.equipment_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item public.equipment_items;
  v_from_status text;
begin
  select * into v_item from public.equipment_items where id = target_item_id for update;
  if v_item.id is null then
    raise exception 'equipment item % not found', target_item_id;
  end if;
  if v_item.status not in ('lost', 'out_of_service') then
    raise exception 'only a lost or out-of-service item can be recovered';
  end if;
  if target_quantity is null or target_quantity <= 0 then
    raise exception 'quantity must be greater than zero';
  end if;
  if v_item.tracking_mode = 'serialized' and target_quantity <> 1 then
    raise exception 'a serialized item is always recovered in quantity 1';
  end if;
  v_from_status := v_item.status::text;

  -- A serialized item's `quantity` never moved (mark_equipment_damaged/
  -- mark_equipment_lost only ever touch available_quantity for it, per
  -- equipment_items_serialized_quantity_one) — recovering it just
  -- restores available_quantity to 1, never adds to quantity again. A
  -- quantity item's damaged/lost units WERE permanently removed from the
  -- pool, so recovering them adds back to both quantity and
  -- available_quantity.
  update public.equipment_items
  set quantity = quantity + (case when tracking_mode = 'quantity' then target_quantity else 0 end),
      available_quantity = available_quantity + target_quantity,
      status = 'available',
      condition = case when condition in ('damaged', 'requires_inspection') then 'requires_inspection'::public.equipment_condition else condition end,
      updated_by = auth.uid()
  where id = target_item_id
  returning * into v_item;

  insert into public.equipment_history (company_id, equipment_item_id, event, quantity, from_status, to_status, note, actor)
  values (v_item.company_id, v_item.id, 'recovered', target_quantity, v_from_status, v_item.status::text, target_note, auth.uid());

  return v_item;
end;
$$;

revoke all on function public.recover_equipment(uuid, integer, text) from public, anon;
grant execute on function public.recover_equipment(uuid, integer, text) to authenticated;

create or replace function public.set_equipment_out_of_service(target_item_id uuid, target_note text)
returns public.equipment_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item public.equipment_items;
  v_from_status text;
begin
  select * into v_item from public.equipment_items where id = target_item_id for update;
  if v_item.id is null then
    raise exception 'equipment item % not found', target_item_id;
  end if;
  if v_item.archived_at is not null then
    raise exception 'this item is retired';
  end if;
  v_from_status := v_item.status::text;

  update public.equipment_items
  set status = 'out_of_service', condition = 'requires_inspection', updated_by = auth.uid()
  where id = target_item_id
  returning * into v_item;

  insert into public.equipment_history (company_id, equipment_item_id, event, from_status, to_status, note, actor)
  values (v_item.company_id, v_item.id, 'out_of_service', v_from_status, v_item.status::text, target_note, auth.uid());

  return v_item;
end;
$$;

revoke all on function public.set_equipment_out_of_service(uuid, text) from public, anon;
grant execute on function public.set_equipment_out_of_service(uuid, text) to authenticated;

create or replace function public.retire_equipment_item(target_item_id uuid, target_note text)
returns public.equipment_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item public.equipment_items;
  v_from_status text;
  v_has_active_assignment boolean;
begin
  select * into v_item from public.equipment_items where id = target_item_id for update;
  if v_item.id is null then
    raise exception 'equipment item % not found', target_item_id;
  end if;
  select exists (select 1 from public.equipment_assignments where equipment_item_id = target_item_id and status = 'active') into v_has_active_assignment;
  if v_has_active_assignment then
    raise exception 'this item has an active assignment — return it before retiring';
  end if;
  v_from_status := v_item.status::text;

  update public.equipment_items
  set status = 'retired', archived_at = now(), available_quantity = 0, updated_by = auth.uid()
  where id = target_item_id
  returning * into v_item;

  insert into public.equipment_history (company_id, equipment_item_id, event, from_status, to_status, note, actor)
  values (v_item.company_id, v_item.id, 'retired', v_from_status, v_item.status::text, target_note, auth.uid());

  return v_item;
end;
$$;

comment on function public.retire_equipment_item(uuid, text) is
  'Item 4: archive/retire instead of hard delete — the row and its full equipment_assignments/equipment_history trail are preserved forever. Refuses while an active assignment exists.';

revoke all on function public.retire_equipment_item(uuid, text) from public, anon;
grant execute on function public.retire_equipment_item(uuid, text) to authenticated;

-- ============================================================================
-- 10) RPCs — request decisions (approve/deny/return/cancel). Submission
--     itself is a plain RLS-gated INSERT (matches requestLeave's pattern
--     exactly), not an RPC.
-- ============================================================================
create or replace function public.approve_equipment_request(target_request_id uuid, target_comment text default null)
returns public.equipment_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.equipment_requests;
begin
  update public.equipment_requests
  set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_comment = target_comment, updated_at = now()
  where id = target_request_id and status = 'pending'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'pending equipment request % not found', target_request_id;
  end if;
  return v_row;
end;
$$;

revoke all on function public.approve_equipment_request(uuid, text) from public, anon;
grant execute on function public.approve_equipment_request(uuid, text) to authenticated;

create or replace function public.deny_equipment_request(target_request_id uuid, target_comment text)
returns public.equipment_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.equipment_requests;
begin
  if target_comment is null or btrim(target_comment) = '' then
    raise exception 'a reason is required to deny an equipment request';
  end if;
  update public.equipment_requests
  set status = 'denied', decided_by = auth.uid(), decided_at = now(), decision_comment = target_comment, updated_at = now()
  where id = target_request_id and status = 'pending'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'pending equipment request % not found', target_request_id;
  end if;
  return v_row;
end;
$$;

revoke all on function public.deny_equipment_request(uuid, text) from public, anon;
grant execute on function public.deny_equipment_request(uuid, text) to authenticated;

create or replace function public.return_equipment_request(target_request_id uuid, target_comment text)
returns public.equipment_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.equipment_requests;
begin
  if target_comment is null or btrim(target_comment) = '' then
    raise exception 'a comment is required to return an equipment request for changes';
  end if;
  update public.equipment_requests
  set status = 'returned', decided_by = auth.uid(), decided_at = now(), decision_comment = target_comment, updated_at = now()
  where id = target_request_id and status = 'pending'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'pending equipment request % not found', target_request_id;
  end if;
  return v_row;
end;
$$;

revoke all on function public.return_equipment_request(uuid, text) from public, anon;
grant execute on function public.return_equipment_request(uuid, text) to authenticated;

create or replace function public.cancel_equipment_request(target_request_id uuid)
returns public.equipment_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.equipment_requests;
begin
  update public.equipment_requests
  set status = 'cancelled', decided_by = auth.uid(), decided_at = now(), updated_at = now()
  where id = target_request_id and status = 'pending'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'pending equipment request % not found', target_request_id;
  end if;
  return v_row;
end;
$$;

comment on function public.cancel_equipment_request(uuid) is
  'RLS (equipment_requests_update) already restricts WHO may reach this to management or the requesting employee themselves — self-cancellation is the intended everyday path.';

revoke all on function public.cancel_equipment_request(uuid) from public, anon;
grant execute on function public.cancel_equipment_request(uuid) to authenticated;

-- ============================================================================
-- 11) Notification triggers — reuse notify_project_managers()/
--     notify_employee() from 20260826090000_copy_teams_and_notifications.sql
--     verbatim, never redefined here.
-- ============================================================================
create or replace function public.trg_notify_managers_of_equipment_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.notify_project_managers(
    new.company_id, new.project_id, 'equipment_request_submitted', 'New equipment request',
    format('%s (qty %s): %s', new.item_description, new.quantity, new.reason),
    format('/companies/%s/projects/%s/equipment?tab=requests', new.company_id, new.project_id)
  );
  return new;
end;
$$;

create trigger equipment_requests_notify_managers
  after insert on public.equipment_requests
  for each row execute function public.trg_notify_managers_of_equipment_request();

create or replace function public.trg_notify_employee_of_equipment_request_decision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link text;
begin
  if new.status = old.status then
    return new;
  end if;

  v_link := format('/companies/%s/projects/%s/equipment?tab=requests', new.company_id, new.project_id);

  if new.status = 'approved' then
    perform public.notify_employee(new.company_id, new.employee_id, 'equipment_request_approved', 'Equipment request approved', new.item_description, v_link);
  elsif new.status = 'denied' then
    perform public.notify_employee(new.company_id, new.employee_id, 'equipment_request_denied', 'Equipment request denied', coalesce(new.decision_comment, ''), v_link);
  elsif new.status = 'returned' then
    perform public.notify_employee(new.company_id, new.employee_id, 'equipment_request_returned', 'Equipment request needs changes', coalesce(new.decision_comment, ''), v_link);
  elsif new.status = 'fulfilled' then
    perform public.notify_employee(
      new.company_id, new.employee_id, 'equipment_request_fulfilled', 'Equipment issued',
      format('%s (qty %s), %s', new.item_description, new.quantity, to_char(now(), 'DD Mon YYYY')),
      '/my-equipment'
    );
  end if;

  return new;
end;
$$;

create trigger equipment_requests_notify_decision
  after update on public.equipment_requests
  for each row
  when (new.status is distinct from old.status)
  execute function public.trg_notify_employee_of_equipment_request_decision();

comment on function public.trg_notify_employee_of_equipment_request_decision() is
  'Item 12: one trigger covers approved/denied/returned/fulfilled uniformly — issue_equipment()''s request-linkage UPDATE (status -> fulfilled) fires this SAME trigger, so no separate "equipment issued" notification call exists inside issue_equipment() itself. cancelled fires no notification (self-initiated).';
