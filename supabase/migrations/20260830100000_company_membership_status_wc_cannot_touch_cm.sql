-- Operational audit finding (permission-matrix gap): docs/
-- ROLES_AND_PERMISSIONS.md §2/footnote 14, and the working RLS policies
-- membership_roles_insert_managers/_delete_managers that implement it,
-- establish one explicit "lower role cannot touch higher role" rule in
-- this schema: a Workforce Coordinator (operations_manager) acting alone
-- (without also holding Company Manager/company_admin — the union rule
-- means holding both grants Company Manager's unrestricted ability) can
-- never assign or remove a company_admin role via membership_roles.
--
-- validate_company_membership_update() (20260804091000_organization_
-- membership_status_management.sql, renamed by 20260806090000) governs a
-- DIFFERENT, coarser action — suspending/reactivating/removing a whole
-- company_memberships row's status, which is strictly MORE consequential
-- than removing one role (it locks the person out of the company
-- entirely, not just one capability). That trigger only ever guards
-- self-lockout and the company's last active company_admin — it never
-- restricts WHO may change a company_admin-held membership's status, and
-- company_memberships_update_managers' RLS grants operations_manager the
-- exact same UPDATE reach as company_admin. So a "pure" operations_manager
-- (no company_admin role themselves) could suspend/remove a fellow
-- company_admin's membership outright (as long as at least one other
-- active company_admin remained) — a strictly more powerful action than
-- the one already explicitly forbidden at the role-assignment layer, and
-- left unrestricted only because this migration predates and never
-- cross-referenced that established precedent. Live-confirmed: granting
-- a second company_admin (so the last-admin guard would not itself
-- block it) then acting as a plain operations_manager, a direct PATCH
-- suspending that company_admin's company_memberships row succeeded
-- (HTTP 200, status actually changed to 'suspended').
--
-- Fix: extend validate_company_membership_update() with the same
-- "operations_manager acting alone may never touch a company_admin"
-- restriction membership_roles_delete_managers already enforces,
-- checked the same way (does the ACTOR themselves also hold
-- company_admin in this company — if so, the union rule means they are
-- unrestricted, same as everywhere else in this schema).
create or replace function public.validate_company_membership_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_is_company_admin boolean;
  v_remaining_active_admins int;
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
    or new.invited_at is distinct from old.invited_at
    or new.joined_at is distinct from old.joined_at then
    raise exception 'company membership identity/history fields cannot be changed';
  end if;

  if new.status is distinct from old.status then
    if old.user_id = auth.uid() then
      raise exception 'you cannot change your own membership status';
    end if;

    select exists (
      select 1 from public.membership_roles mr
      join public.roles r on r.id = mr.role_id
      where mr.membership_id = old.id and r.name = 'company_admin'
    ) into v_is_company_admin;

    -- NEW: mirrors membership_roles_delete_managers' exact restriction —
    -- an operations_manager acting WITHOUT also holding company_admin
    -- themselves may never change a company_admin-held membership's
    -- status (activate, suspend, or remove alike; not only the
    -- suspend/remove direction — the role-assignment precedent this
    -- mirrors is symmetric too). A caller who also holds company_admin
    -- is unrestricted here via the ordinary role-union rule.
    if v_is_company_admin and not public.has_company_role(old.company_id, 'company_admin') then
      raise exception 'only a Company Manager may change another Company Manager''s membership status';
    end if;

    if old.status = 'active' and new.status <> 'active' then
      if v_is_company_admin then
        select count(*) into v_remaining_active_admins
        from public.membership_roles mr
        join public.roles r on r.id = mr.role_id
        join public.company_memberships m on m.id = mr.membership_id
        where mr.company_id = old.company_id
          and r.name = 'company_admin'
          and m.status = 'active'
          and m.id <> old.id;

        if v_remaining_active_admins = 0 then
          raise exception 'cannot change status — this is the company''s last active company_admin membership';
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.validate_company_membership_update() is
  'company_admin/operations_manager may change a membership''s status (activate/suspend/remove) per company_memberships_update_managers RLS. This trigger narrows that: (1) no self-lockout, (2) an operations_manager acting alone (without also holding company_admin) can never change a company_admin-held membership''s status at all — mirrors membership_roles_insert_managers/_delete_managers'' identical "WC can never touch a CM" rule, extended from role assignment to membership status since the latter is strictly more consequential, (3) a company''s last active company_admin membership cannot be deactivated by anyone.';
