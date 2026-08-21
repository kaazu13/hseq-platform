-- Part 25's serialized-item-creation form needs an optional purchase date
-- per unit — no existing column captures this (default_validity_days
-- already covers a per-unit "expiry override", and unit_price already
-- covers a per-unit "price override" — both existing columns, reused as
-- documented in 20260904090000's follow-up TS layer). purchase_date is
-- genuinely new.

alter table public.equipment_items add column purchase_date date;

comment on column public.equipment_items.purchase_date is
  'Optional — when this specific unit/batch was purchased. Display/record-keeping only, never used in any expiry or pricing calculation (equipment_assignments.expires_at and default_validity_days remain the only expiry inputs).';

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

revoke all on function public.create_equipment_item(uuid, uuid, public.equipment_tracking_mode, text, text, text, text, text, text, text, integer, public.equipment_condition, text, text, integer, numeric, text, boolean, date) from public, anon;
grant execute on function public.create_equipment_item(uuid, uuid, public.equipment_tracking_mode, text, text, text, text, text, text, text, integer, public.equipment_condition, text, text, integer, numeric, text, boolean, date) to authenticated;

-- The old 18-arg overload (without target_purchase_date) is no longer
-- reachable from any TS call site after this migration's TS follow-up
-- lands, but Postgres keeps overloaded signatures around until explicitly
-- dropped — drop it so PostgREST's schema cache never has two ambiguous
-- create_equipment_item candidates.
drop function if exists public.create_equipment_item(uuid, uuid, public.equipment_tracking_mode, text, text, text, text, text, text, text, integer, public.equipment_condition, text, text, integer, numeric, text, boolean);

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

revoke all on function public.update_equipment_item(uuid, uuid, text, text, text, text, text, text, text, text, text, integer, numeric, text, boolean, date) from public, anon;
grant execute on function public.update_equipment_item(uuid, uuid, text, text, text, text, text, text, text, text, text, integer, numeric, text, boolean, date) to authenticated;

drop function if exists public.update_equipment_item(uuid, uuid, text, text, text, text, text, text, text, text, text, integer, numeric, text, boolean);

-- purchase_date joins the safe/self-service column grant (record-keeping
-- only, never a stock/pricing secret).
grant select (purchase_date) on public.equipment_items to authenticated;
