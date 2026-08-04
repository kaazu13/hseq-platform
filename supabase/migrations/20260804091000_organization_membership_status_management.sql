-- organization_memberships: UPDATE support — previously deferred entirely
-- (only a SELECT grant existed for `authenticated`; see
-- 20260725090900_rls_policies.sql). Needed for the new user-administration
-- page's "activate/suspend membership" action. Mirrors
-- membership_roles_insert_managers/_delete_managers' shape exactly:
--   1. Only company_admin or operations_manager may change a membership's
--      status.
--   2. A membership cannot suspend/remove/change its OWN status through
--      this path — self-lockout prevention, mirroring the existing
--      "you can't archive your own employee record"/"you can't end your
--      own employment" pattern already used in modules/employees/actions.ts.
--   3. The organization's last remaining ACTIVE company_admin membership
--      cannot be suspended/removed — same "preserve at least one
--      company_admin" invariant as membership_roles_delete_managers,
--      applied at the membership level (suspending the membership itself
--      would just as effectively lock everyone out as removing the role
--      would).
-- Column-restricted: only `status`/`updated_by` are writable by
-- `authenticated` — organization_id/user_id/joined_at/invited_at etc.
-- remain locked (identity/history fields).

grant update on public.organization_memberships to authenticated;
revoke update on public.organization_memberships from authenticated;
grant update (status, updated_by) on public.organization_memberships to authenticated;

create policy organization_memberships_update_managers
  on public.organization_memberships
  for update
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
  )
  with check (
    public.is_organization_member(organization_id)
    and public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
  );

comment on policy organization_memberships_update_managers on public.organization_memberships is
  'company_admin/operations_manager may change a membership''s status (activate/suspend/remove). The self-lockout and last-company_admin guards live in validate_organization_membership_update() below, not here — RLS is broad, the trigger narrows, same layering as every other module this session.';

create or replace function public.validate_organization_membership_update()
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
    or new.organization_id is distinct from old.organization_id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
    or new.invited_at is distinct from old.invited_at
    or new.joined_at is distinct from old.joined_at then
    raise exception 'organization membership identity/history fields cannot be changed';
  end if;

  if new.status is distinct from old.status then
    if old.user_id = auth.uid() then
      raise exception 'you cannot change your own membership status';
    end if;

    if old.status = 'active' and new.status <> 'active' then
      select exists (
        select 1 from public.membership_roles mr
        join public.roles r on r.id = mr.role_id
        where mr.membership_id = old.id and r.name = 'company_admin'
      ) into v_is_company_admin;

      if v_is_company_admin then
        select count(*) into v_remaining_active_admins
        from public.membership_roles mr
        join public.roles r on r.id = mr.role_id
        join public.organization_memberships m on m.id = mr.membership_id
        where mr.organization_id = old.organization_id
          and r.name = 'company_admin'
          and m.status = 'active'
          and m.id <> old.id;

        if v_remaining_active_admins = 0 then
          raise exception 'cannot change status — this is the organization''s last active company_admin membership';
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger organization_memberships_validate_update
  before update on public.organization_memberships
  for each row execute function public.validate_organization_membership_update();
