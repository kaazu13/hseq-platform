-- Phase 10's leave export needs to show WHO approved/denied/returned a
-- request ("Decided by") — leave_requests.decided_by is a profiles.id, and
-- profiles_select_own restricts SELECT to `id = auth.uid()`, so no existing
-- RLS-only path can resolve another user's display name (this gap already
-- silently existed for daily_teams.locked_by/daily_attendance_corrections.changed_by
-- too — nothing in this codebase currently resolves those either). Adds one
-- narrow, tenant-scoped SECURITY DEFINER helper, mirroring
-- get_basic_employee_info()'s exact shape/reasoning: the caller must
-- themselves be a member of target_company_id, and only users who are ALSO
-- members of that same company are resolvable — never a cross-tenant name
-- lookup.
create or replace function public.get_basic_profile_info(target_company_id uuid, target_user_ids uuid[])
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.full_name
  from public.profiles p
  join public.company_memberships cm on cm.user_id = p.id
  where p.id = any(target_user_ids)
    and cm.company_id = target_company_id
    and cm.status = 'active'
    and public.is_company_member(target_company_id);
$$;

comment on function public.get_basic_profile_info(uuid, uuid[]) is
  'Resolves display names for a bounded set of user ids WITHIN one company the caller also belongs to — the one sanctioned channel for showing "approved by"/"closed by"/"changed by" names anywhere in the app. Never a general cross-tenant profile lookup: both the caller AND every resolvable id must be active members of target_company_id.';

revoke execute on function public.get_basic_profile_info(uuid, uuid[]) from public, anon;
grant execute on function public.get_basic_profile_info(uuid, uuid[]) to authenticated;
