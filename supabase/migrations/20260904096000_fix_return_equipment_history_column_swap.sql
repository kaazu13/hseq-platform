-- Transcription bug in 20260904095000's return_equipment() rewrite —
-- found via live testing immediately after: the equipment_history INSERT
-- swapped the employee_id and event positional arguments ('returned'
-- landed in the employee_id (uuid) column, v_assignment.employee_id
-- landed in the event (enum) column), so every return_equipment() call
-- failed with "invalid input syntax for type uuid: 'returned'". Restores
-- the original, correct argument order — no other logic changed.
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
  values (v_item.company_id, v_item.id, v_assignment.employee_id, 'returned', target_returned_quantity, v_item.status::text, target_condition_at_return::text, target_note, auth.uid());

  return v_assignment;
end;
$$;
