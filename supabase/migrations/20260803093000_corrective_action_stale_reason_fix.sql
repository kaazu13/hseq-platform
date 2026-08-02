-- Fix: validate_corrective_action_update()'s reject/reopen reason checks
-- tested only "is reopen_reason null/empty", not "was reopen_reason
-- actually supplied/changed in THIS update." Since a plain SQL UPDATE
-- leaves unspecified columns at their prior value, a caller could reject
-- or reopen an action WITHOUT providing a reason as long as some earlier
-- reopen_reason value happened to still be sitting in the column from a
-- previous cycle — reusing a stale reason instead of being required to
-- give a fresh one for each event. Caught via manual verification (a
-- reopen-with-a-real-reason followed immediately by a reject-with-no-
-- reason succeeded, because the reopen's reason text was still in the
-- column). The real Server Functions (modules/corrective-actions/actions.ts)
-- always pass a validated, non-empty reason on every call, so this was
-- never reachable through the app's own UI — but the database is supposed
-- to be the actual authority here, independent of any particular client's
-- good behavior, so it needed to actually enforce "a reason," not just
-- "a non-empty column."
--
-- Fix: both checks now additionally require new.reopen_reason IS DISTINCT
-- FROM old.reopen_reason — the reason must be freshly supplied in this
-- exact update, not merely present from some earlier one.
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
  -- ANY exit from closed/rejected, not just specifically to 'open'.
  if (new.status in ('closed', 'rejected') and old.status not in ('closed', 'rejected'))
    or (old.status in ('closed', 'rejected') and new.status not in ('closed', 'rejected')) then
    if not public.can_close_corrective_action(new.organization_id, new.project_id, new.created_by, new.responsible_person_id) then
      raise exception 'you do not have authority to close, reject, or reopen this corrective action — see docs/ROLES_AND_PERMISSIONS.md §5 footnote 10';
    end if;
  end if;

  -- Both reject and reopen require a FRESHLY supplied reason — not merely
  -- a non-empty column (see this migration's header comment for the gap
  -- this closes).
  if new.status = 'rejected' and old.status <> 'rejected'
    and (new.reopen_reason is null or btrim(new.reopen_reason) = '' or new.reopen_reason is not distinct from old.reopen_reason) then
    raise exception 'a reason is required when rejecting a corrective action';
  end if;

  if old.status in ('closed', 'rejected') and new.status not in ('closed', 'rejected')
    and (new.reopen_reason is null or btrim(new.reopen_reason) = '' or new.reopen_reason is not distinct from old.reopen_reason) then
    raise exception 'a reason is required when reopening a corrective action';
  end if;

  return new;
end;
$$;
