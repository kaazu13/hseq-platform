-- CRITICAL regression, found live immediately after the previous fix in
-- this same session — `create_equipment_item` was mistakenly left off
-- 20260904095000's SECURITY DEFINER conversion list, under the wrong
-- assumption that an INSERT-only function couldn't be affected by Part
-- 28's column-grant split. That's wrong: `returning * into v_row` is
-- itself an implicit read of every inserted column, including the now-
-- restricted quantity/available_quantity/unit_price — so under SECURITY
-- INVOKER this has been failing with "permission denied for table
-- equipment_items" for EVERY caller since 20260904090000 shipped.
-- Confirmed live: creating any new equipment catalog item has been
-- completely broken in the deployed app, not just this fixture script.
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
  target_requestable boolean default true,
  target_purchase_date date default null
)
returns public.equipment_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quantity integer;
  v_row public.equipment_items;
begin
  if not public.is_equipment_catalog_manage_tier(target_company_id, target_project_id) then
    raise exception 'not authorized to add an equipment item';
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

  v_quantity := case when target_tracking_mode = 'serialized' then 1 else greatest(coalesce(target_quantity, 1), 0) end;

  if target_project_id is not null then
    perform public.assert_project_not_archived(target_project_id);
  end if;

  insert into public.equipment_items (
    company_id, project_id, tracking_mode, category, name, description, reference_number,
    manufacturer, model, specification, quantity, available_quantity, condition, location, notes,
    default_validity_days, unit_price, currency, requestable, purchase_date, created_by, updated_by
  )
  values (
    target_company_id, target_project_id, target_tracking_mode, target_category, target_name, target_description, nullif(btrim(coalesce(target_reference_number, '')), ''),
    target_manufacturer, target_model, target_specification, v_quantity, v_quantity, coalesce(target_condition, 'new'), target_location, target_notes,
    target_default_validity_days, target_unit_price, coalesce(nullif(btrim(coalesce(target_currency, '')), ''), 'EUR'), coalesce(target_requestable, true), target_purchase_date, auth.uid(), auth.uid()
  )
  returning * into v_row;

  insert into public.equipment_history (company_id, equipment_item_id, event, quantity, to_status, actor)
  values (target_company_id, v_row.id, 'added', v_quantity, v_row.status::text, auth.uid());

  return v_row;
end;
$$;
