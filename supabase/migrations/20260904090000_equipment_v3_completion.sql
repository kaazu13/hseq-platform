-- Equipment V3 completion (Parts 22-28 of the workforce/pay/equipment task).
-- Schema inspected first — reusing all existing V2/V3 groundwork
-- (equipment_items/equipment_assignments/equipment_requests/equipment_history,
-- tracking_mode, default_validity_days, unit_price/currency,
-- is_equipment_manage_tier/is_equipment_catalog_manage_tier). Genuinely
-- missing and added here:
--
-- 1. `equipment_items.requestable` — Part 24's catalog field, did not
--    exist at all before this migration.
-- 2. `create_equipment_item`/`update_equipment_item` gain unit_price/
--    currency/requestable params (the columns existed since
--    20260902120000 but no RPC ever accepted them — the Add/Edit dialog
--    had no price/requestable inputs).
-- 3. `adjust_equipment_stock` — Part 26's missing stock-adjustment RPC:
--    +/- delta, REQUIRED reason, records before/change/after via
--    equipment_history's existing 'stock_adjusted' event value (added in
--    20260902120000 but never used by any RPC until now), never allows
--    negative stock.
-- 4. Stock-privacy DB/API boundary fix (Part 28) — the REAL gap: the
--    table-level `grant select ... to authenticated` combined with
--    row-only RLS means ANY company member with row access (which
--    `equipment_items_select` grants to every project member, since
--    company-wide items always pass `project_id is null`) can read
--    `quantity`/`available_quantity`/`unit_price` directly via a raw
--    PostgREST call, regardless of what the app's own query functions
--    choose to select — the prior report's query-layer fix never closed
--    this. Fixed here with a genuine privilege split: the three stock/
--    pricing columns are revoked from the blanket `authenticated` grant,
--    and reachable only via two narrow, purpose-built SECURITY DEFINER
--    RPCs (management full-row access, gated on
--    is_equipment_manage_tier; and a self-service "items I have an
--    assignment for" projection) — never a raw `select *`.
-- 5. `get_equipment_overview_counts` — Part 23's Overview tab metrics,
--    computed in one aggregate SQL round trip (Part 34's "no N+1"),
--    manage-tier gated since it necessarily touches the now-restricted
--    stock columns.
-- 6. `list_equipment_history_for_project` — Part 27's History tab filters
--    (item/employee/action/date) working across the whole project's
--    items, not just one pre-selected item.

-- ============================================================================
-- 1) equipment_items.requestable
-- ============================================================================
alter table public.equipment_items add column requestable boolean not null default true;

comment on column public.equipment_items.requestable is
  'Part 24 — whether employees may self-service request this catalog item. Purely a catalog/UI flag; never a security boundary on its own (listRequestableEquipmentItems() and the self-service RLS/column grants are the actual enforcement).';

-- ============================================================================
-- 2) create_equipment_item / update_equipment_item — accept unit_price,
--    currency, requestable (columns already existed; no RPC ever wrote
--    them).
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
  target_notes text default null,
  target_default_validity_days integer default null,
  target_unit_price numeric default null,
  target_currency text default 'EUR',
  target_requestable boolean default true
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
  if target_default_validity_days is not null and (target_default_validity_days <= 0 or target_default_validity_days > 36500) then
    raise exception 'default validity days must be between 1 and 36500';
  end if;
  if target_unit_price is not null and target_unit_price < 0 then
    raise exception 'unit price cannot be negative';
  end if;

  v_quantity := case when target_tracking_mode = 'serialized' then 1 else greatest(coalesce(target_quantity, 1), 0) end;

  if target_project_id is not null then
    perform public.assert_project_not_archived(target_project_id);
  end if;

  insert into public.equipment_items (
    company_id, project_id, tracking_mode, category, name, description, reference_number,
    manufacturer, model, specification, quantity, available_quantity, condition, location, notes,
    default_validity_days, unit_price, currency, requestable, created_by, updated_by
  )
  values (
    target_company_id, target_project_id, target_tracking_mode, target_category, target_name, target_description, nullif(btrim(coalesce(target_reference_number, '')), ''),
    target_manufacturer, target_model, target_specification, v_quantity, v_quantity, coalesce(target_condition, 'new'), target_location, target_notes,
    target_default_validity_days, target_unit_price, coalesce(nullif(btrim(coalesce(target_currency, '')), ''), 'EUR'), coalesce(target_requestable, true), auth.uid(), auth.uid()
  )
  returning * into v_row;

  insert into public.equipment_history (company_id, equipment_item_id, event, quantity, to_status, actor)
  values (target_company_id, v_row.id, 'added', v_quantity, v_row.status::text, auth.uid());

  return v_row;
end;
$$;

revoke all on function public.create_equipment_item(uuid, uuid, public.equipment_tracking_mode, text, text, text, text, text, text, text, integer, public.equipment_condition, text, text, integer, numeric, text, boolean) from public, anon;
grant execute on function public.create_equipment_item(uuid, uuid, public.equipment_tracking_mode, text, text, text, text, text, text, text, integer, public.equipment_condition, text, text, integer, numeric, text, boolean) to authenticated;

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
  target_notes text default null,
  target_default_validity_days integer default null,
  target_unit_price numeric default null,
  target_currency text default 'EUR',
  target_requestable boolean default true
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
  if target_default_validity_days is not null and (target_default_validity_days <= 0 or target_default_validity_days > 36500) then
    raise exception 'default validity days must be between 1 and 36500';
  end if;
  if target_unit_price is not null and target_unit_price < 0 then
    raise exception 'unit price cannot be negative';
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
      specification = target_specification, location = target_location, notes = target_notes, default_validity_days = target_default_validity_days,
      unit_price = target_unit_price, currency = coalesce(nullif(btrim(coalesce(target_currency, '')), ''), 'EUR'), requestable = coalesce(target_requestable, true),
      updated_by = auth.uid()
  where id = target_item_id
  returning * into v_row;

  insert into public.equipment_history (company_id, equipment_item_id, event, actor)
  values (v_row.company_id, v_row.id, 'edited', auth.uid());

  return v_row;
end;
$$;

revoke all on function public.update_equipment_item(uuid, uuid, text, text, text, text, text, text, text, text, text, integer, numeric, text, boolean) from public, anon;
grant execute on function public.update_equipment_item(uuid, uuid, text, text, text, text, text, text, text, text, text, integer, numeric, text, boolean) to authenticated;

-- ============================================================================
-- 3) adjust_equipment_stock — Part 26. Only meaningful for tracking_mode
--    = 'quantity' items (a serialized item's stock is its status, not a
--    number to adjust). Reason is required, never negative stock,
--    records before/change/after via equipment_history.
-- ============================================================================
create or replace function public.adjust_equipment_stock(
  target_item_id uuid,
  target_delta integer,
  target_reason text
)
returns public.equipment_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item public.equipment_items;
  v_new_quantity integer;
  v_new_available integer;
begin
  if target_reason is null or btrim(target_reason) = '' then
    raise exception 'a reason is required to adjust stock';
  end if;
  if target_delta is null or target_delta = 0 then
    raise exception 'the adjustment amount cannot be zero';
  end if;

  select * into v_item from public.equipment_items where id = target_item_id for update;
  if v_item.id is null then
    raise exception 'equipment item % not found', target_item_id;
  end if;
  if v_item.archived_at is not null then
    raise exception 'this item is retired and cannot be adjusted';
  end if;
  if v_item.tracking_mode <> 'quantity' then
    raise exception 'stock adjustment only applies to quantity-tracked items — add a new serialized item instead';
  end if;

  v_new_quantity := v_item.quantity + target_delta;
  v_new_available := v_item.available_quantity + target_delta;
  if v_new_quantity < 0 or v_new_available < 0 then
    raise exception 'this adjustment would result in negative stock (currently % total, % available)', v_item.quantity, v_item.available_quantity;
  end if;

  update public.equipment_items
  set quantity = v_new_quantity, available_quantity = v_new_available, updated_by = auth.uid()
  where id = target_item_id
  returning * into v_item;

  insert into public.equipment_history (company_id, equipment_item_id, event, quantity, from_status, to_status, note, actor)
  values (
    v_item.company_id, v_item.id, 'stock_adjusted', abs(target_delta),
    format('%s -> %s', v_new_quantity - target_delta, v_new_quantity),
    v_new_quantity::text,
    target_reason, auth.uid()
  );

  return v_item;
end;
$$;

comment on function public.adjust_equipment_stock(uuid, integer, text) is
  'Part 26 — the missing manual stock-adjustment path (New delivery / Damaged stock / Inventory correction / etc.). target_delta may be positive or negative; a reason is mandatory; negative resulting stock is refused. Both quantity and available_quantity move together (this is a manual count correction, not an issue/return/damage event, which already have their own dedicated RPCs).';

revoke all on function public.adjust_equipment_stock(uuid, integer, text) from public, anon;
grant execute on function public.adjust_equipment_stock(uuid, integer, text) to authenticated;

-- ============================================================================
-- 4) Stock-privacy DB/API boundary fix (Part 28) — column-level privilege
--    split. RLS alone cannot express "this column is visible only when
--    the row-accessing user is ALSO manage-tier for this row" (RLS is
--    row-filtering, not column-filtering); the standard, safe Postgres
--    answer is to remove the sensitive columns from the blanket role
--    grant entirely and reach them only through SECURITY DEFINER RPCs
--    that re-check authorization themselves.
-- ============================================================================
revoke select on public.equipment_items from authenticated;
grant select (
  id, company_id, project_id, tracking_mode, category, name, description, reference_number,
  manufacturer, model, specification, status, condition, location, notes, currency, requestable,
  default_validity_days, archived_at, created_at, updated_at, created_by, updated_by
) on public.equipment_items to authenticated;

comment on column public.equipment_items.quantity is
  'STOCK column — deliberately excluded from the table-level grant to `authenticated` (Part 28). Readable only via list_equipment_items_management()/get_equipment_overview_counts() (both is_equipment_manage_tier-gated SECURITY DEFINER RPCs), never a raw `select *`.';
comment on column public.equipment_items.available_quantity is
  'STOCK column — see quantity''s comment. The single source of truth for "how much can still be issued", but never directly selectable by a plain authenticated role; only through the management RPCs.';
comment on column public.equipment_items.unit_price is
  'Pricing column — deliberately excluded from the table-level grant to `authenticated` (Part 28''s "management inventory values"). Readable via list_equipment_items_management() (manage-tier) or get_my_equipment_item_display_info() (self, scoped to items the caller has an actual assignment for).';

-- The item-lifecycle RPCs above already run security invoker as the
-- calling user, but they only ever touch equipment_items via `for update`/
-- plain UPDATE statements gated by RLS, never a raw SELECT of the
-- restricted columns from the client — so the column-grant revoke does
-- not affect issue_equipment/return_equipment/mark_equipment_*/
-- adjust_equipment_stock/etc. (INSERT/UPDATE privileges are unaffected;
-- only SELECT was revoked). RLS's USING clause evaluation for UPDATE/
-- DELETE also reads whichever columns the policy itself references
-- (company_id, project_id) — both stay in the safe-column grant, so this
-- causes no regression there either.

-- Full-row management access — is_equipment_manage_tier gated, returns
-- every column (bypasses the column-grant restriction via SECURITY
-- DEFINER, exactly the "restricted SECURITY DEFINER RPC" the task calls
-- for). One flexible function replaces the several raw `select *`
-- queries modules/equipment/queries.ts previously issued directly
-- against the table for management contexts.
create or replace function public.list_equipment_items_management(
  target_company_id uuid,
  target_project_id uuid,
  target_item_ids uuid[] default null,
  target_search text default null,
  target_category text default null,
  target_statuses public.equipment_status[] default null,
  target_condition public.equipment_condition default null,
  target_ownership text default 'all',
  target_include_archived boolean default false,
  target_limit integer default null,
  target_offset integer default 0
)
returns setof public.equipment_items
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_equipment_manage_tier(target_company_id, target_project_id) then
    raise exception 'not authorized to view equipment management detail';
  end if;

  return query
  select ei.*
  from public.equipment_items ei
  where ei.company_id = target_company_id
    and (target_item_ids is null or ei.id = any(target_item_ids))
    and (
      (target_ownership = 'company' and ei.project_id is null)
      or (target_ownership = 'project' and ei.project_id = target_project_id)
      or (target_ownership = 'all' and (ei.project_id = target_project_id or ei.project_id is null))
    )
    and (target_include_archived or ei.archived_at is null)
    and (target_category is null or ei.category = target_category)
    and (target_statuses is null or ei.status = any(target_statuses))
    and (target_condition is null or ei.condition = target_condition)
    and (
      target_search is null or btrim(target_search) = '' or (
        ei.name ilike '%' || target_search || '%'
        or ei.category ilike '%' || target_search || '%'
        or coalesce(ei.reference_number, '') ilike '%' || target_search || '%'
        or coalesce(ei.description, '') ilike '%' || target_search || '%'
      )
    )
  order by ei.name asc
  limit target_limit offset target_offset;
end;
$$;

comment on function public.list_equipment_items_management(uuid, uuid, uuid[], text, text, public.equipment_status[], public.equipment_condition, text, boolean, integer, integer) is
  'Part 28 — the ONE management-tier full-row read path (Inventory/Catalog lists, single-item lookups, export, candidate pickers). is_equipment_manage_tier-gated; raises rather than silently returning nothing, so a caller that reaches this without authority gets a clear error, matching every other RPC in this migration family.';

revoke all on function public.list_equipment_items_management(uuid, uuid, uuid[], text, text, public.equipment_status[], public.equipment_condition, text, boolean, integer, integer) from public, anon;
grant execute on function public.list_equipment_items_management(uuid, uuid, uuid[], text, text, public.equipment_status[], public.equipment_condition, text, boolean, integer, integer) to authenticated;

create or replace function public.count_equipment_items_management(
  target_company_id uuid,
  target_project_id uuid,
  target_search text default null,
  target_category text default null,
  target_statuses public.equipment_status[] default null,
  target_condition public.equipment_condition default null,
  target_ownership text default 'all',
  target_include_archived boolean default false
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_count bigint;
begin
  if not public.is_equipment_manage_tier(target_company_id, target_project_id) then
    raise exception 'not authorized to view equipment management detail';
  end if;

  select count(*)
  into v_count
  from public.equipment_items ei
  where ei.company_id = target_company_id
    and (
      (target_ownership = 'company' and ei.project_id is null)
      or (target_ownership = 'project' and ei.project_id = target_project_id)
      or (target_ownership = 'all' and (ei.project_id = target_project_id or ei.project_id is null))
    )
    and (target_include_archived or ei.archived_at is null)
    and (target_category is null or ei.category = target_category)
    and (target_statuses is null or ei.status = any(target_statuses))
    and (target_condition is null or ei.condition = target_condition)
    and (
      target_search is null or btrim(target_search) = '' or (
        ei.name ilike '%' || target_search || '%'
        or ei.category ilike '%' || target_search || '%'
        or coalesce(ei.reference_number, '') ilike '%' || target_search || '%'
        or coalesce(ei.description, '') ilike '%' || target_search || '%'
      )
    );

  return v_count;
end;
$$;

revoke all on function public.count_equipment_items_management(uuid, uuid, text, text, public.equipment_status[], public.equipment_condition, text, boolean) from public, anon;
grant execute on function public.count_equipment_items_management(uuid, uuid, text, text, public.equipment_status[], public.equipment_condition, text, boolean) to authenticated;

-- Self-service safe projection — NOT manage-tier gated, but scoped
-- strictly to items the caller has an equipment_assignments row for (as
-- themselves) — an ordinary employee can see the price/reference of
-- their OWN issued gear (unchanged prior behavior for that specific
-- case), never an arbitrary catalog item's stock/price by guessing IDs.
create or replace function public.get_my_equipment_item_display_info(target_company_id uuid, target_item_ids uuid[])
returns table(id uuid, name text, reference_number text, category text, tracking_mode public.equipment_tracking_mode, unit_price numeric, currency text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ei.id, ei.name, ei.reference_number, ei.category, ei.tracking_mode, ei.unit_price, ei.currency
  from public.equipment_items ei
  where ei.company_id = target_company_id
    and ei.id = any(target_item_ids)
    and exists (
      select 1
      from public.equipment_assignments ea
      join public.employees emp on emp.id = ea.employee_id
      where ea.equipment_item_id = ei.id and emp.profile_id = auth.uid()
    );
$$;

comment on function public.get_my_equipment_item_display_info(uuid, uuid[]) is
  'Part 28 — the self-service counterpart to list_equipment_items_management(): no manage-tier check, but the EXISTS clause means it only ever returns a row for an item the calling profile actually has (or had) an assignment for. Powers "My Equipment" — never a general item lookup.';

revoke all on function public.get_my_equipment_item_display_info(uuid, uuid[]) from public, anon;
grant execute on function public.get_my_equipment_item_display_info(uuid, uuid[]) to authenticated;

-- ============================================================================
-- 5) get_equipment_overview_counts — Part 23. One aggregate round trip
--    (Part 34: no N+1), manage-tier gated (touches the restricted stock
--    columns).
-- ============================================================================
create or replace function public.get_equipment_overview_counts(target_company_id uuid, target_project_id uuid)
returns table(
  catalog_items bigint,
  available_stock bigint,
  serialized_available bigint,
  currently_issued bigint,
  pending_requests bigint,
  expiring_soon bigint,
  expired bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_equipment_manage_tier(target_company_id, target_project_id) then
    raise exception 'not authorized to view the equipment overview';
  end if;

  return query
  select
    (select count(*) from public.equipment_items ei where ei.company_id = target_company_id and (ei.project_id = target_project_id or ei.project_id is null) and ei.archived_at is null),
    (select coalesce(sum(ei.available_quantity), 0) from public.equipment_items ei where ei.company_id = target_company_id and (ei.project_id = target_project_id or ei.project_id is null) and ei.archived_at is null and ei.tracking_mode = 'quantity'),
    (select count(*) from public.equipment_items ei where ei.company_id = target_company_id and (ei.project_id = target_project_id or ei.project_id is null) and ei.archived_at is null and ei.tracking_mode = 'serialized' and ei.status = 'available'),
    (select count(*) from public.equipment_assignments ea join public.equipment_items ei on ei.id = ea.equipment_item_id where ei.company_id = target_company_id and (ei.project_id = target_project_id or ei.project_id is null) and ea.status = 'active'),
    (select count(*) from public.equipment_requests er where er.company_id = target_company_id and er.project_id = target_project_id and er.status = 'pending'),
    (select count(*) from public.equipment_assignments ea join public.equipment_items ei on ei.id = ea.equipment_item_id where ei.company_id = target_company_id and (ei.project_id = target_project_id or ei.project_id is null) and ea.status = 'active' and ea.expires_at is not null and ea.expires_at >= current_date and ea.expires_at <= current_date + 30),
    (select count(*) from public.equipment_assignments ea join public.equipment_items ei on ei.id = ea.equipment_item_id where ei.company_id = target_company_id and (ei.project_id = target_project_id or ei.project_id is null) and ea.status = 'active' and ea.expires_at is not null and ea.expires_at < current_date);
end;
$$;

comment on function public.get_equipment_overview_counts(uuid, uuid) is
  'Part 23/34 — Overview tab metrics in one round trip: catalog item count, available quantity-stock total, available serialized-unit count, currently-issued (active assignment) count, pending requests, and expiring<=30d/expired active-assignment counts. Never exposed to self-service roles (manage-tier gated).';

revoke all on function public.get_equipment_overview_counts(uuid, uuid) from public, anon;
grant execute on function public.get_equipment_overview_counts(uuid, uuid) to authenticated;

-- ============================================================================
-- 6) list_equipment_history_for_project — Part 27. Project-wide history
--    feed with item/employee/action/date filters, bounded/paginated —
--    the existing History tab required a pre-selected single item; this
--    is the genuinely new "browse everything" path.
-- ============================================================================
create or replace function public.list_equipment_history_for_project(
  target_company_id uuid,
  target_project_id uuid,
  target_item_id uuid default null,
  target_employee_id uuid default null,
  target_event public.equipment_history_event default null,
  target_from_date date default null,
  target_to_date date default null,
  target_limit integer default 200,
  target_offset integer default 0
)
returns setof public.equipment_history
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_equipment_manage_tier(target_company_id, target_project_id) then
    raise exception 'not authorized to view equipment history';
  end if;

  return query
  select eh.*
  from public.equipment_history eh
  join public.equipment_items ei on ei.id = eh.equipment_item_id
  where eh.company_id = target_company_id
    and (ei.project_id = target_project_id or ei.project_id is null)
    and (target_item_id is null or eh.equipment_item_id = target_item_id)
    and (target_employee_id is null or eh.employee_id = target_employee_id)
    and (target_event is null or eh.event = target_event)
    and (target_from_date is null or eh.created_at >= target_from_date::timestamptz)
    and (target_to_date is null or eh.created_at < (target_to_date + 1)::timestamptz)
  order by eh.created_at desc
  limit least(coalesce(target_limit, 200), 500) offset target_offset;
end;
$$;

comment on function public.list_equipment_history_for_project(uuid, uuid, uuid, uuid, public.equipment_history_event, date, date, integer, integer) is
  'Part 27 — the project-wide History tab: filterable by item/employee/action/date, bounded to 500 rows/request. manage-tier gated, same authority as every other management equipment read.';

revoke all on function public.list_equipment_history_for_project(uuid, uuid, uuid, uuid, public.equipment_history_event, date, date, integer, integer) from public, anon;
grant execute on function public.list_equipment_history_for_project(uuid, uuid, uuid, uuid, public.equipment_history_event, date, date, integer, integer) to authenticated;
