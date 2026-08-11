-- Product Integration / Daily UX milestone, Phase 6 (Notification Center).
--
-- resolve_worked_hours_discrepancy() (20260813090000_worked_hours.sql) never
-- notified the reporting employee itself — only an ACCEPT with a resulting
-- hours change indirectly notified them via upsert_worked_hours()'s own
-- 'worked_hours_corrected' insert. A REJECT, or an ACCEPT with no hours
-- change, left the employee with no signal their report was ever looked at.
-- This adds a dedicated, unconditional 'worked_hours_discrepancy_resolved'
-- notification — distinct from 'worked_hours_corrected', since "your report
-- was resolved" and "your hours were corrected" are two different facts
-- that can occur independently or together (see this session's Phase 6
-- report for the full reasoning).
--
-- create or replace, never editing the already-applied migration.
create or replace function public.resolve_worked_hours_discrepancy(
  target_discrepancy_id uuid,
  target_status public.worked_hours_discrepancy_status,
  target_resolution_note text,
  target_resulting_hours numeric default null
)
returns public.worked_hours_discrepancies
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_discrepancy public.worked_hours_discrepancies;
  v_result public.worked_hours_discrepancies;
  v_recipient_user_id uuid;
begin
  if target_status not in ('accepted', 'rejected') then
    raise exception 'a discrepancy can only be resolved as accepted or rejected';
  end if;
  if target_resolution_note is null or btrim(target_resolution_note) = '' then
    raise exception 'a resolution note is required';
  end if;

  select * into v_discrepancy from public.worked_hours_discrepancies where id = target_discrepancy_id and status = 'open';
  if v_discrepancy.id is null then
    raise exception 'open worked hours discrepancy % not found', target_discrepancy_id;
  end if;

  if target_status = 'accepted' and target_resulting_hours is not null then
    perform public.upsert_worked_hours(
      v_discrepancy.project_id,
      v_discrepancy.employee_id,
      (select work_date from public.worked_hours where id = v_discrepancy.worked_hours_id),
      target_resulting_hours,
      null,
      format('Accepted discrepancy report: %s', target_resolution_note)
    );
  end if;

  update public.worked_hours_discrepancies
  set status = target_status, resolved_by = auth.uid(), resolved_at = now(), resolution_note = target_resolution_note,
      resulting_hours = case when target_status = 'accepted' then target_resulting_hours else null end
  where id = target_discrepancy_id
  returning * into v_result;

  select e.profile_id into v_recipient_user_id from public.employees e where e.id = v_discrepancy.employee_id;
  if v_recipient_user_id is not null then
    insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
    values (
      v_discrepancy.company_id,
      v_recipient_user_id,
      'worked_hours_discrepancy_resolved',
      case when target_status = 'accepted' then 'Discrepancy report accepted' else 'Discrepancy report rejected' end,
      target_resolution_note,
      '/my-hours'
    );
  end if;

  return v_result;
end;
$$;

comment on function public.resolve_worked_hours_discrepancy(uuid, public.worked_hours_discrepancy_status, text, numeric) is
  'PM/Admin "[ accept / reject ]" review of an employee-reported discrepancy (modules/worked-hours/actions.ts). Accepting with a target_resulting_hours value applies the correction via upsert_worked_hours() itself (same audit trail/notification any other correction gets), then resolves the discrepancy row and ALWAYS notifies the reporting employee (worked_hours_discrepancy_resolved) regardless of accept/reject or whether hours changed. RLS on worked_hours_discrepancies is the real write gate.';

revoke all on function public.resolve_worked_hours_discrepancy(uuid, public.worked_hours_discrepancy_status, text, numeric) from public, anon;
grant execute on function public.resolve_worked_hours_discrepancy(uuid, public.worked_hours_discrepancy_status, text, numeric) to authenticated;
