-- CRITICAL regression fix, found via live testing immediately after
-- 20260904090000's stock-privacy column-grant split (Part 28).
--
-- That migration correctly removed quantity/available_quantity/unit_price
-- from the blanket `authenticated` SELECT grant on equipment_items (the
-- real Part 28 fix), but every equipment LIFECYCLE RPC below is
-- `security invoker` and internally does `select * from equipment_items`
-- (or updates those columns) — under SECURITY INVOKER, a function's own
-- internal queries run with the CALLING role's privileges, so the column
-- revoke silently broke every one of these for EVERY caller, including
-- company_admin: "permission denied for table equipment_items" on issue,
-- return, mark damaged/lost, recover, retire, set out of service, edit,
-- and the new adjust-stock RPC. Confirmed live (adjust_equipment_stock
-- failed for a company_admin session during this session's own fixture
-- seeding — the very first genuine post-migration exercise of these
-- paths).
--
-- Fix: convert each to SECURITY DEFINER (so it can read/write every
-- column regardless of the caller's column grant, exactly like the new
-- list_equipment_items_management()/get_equipment_overview_counts()
-- already do) and add an EXPLICIT authorization check reproducing the
-- exact same WHO logic the RLS policy it used to rely on already
-- enforced — is_equipment_manage_tier() for issue/return/damage/lost/
-- recover/retire/out-of-service (never planner), is_equipment_catalog_
-- manage_tier() for update/adjust-stock (planner included, matching
-- Part 24/33's catalog authority). No authorization semantics change —
-- only where the check is performed (explicit statement vs. RLS +
-- column grant).

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
  target_requestable boolean default true,
  target_purchase_date date default null
)
returns public.equipment_items
language plpgsql
security definer
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
  if not public.is_equipment_catalog_manage_tier(v_existing.company_id, v_existing.project_id) then
    raise exception 'not authorized to edit this equipment item';
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
  if target_purchase_date is not null and target_purchase_date > current_date then
    raise exception 'purchase date cannot be in the future';
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
      purchase_date = target_purchase_date, updated_by = auth.uid()
  where id = target_item_id
  returning * into v_row;

  insert into public.equipment_history (company_id, equipment_item_id, event, actor)
  values (v_row.company_id, v_row.id, 'edited', auth.uid());

  return v_row;
end;
$$;

create or replace function public.adjust_equipment_stock(
  target_item_id uuid,
  target_delta integer,
  target_reason text
)
returns public.equipment_items
language plpgsql
security definer
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
  if not public.is_equipment_catalog_manage_tier(v_item.company_id, v_item.project_id) then
    raise exception 'not authorized to adjust stock for this equipment item';
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

create or replace function public.issue_equipment(
  target_item_id uuid,
  target_employee_id uuid,
  target_quantity integer,
  target_condition_at_issue public.equipment_condition,
  target_issued_at date default current_date,
  target_expected_return_at date default null,
  target_note text default null,
  target_request_id uuid default null,
  target_expires_at date default null,
  target_use_default_validity boolean default true
)
returns public.equipment_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.equipment_items;
  v_employment_status public.employment_status;
  v_archived_at timestamptz;
  v_has_active_assignment boolean;
  v_assignment public.equipment_assignments;
  v_issued_at date;
  v_resolved_expires_at date;
begin
  select * into v_item from public.equipment_items where id = target_item_id for update;
  if v_item.id is null then
    raise exception 'equipment item % not found', target_item_id;
  end if;
  if not public.is_equipment_manage_tier(v_item.company_id, v_item.project_id) then
    raise exception 'not authorized to issue this equipment item';
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

  v_issued_at := coalesce(target_issued_at, current_date);

  if target_expires_at is not null then
    if target_expires_at < v_issued_at then
      raise exception 'expiry date cannot be before the issue date';
    end if;
    if (target_expires_at - v_issued_at) > 36500 then
      raise exception 'expiry date is too far in the future';
    end if;
    v_resolved_expires_at := target_expires_at;
  elsif target_use_default_validity and v_item.default_validity_days is not null then
    v_resolved_expires_at := v_issued_at + (v_item.default_validity_days || ' days')::interval;
  else
    v_resolved_expires_at := null;
  end if;

  update public.equipment_items
  set available_quantity = available_quantity - target_quantity,
      status = case when tracking_mode = 'serialized' then 'issued'::public.equipment_status else status end,
      updated_by = auth.uid()
  where id = target_item_id;

  insert into public.equipment_assignments (
    company_id, equipment_item_id, tracking_mode, employee_id, quantity, issued_at, expected_return_at, condition_at_issue, note, issued_by, expires_at
  )
  values (
    v_item.company_id, target_item_id, v_item.tracking_mode, target_employee_id, target_quantity, v_issued_at,
    target_expected_return_at, target_condition_at_issue, target_note, auth.uid(), v_resolved_expires_at
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

create or replace function public.return_equipment(
  target_assignment_id uuid,
  target_returned_quantity integer,
  target_condition_at_return public.equipment_condition,
  target_returned_at date default current_date,
  target_note text default null
)
returns public.equipment_assignments
language plpgsql
security definer
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
  if not public.is_equipment_manage_tier(v_item.company_id, v_item.project_id) then
    raise exception 'not authorized to process this return';
  end if;

  v_reusable := target_condition_at_return in ('new', 'good', 'worn');

  v_remaining := v_assignment.quantity - target_returned_quantity;

  update public.equipment_assignments
  set quantity = case when v_remaining > 0 then v_remaining else quantity end,
      status = case when v_remaining = 0 then 'returned'::public.equipment_assignment_status else status end,
      returned_at = case when v_remaining = 0 then coalesce(target_returned_at, current_date) else returned_at end,
      condition_at_return = target_condition_at_return,
      return_note = target_note,
      returned_by = auth.uid()
  where id = target_assignment_id
  returning * into v_assignment;

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
  values (v_item.company_id, v_item.id, 'returned', v_assignment.employee_id, target_returned_quantity, v_item.status::text, target_condition_at_return::text, target_note, auth.uid());

  return v_assignment;
end;
$$;

create or replace function public.mark_equipment_damaged(target_item_id uuid, target_quantity integer, target_note text)
returns public.equipment_items
language plpgsql
security definer
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
  if not public.is_equipment_manage_tier(v_item.company_id, v_item.project_id) then
    raise exception 'not authorized to mark this equipment item damaged';
  end if;
  if target_quantity is null or target_quantity <= 0 or target_quantity > v_item.quantity then
    raise exception 'quantity must be between 1 and %', v_item.quantity;
  end if;
  if v_item.tracking_mode = 'serialized' and target_quantity <> 1 then
    raise exception 'a serialized item is always damaged in quantity 1';
  end if;
  v_from_status := v_item.status::text;

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

create or replace function public.mark_equipment_lost(target_item_id uuid, target_quantity integer, target_note text)
returns public.equipment_items
language plpgsql
security definer
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
  if not public.is_equipment_manage_tier(v_item.company_id, v_item.project_id) then
    raise exception 'not authorized to mark this equipment item lost';
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
    update public.equipment_assignments
    set status = 'lost', condition_at_return = 'damaged', return_note = target_note, returned_by = auth.uid()
    where equipment_item_id = target_item_id and status = 'active';
  end if;

  insert into public.equipment_history (company_id, equipment_item_id, event, quantity, from_status, to_status, note, actor)
  values (v_item.company_id, v_item.id, 'lost', target_quantity, v_from_status, v_item.status::text, target_note, auth.uid());

  return v_item;
end;
$$;

create or replace function public.recover_equipment(target_item_id uuid, target_quantity integer, target_note text)
returns public.equipment_items
language plpgsql
security definer
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
  if not public.is_equipment_manage_tier(v_item.company_id, v_item.project_id) then
    raise exception 'not authorized to recover this equipment item';
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

create or replace function public.set_equipment_out_of_service(target_item_id uuid, target_note text)
returns public.equipment_items
language plpgsql
security definer
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
  if not public.is_equipment_manage_tier(v_item.company_id, v_item.project_id) then
    raise exception 'not authorized to change this equipment item''s status';
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

create or replace function public.retire_equipment_item(target_item_id uuid, target_note text)
returns public.equipment_items
language plpgsql
security definer
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
  if not public.is_equipment_manage_tier(v_item.company_id, v_item.project_id) then
    raise exception 'not authorized to retire this equipment item';
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
