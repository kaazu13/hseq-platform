-- Second Employee-role correction pass, Part 7 (continued) — RPCs that
-- resolve/adjust equipment_assignments.expires_at, referencing the new
-- equipment_history_event value 'expiry_updated' added in the previous
-- migration (can't be used in that same transaction — see this repo's
-- established 20260727090000_employment_periods.sql precedent).

-- ============================================================================
-- 1) create_equipment_item / update_equipment_item — accept the item's
--    optional default_validity_days.
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
  target_default_validity_days integer default null
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

  v_quantity := case when target_tracking_mode = 'serialized' then 1 else greatest(coalesce(target_quantity, 1), 0) end;

  if target_project_id is not null then
    perform public.assert_project_not_archived(target_project_id);
  end if;

  insert into public.equipment_items (
    company_id, project_id, tracking_mode, category, name, description, reference_number,
    manufacturer, model, specification, quantity, available_quantity, condition, location, notes, default_validity_days, created_by, updated_by
  )
  values (
    target_company_id, target_project_id, target_tracking_mode, target_category, target_name, target_description, nullif(btrim(coalesce(target_reference_number, '')), ''),
    target_manufacturer, target_model, target_specification, v_quantity, v_quantity, coalesce(target_condition, 'new'), target_location, target_notes, target_default_validity_days, auth.uid(), auth.uid()
  )
  returning * into v_row;

  insert into public.equipment_history (company_id, equipment_item_id, event, quantity, to_status, actor)
  values (target_company_id, v_row.id, 'added', v_quantity, v_row.status::text, auth.uid());

  return v_row;
end;
$$;

revoke all on function public.create_equipment_item(uuid, uuid, public.equipment_tracking_mode, text, text, text, text, text, text, text, integer, public.equipment_condition, text, text, integer) from public, anon;
grant execute on function public.create_equipment_item(uuid, uuid, public.equipment_tracking_mode, text, text, text, text, text, text, text, integer, public.equipment_condition, text, text, integer) to authenticated;

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
  target_default_validity_days integer default null
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

  if target_project_id is distinct from v_existing.project_id then
    select exists (select 1 from public.equipment_assignments where equipment_item_id = target_item_id and status = 'active') into v_has_active_assignment;
    if v_has_active_assignment then
      raise exception 'this item has an active assignment — return it before changing its project allocation';
    end if;
    if target_project_id is not null then
      perform public.assert_project_not_archived(target_project_id);
    end if;
  end if;

  -- Deliberately does NOT touch any existing equipment_assignments row —
  -- default_validity_days changing here only affects FUTURE issuances via
  -- issue_equipment(); an already-issued assignment's expires_at stays
  -- exactly as it was resolved at issue time (this migration's explicit,
  -- required invariant).
  update public.equipment_items
  set project_id = target_project_id, category = target_category, name = target_name, description = target_description,
      reference_number = nullif(btrim(coalesce(target_reference_number, '')), ''), manufacturer = target_manufacturer, model = target_model,
      specification = target_specification, location = target_location, notes = target_notes, default_validity_days = target_default_validity_days, updated_by = auth.uid()
  where id = target_item_id
  returning * into v_row;

  insert into public.equipment_history (company_id, equipment_item_id, event, actor)
  values (v_row.company_id, v_row.id, 'edited', auth.uid());

  return v_row;
end;
$$;

revoke all on function public.update_equipment_item(uuid, uuid, text, text, text, text, text, text, text, text, text, integer) from public, anon;
grant execute on function public.update_equipment_item(uuid, uuid, text, text, text, text, text, text, text, text, text, integer) to authenticated;

-- ============================================================================
-- 2) issue_equipment — resolve the effective expiry ONCE, at issue time.
-- ============================================================================
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
security invoker
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

  -- Part 7: resolve the EFFECTIVE expiry once, here, and freeze it on the
  -- assignment row. An explicit target_expires_at always wins (a deliberate
  -- per-issuance override); otherwise, when target_use_default_validity is
  -- true (the default) and the item has a default_validity_days, compute
  -- issued_at + N days. Passing target_use_default_validity = false with no
  -- explicit target_expires_at means "no expiry for this issuance" even if
  -- the item has a default — the one way to deliberately opt an issuance
  -- out of its item's default.
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

comment on function public.issue_equipment(uuid, uuid, integer, public.equipment_condition, date, date, text, uuid, date, boolean) is
  'Item 5, extended by Part 7 (equipment validity): resolves and FREEZES this issuance''s effective expiry (target_expires_at override, or issued_at + the item''s default_validity_days, or null) onto equipment_assignments.expires_at at issue time — never recalculated later from the item''s current default.';

revoke all on function public.issue_equipment(uuid, uuid, integer, public.equipment_condition, date, date, text, uuid, date, boolean) from public, anon;
grant execute on function public.issue_equipment(uuid, uuid, integer, public.equipment_condition, date, date, text, uuid, date, boolean) to authenticated;

-- ============================================================================
-- 3) update_equipment_assignment_expiry — adjust an already-issued
--    assignment's expiry later (accept default at issue time already
--    covers the common case; this is for correcting/overriding/removing
--    it afterward), audited via equipment_history.
-- ============================================================================
create or replace function public.update_equipment_assignment_expiry(
  target_assignment_id uuid,
  target_expires_at date,
  target_reason text default null
)
returns public.equipment_assignments
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_assignment public.equipment_assignments;
  v_item public.equipment_items;
begin
  select * into v_assignment from public.equipment_assignments where id = target_assignment_id for update;
  if v_assignment.id is null then
    raise exception 'equipment assignment % not found', target_assignment_id;
  end if;

  if target_expires_at is not null then
    if target_expires_at < v_assignment.issued_at then
      raise exception 'expiry date cannot be before the issue date';
    end if;
    if (target_expires_at - v_assignment.issued_at) > 36500 then
      raise exception 'expiry date is too far in the future';
    end if;
  end if;

  update public.equipment_assignments
  set expires_at = target_expires_at
  where id = target_assignment_id
  returning * into v_assignment;

  select * into v_item from public.equipment_items where id = v_assignment.equipment_item_id;

  insert into public.equipment_history (company_id, equipment_item_id, employee_id, event, note, actor)
  values (
    v_item.company_id, v_item.id, v_assignment.employee_id, 'expiry_updated',
    coalesce(target_reason, case when target_expires_at is null then 'Expiry removed' else format('Expiry set to %s', to_char(target_expires_at, 'DD Mon YYYY')) end),
    auth.uid()
  );

  return v_assignment;
end;
$$;

comment on function public.update_equipment_assignment_expiry(uuid, date, text) is
  'Part 7: adjusts (or removes, via null) an already-issued assignment''s effective expiry — the only path that ever changes equipment_assignments.expires_at after issue_equipment() first resolved it. RLS (equipment_assignments_update, is_equipment_manage_tier-gated) is the real authorization boundary — an employee can never reach this for their own assignment. Every call is audited via a new equipment_history ''expiry_updated'' row.';

revoke all on function public.update_equipment_assignment_expiry(uuid, date, text) from public, anon;
grant execute on function public.update_equipment_assignment_expiry(uuid, date, text) to authenticated;
