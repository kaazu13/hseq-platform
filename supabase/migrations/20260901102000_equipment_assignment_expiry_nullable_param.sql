-- Forward-only follow-up to 20260901101000_equipment_validity_rpcs.sql
-- (never edit an already-applied migration): update_equipment_assignment_expiry's
-- target_expires_at param had no `default null`, so Postgres/PostgREST's
-- introspection typed it as a required, non-nullable `string` — but the
-- whole point of this RPC is that passing SQL NULL removes an assignment's
-- expiry (Part 7's "remove expiry where allowed"). Adding `default null`
-- makes the generated TypeScript arg type `string | null | undefined`,
-- matching what the function actually needs to accept. No behavior change
-- — the function body already treated a null target_expires_at as "clear
-- the expiry" correctly.
create or replace function public.update_equipment_assignment_expiry(
  target_assignment_id uuid,
  target_expires_at date default null,
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

revoke all on function public.update_equipment_assignment_expiry(uuid, date, text) from public, anon;
grant execute on function public.update_equipment_assignment_expiry(uuid, date, text) to authenticated;
