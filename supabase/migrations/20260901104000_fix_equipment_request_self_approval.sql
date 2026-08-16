-- CRITICAL fix, caught by live testing during the second Employee-role
-- correction pass: approve_equipment_request()/deny_equipment_request()/
-- return_equipment_request() are `security invoker` and relied ENTIRELY on
-- equipment_requests_update's RLS policy to gate who may call them. That
-- policy's USING clause is `is_equipment_manage_tier(...) OR (the caller
-- is the request's own employee)` — correct and INTENTIONAL for
-- cancel_equipment_request() (self-cancellation is a deliberate everyday
-- path, see that function's own comment), but RLS has no way to see WHICH
-- new status value an UPDATE is setting — so the same "or it's my own
-- request" branch that legitimately allows self-cancel also let an
-- employee call approve_equipment_request() on their OWN pending request
-- and it would succeed, setting status='approved' with decided_by=
-- themselves. Confirmed live: a plain employee test account successfully
-- self-approved a request before this fix.
--
-- Part 11's explicit requirement — "Employee cannot approve their own or
-- anyone else's request" — was violated. Fix: each decision RPC now
-- explicitly re-checks is_equipment_manage_tier() (or platform_super_admin)
-- itself, the same "RLS is the coarse gate, the RPC has its own real
-- validation" pattern issue_equipment()/return_equipment() already use for
-- their own business rules. cancel_equipment_request() is UNCHANGED — its
-- self-service branch remains intentional and is explicitly NOT part of
-- this fix.
create or replace function public.approve_equipment_request(target_request_id uuid, target_comment text default null)
returns public.equipment_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing public.equipment_requests;
  v_row public.equipment_requests;
begin
  select * into v_existing from public.equipment_requests where id = target_request_id;
  if v_existing.id is null then
    raise exception 'pending equipment request % not found', target_request_id;
  end if;
  if not (public.is_platform_super_admin() or public.is_equipment_manage_tier(v_existing.company_id, v_existing.project_id)) then
    raise exception 'not authorized to approve this equipment request';
  end if;

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

comment on function public.approve_equipment_request(uuid, text) is
  'Fixed for a self-approval gap — explicitly requires is_equipment_manage_tier() (or platform_super_admin) itself, never relying solely on equipment_requests_update RLS (which also legitimately allows the requesting employee to update their OWN row for cancel_equipment_request, a different, intentionally self-service RPC).';

revoke all on function public.approve_equipment_request(uuid, text) from public, anon;
grant execute on function public.approve_equipment_request(uuid, text) to authenticated;

create or replace function public.deny_equipment_request(target_request_id uuid, target_comment text)
returns public.equipment_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing public.equipment_requests;
  v_row public.equipment_requests;
begin
  if target_comment is null or btrim(target_comment) = '' then
    raise exception 'a reason is required to deny an equipment request';
  end if;

  select * into v_existing from public.equipment_requests where id = target_request_id;
  if v_existing.id is null then
    raise exception 'pending equipment request % not found', target_request_id;
  end if;
  if not (public.is_platform_super_admin() or public.is_equipment_manage_tier(v_existing.company_id, v_existing.project_id)) then
    raise exception 'not authorized to deny this equipment request';
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

comment on function public.deny_equipment_request(uuid, text) is
  'Fixed alongside approve_equipment_request() for the same self-approval-adjacent gap — explicit is_equipment_manage_tier() check, never relying solely on equipment_requests_update RLS.';

revoke all on function public.deny_equipment_request(uuid, text) from public, anon;
grant execute on function public.deny_equipment_request(uuid, text) to authenticated;

create or replace function public.return_equipment_request(target_request_id uuid, target_comment text)
returns public.equipment_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing public.equipment_requests;
  v_row public.equipment_requests;
begin
  if target_comment is null or btrim(target_comment) = '' then
    raise exception 'a comment is required to return an equipment request for changes';
  end if;

  select * into v_existing from public.equipment_requests where id = target_request_id;
  if v_existing.id is null then
    raise exception 'pending equipment request % not found', target_request_id;
  end if;
  if not (public.is_platform_super_admin() or public.is_equipment_manage_tier(v_existing.company_id, v_existing.project_id)) then
    raise exception 'not authorized to return this equipment request for changes';
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

comment on function public.return_equipment_request(uuid, text) is
  'Fixed alongside approve_equipment_request() for the same self-approval-adjacent gap — explicit is_equipment_manage_tier() check, never relying solely on equipment_requests_update RLS.';

revoke all on function public.return_equipment_request(uuid, text) from public, anon;
grant execute on function public.return_equipment_request(uuid, text) to authenticated;
