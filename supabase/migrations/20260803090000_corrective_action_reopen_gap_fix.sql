-- Fix: validate_corrective_action_update() (20260802120000_..._corrective_actions.sql)
-- only recognized "leaving closed/rejected" when new.status was SPECIFICALLY
-- 'open' — both the close-tier-authority check and the mandatory-reason
-- check for reopening were gated on `new.status = 'open'` exactly. That left
-- a real gap: moving a closed/rejected action directly to 'in_progress' or
-- 'awaiting_verification' (skipping 'open') satisfied neither condition, so
-- it bypassed BOTH the authority check (an Employee assignee could do it —
-- their RLS grant doesn't care about the row's prior status) AND the
-- mandatory-reason requirement entirely. Caught by re-reading the trigger
-- before writing tests against it, not by a failing test — fixed here
-- before any test or manual verification could validate the broken
-- behavior.
--
-- Fix: both checks now treat ANY transition away from closed/rejected the
-- same way ("old.status in (closed,rejected) and new.status not in
-- (closed,rejected)"), not just specifically to 'open'. The function body
-- is otherwise unchanged.
create or replace function public.validate_corrective_action_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.observation_id is distinct from old.observation_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'corrective action identity/creation fields cannot be changed';
  end if;

  -- Employee (O¹¹): status progress only, never due_date/priority/
  -- description/responsible_person_id, and never a direct move to
  -- closed/rejected — enforced here since RLS alone can admit the UPDATE
  -- attempt (they may act on their own assigned action) but cannot express
  -- "these specific columns" as cleanly as a trigger comparing OLD/NEW.
  if not (
    public.has_organization_role(new.organization_id, 'hseq_manager')
    or public.is_project_manager(new.project_id)
    or public.has_any_organization_role(new.organization_id, array['hse_officer', 'foreman', 'inspector'])
  ) then
    if new.due_date is distinct from old.due_date
      or new.priority is distinct from old.priority
      or new.description is distinct from old.description
      or new.responsible_person_id is distinct from old.responsible_person_id then
      raise exception 'only a manage-tier role may change a corrective action''s due date, priority, description, or responsible person';
    end if;
    if new.status in ('closed', 'rejected') and old.status not in ('closed', 'rejected') then
      raise exception 'an Employee cannot close or reject a corrective action — see docs/ROLES_AND_PERMISSIONS.md §5 footnote 11';
    end if;
    if old.status in ('closed', 'rejected') and new.status not in ('closed', 'rejected') then
      raise exception 'an Employee cannot reopen a corrective action — see docs/ROLES_AND_PERMISSIONS.md §5 footnote 11';
    end if;
  end if;

  -- Closing (-> closed/rejected) or reopening (closed/rejected -> anything
  -- else) both require the same close-tier authority. "Reopening" means
  -- ANY exit from closed/rejected, not just specifically to 'open' — see
  -- this migration's header comment for the gap this closes.
  if (new.status in ('closed', 'rejected') and old.status not in ('closed', 'rejected'))
    or (old.status in ('closed', 'rejected') and new.status not in ('closed', 'rejected')) then
    if not public.can_close_corrective_action(new.organization_id, new.project_id, new.created_by, new.responsible_person_id) then
      raise exception 'you do not have authority to close, reject, or reopen this corrective action — see docs/ROLES_AND_PERMISSIONS.md §5 footnote 10';
    end if;
  end if;

  if new.status = 'rejected' and old.status <> 'rejected' and (new.reopen_reason is null or btrim(new.reopen_reason) = '') then
    raise exception 'a reason is required when rejecting a corrective action';
  end if;

  if old.status in ('closed', 'rejected') and new.status not in ('closed', 'rejected') and (new.reopen_reason is null or btrim(new.reopen_reason) = '') then
    raise exception 'a reason is required when reopening a corrective action';
  end if;

  return new;
end;
$$;
