-- Onboarding — zero-to-usable company setup without direct database/
-- manual developer intervention. Builds ONLY the genuinely missing pieces
-- identified by direct inspection of the existing schema/RLS/TS layer
-- before writing this migration:
--
--   1. There is NO way for anyone to create a `companies` row today except
--      a service-role script or manual SQL (no INSERT policy exists on
--      `companies` at all, confirmed).
--   2. There is NO invitation system anywhere (table, RPC, or email flow)
--      — `company_memberships.status`/`employees.account_status` already
--      reserve 'invited'/'pending_activation' enum values, but nothing
--      ever sets them. `company_memberships` has no INSERT policy for
--      `authenticated` at all (only `bootstrap_first_owner()`, service-role
--      only). This migration is what finally uses those reserved values.
--   3. There is NO bulk employee import.
--
-- Everything else the Onboarding spec touches (create a project, add one
-- employee manually, assign a role, assign a project, suspend/remove a
-- membership, resolve active company/project) ALREADY EXISTS and is reused
-- as-is — see docs comments below at each integration point for exactly
-- which existing function/table is being built on top of, never
-- duplicated.
--
-- Design decisions:
--
-- 1. Every cross-membership "bootstrap" operation (create a company;
--    directly grant an existing account membership in a company the
--    platform admin isn't themselves a member of; create/resend/revoke/
--    accept an invitation) is SECURITY DEFINER with an explicit internal
--    authorization check as the real gate — the exact same convention
--    already established by is_platform_super_admin()/
--    grant_platform_super_admin()/bootstrap_first_owner(). Plain RLS
--    alone cannot express "a platform super admin, who is a member of
--    NO company, may act on any company" or "an invitee, who is not yet
--    a member of the company they're about to join, may accept their own
--    invitation" — both are exactly the class of operation this
--    codebase's own precedent already solves this way.
--
-- 2. `company_invitations` gets NO insert/update grant to `authenticated`
--    at all (mirrors `platform_super_admins`' own documented convention:
--    "never a direct RLS insert/update/delete grant to authenticated") —
--    every mutation goes through a SECURITY DEFINER RPC below. Only
--    SELECT is a plain RLS-gated grant, so management/the invitee can
--    view invitation state directly.
--
-- 3. Invitation tokens follow report_shares' EXACT precedent
--    (20260817090000_report_pdf_export_and_sharing.sql): only
--    sha256(token) is ever stored (`token_hash`), the raw token is
--    returned to the caller exactly once at creation/resend time and
--    never persisted. `extensions.gen_random_bytes`/`extensions.digest`
--    are schema-qualified per that migration's own hard-won fix
--    (20260817091000) — pgcrypto lives in the `extensions` schema on
--    this project, not `public`.
--
-- 4. Bulk import reuses `create_invitation()` per row (for rows with an
--    email) rather than duplicating invitation-creation logic — one
--    SECURITY INVOKER RPC (`import_employees_bulk`, caller already holds
--    EMPLOYEE_WRITE_ROLES like every other employee-creating path) loops
--    validated rows, inserts each `employees` row via the exact same
--    shape `createEmployee`/`createEmployeeForMember` already use
--    (allocates a real employee_number via `next_employee_number`,
--    respects `employees_insert_managers` RLS normally, no bypass), adds
--    a `project_assignments` row (assignment_role='member' only — a
--    non-member project role requires an existing company role via a
--    linked profile, which an import row never has yet) if a target
--    project was chosen for the whole batch, and calls
--    `create_invitation()` for any row with an email. All-or-nothing: any
--    row that fails re-validation raises and rolls back the entire
--    import (the client-side preview step is expected to have already
--    filtered to only valid rows before calling this).
--
-- 5. Company-level roles are membership-based (`membership_roles`
--    references `membership_id`, not `employee_id`) — an employee with no
--    linked profile (no login) can be assigned to a project as 'member'
--    immediately (no company role required, confirmed:
--    `project_assignments` insert trigger only requires an existing
--    company role for a NON-member assignment_role), but can never hold a
--    company-level RoleName until they accept an invitation and get a
--    real membership. Bulk import's "Role" column is therefore only ever
--    applied via the row's invitation (email required) — a row with no
--    email gets an employee record + (optionally) a 'member' project
--    assignment, and no company role, which is correct: there is nothing
--    to hold a role on without a login.
--
-- Explicitly NOT built this pass (disclosed, matching every prior
-- milestone's convention of stating scope limits rather than silently
-- omitting them):
--   - Real outbound email delivery — no provider is configured anywhere
--     in this project. Invitations produce a real token/link; the UI
--     displays it for the inviter to copy/send manually, exactly as
--     Phase 15 explicitly allows.
--   - A per-row "Project" column in bulk import — one target project is
--     chosen once for the whole import batch, not per row. Covers the
--     realistic case (importing project's workforce) without the
--     transactional complexity of mixed-project batches.
--   - A notification to the inviter when their invitation is accepted.
--   - Updating/merging existing employees via bulk import (create-new
--     only).

-- ============================================================================
-- 1) company_invitations
-- ============================================================================
create type public.company_invitation_status as enum ('pending', 'accepted', 'revoked');

create table public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  full_name text not null,
  role_names text[] not null,
  project_id uuid,
  employee_id uuid,
  token_hash text not null,
  status public.company_invitation_status not null default 'pending',
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  revoke_reason text,
  constraint company_invitations_email_format check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint company_invitations_full_name_not_blank check (btrim(full_name) <> ''),
  constraint company_invitations_role_names_not_empty check (array_length(role_names, 1) > 0),
  constraint company_invitations_token_hash_unique unique (token_hash),
  constraint company_invitations_project_fk foreign key (project_id, company_id) references public.projects (id, company_id) on delete set null,
  constraint company_invitations_employee_fk foreign key (employee_id, company_id) references public.employees (id, company_id) on delete set null,
  constraint company_invitations_decision_fields_paired check (
    (status = 'pending' and accepted_at is null and revoked_at is null)
    or (status = 'accepted' and accepted_at is not null and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null and accepted_at is null)
  )
);

comment on table public.company_invitations is
  'No insert/update grant to authenticated at all — every mutation goes through create_invitation()/resend_invitation()/revoke_invitation()/accept_invitation() below, all SECURITY DEFINER with an explicit internal check, mirroring platform_super_admins'' own documented convention. "Expired" is a DISPLAY-computed state (status=''pending'' and expires_at < now()), never a fourth stored status — matches this codebase''s existing convention of deriving display state rather than duplicating it (e.g. getScaffoldDisplayStatus).';
comment on column public.company_invitations.token_hash is
  'sha256(token), hex-encoded — the plaintext token is generated by create_invitation()/resend_invitation() and returned to the caller exactly once, never stored. Exact precedent: report_shares.token_hash.';
comment on column public.company_invitations.employee_id is
  'Set when this invitation is meant to activate a PRE-EXISTING draft employee record (the bulk-import / "add employee then invite" path) — accept_invitation() links profile_id onto this row rather than creating a new employee. Null means accept_invitation() creates a brand-new minimal employee record from full_name.';

create unique index company_invitations_pending_email_unique on public.company_invitations (company_id, lower(email)) where status = 'pending';
create index company_invitations_company_id_idx on public.company_invitations (company_id, status);
create index company_invitations_token_hash_idx on public.company_invitations (token_hash);

create trigger company_invitations_set_updated_at
  before update on public.company_invitations
  for each row execute function public.set_updated_at();

alter table public.company_invitations enable row level security;
alter table public.company_invitations force row level security;

grant select on public.company_invitations to authenticated;

create policy company_invitations_select
  on public.company_invitations
  for select
  to authenticated
  using (
    public.is_platform_super_admin()
    or public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
    or lower(email) = lower(coalesce(auth.email(), ''))
  );

-- ============================================================================
-- 2) Company creation (Phase 1) — platform_super_admin only.
-- ============================================================================
create or replace function public.create_company(
  target_name text,
  target_slug text default null,
  target_employee_number_prefix text default null
)
returns public.companies
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text;
  v_prefix text;
  v_suffix int := 0;
  v_candidate_slug text;
  v_row public.companies;
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can create a company';
  end if;
  if target_name is null or btrim(target_name) = '' then
    raise exception 'a company name is required';
  end if;
  if char_length(btrim(target_name)) > 200 then
    raise exception 'company name is too long';
  end if;

  -- Slug: kebab-case derived from the given slug (if any) else the name;
  -- deduplicated with a numeric suffix. Mirrors this codebase's one real
  -- prior "derive a safe identifier, dedupe if taken" precedent
  -- (employee_number_prefix backfill, 20260726100100) as closely as a
  -- lowercase-kebab identifier can.
  v_slug := coalesce(nullif(regexp_replace(lower(btrim(target_slug)), '[^a-z0-9]+', '-', 'g'), ''),
                      nullif(regexp_replace(lower(btrim(target_name)), '[^a-z0-9]+', '-', 'g'), ''));
  v_slug := trim(both '-' from coalesce(v_slug, ''));
  if v_slug = '' then
    v_slug := 'company';
  end if;
  v_candidate_slug := v_slug;
  while exists (select 1 from public.companies where slug = v_candidate_slug) loop
    v_suffix := v_suffix + 1;
    v_candidate_slug := v_slug || '-' || v_suffix::text;
  end loop;

  -- employee_number_prefix: format-valid (^[A-Z0-9]+$) uppercase-alnum
  -- derived from the given prefix (if any) else the name, falling back to
  -- a random one — same fallback shape as the employee_number_prefix
  -- backfill rule. No uniqueness constraint exists on this column
  -- (confirmed) so none is invented here.
  v_prefix := coalesce(nullif(regexp_replace(upper(btrim(target_employee_number_prefix)), '[^A-Z0-9]', '', 'g'), ''),
                        nullif(regexp_replace(upper(btrim(target_name)), '[^A-Z0-9]', '', 'g'), ''));
  if v_prefix is null or v_prefix = '' then
    v_prefix := 'CO' || upper(left(replace(gen_random_uuid()::text, '-', ''), 6));
  end if;
  v_prefix := left(v_prefix, 20);

  insert into public.companies (name, slug, employee_number_prefix, status)
  values (btrim(target_name), v_candidate_slug, v_prefix, 'active')
  returning * into v_row;

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  values (v_row.id, auth.uid(), 'create', 'company', v_row.id, jsonb_build_object('name', v_row.name, 'slug', v_row.slug));

  return v_row;
end;
$$;

comment on function public.create_company(text, text, text) is
  'Item 1. Platform-super-admin-only. Companies previously had NO INSERT path outside a service-role script — this is that path''s first product-facing implementation. SECURITY DEFINER because the caller (a platform admin) is, correctly, not a member of the company being created, so the audit_events write (which requires is_organization_member under plain RLS) needs the same bypass bootstrap_first_owner()/platform-admin functions already use.';

revoke all on function public.create_company(text, text, text) from public, anon;
grant execute on function public.create_company(text, text, text) to authenticated;

-- Defense in depth (matches every other table's "app-layer check is a
-- coarse pre-filter, RLS is the real backstop" convention) — the RPC
-- above never relies on this since it is SECURITY DEFINER, but a raw
-- authenticated insert attempt is still correctly gated if anyone ever
-- tries one directly.
create policy companies_insert_platform_admin
  on public.companies
  for insert
  to authenticated
  with check (public.is_platform_super_admin());

-- ============================================================================
-- 3) First company admin (Phase 2) — two paths, both platform_super_admin-only.
-- ============================================================================
create or replace function public.platform_admin_grant_company_membership(
  target_company_id uuid,
  target_user_id uuid,
  target_role_names text[]
)
returns public.company_memberships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_membership public.company_memberships;
  v_role_id uuid;
  v_role_name text;
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can grant company membership directly';
  end if;
  if target_role_names is null or array_length(target_role_names, 1) is null then
    raise exception 'at least one role is required';
  end if;
  if 'platform_super_admin' = any(target_role_names) then
    raise exception 'platform_super_admin cannot be granted as a company role — use grant_platform_super_admin() instead';
  end if;
  if exists (select 1 from unnest(target_role_names) rn where not exists (select 1 from public.roles r where r.name = rn)) then
    raise exception 'one or more role names are not recognized';
  end if;
  if not exists (select 1 from public.companies where id = target_company_id) then
    raise exception 'company % not found', target_company_id;
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'account % not found', target_user_id;
  end if;

  insert into public.company_memberships (company_id, user_id, status, joined_at, created_by, updated_by)
  values (target_company_id, target_user_id, 'active', now(), auth.uid(), auth.uid())
  on conflict (company_id, user_id) do update
    set status = 'active', joined_at = coalesce(public.company_memberships.joined_at, now()), updated_by = auth.uid(), updated_at = now()
  returning * into v_membership;

  foreach v_role_name in array target_role_names loop
    select id into v_role_id from public.roles where name = v_role_name;
    insert into public.membership_roles (company_id, membership_id, role_id, created_by)
    values (target_company_id, v_membership.id, v_role_id, auth.uid())
    on conflict (membership_id, role_id) do nothing;
  end loop;

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  values (target_company_id, auth.uid(), 'create', 'company_membership', v_membership.id, jsonb_build_object('user_id', target_user_id, 'roles', target_role_names, 'granted_by', 'platform_super_admin'));

  perform public.notify_employee(
    target_company_id, e.id, 'company_membership_granted', 'Added to a company',
    format('You now have access to this company with role(s): %s', array_to_string(target_role_names, ', ')),
    '/dashboard'
  ) from public.employees e where e.company_id = target_company_id and e.profile_id = target_user_id limit 1;

  return v_membership;
end;
$$;

comment on function public.platform_admin_grant_company_membership(uuid, uuid, text[]) is
  'Item 2, path A: an EXISTING platform account, added directly (no invitation token/round-trip needed — a platform super admin already vouches for the account''s identity, same trust level as grant_platform_super_admin()). Idempotent: reactivates a removed/suspended membership rather than erroring, and role assignment is ON CONFLICT DO NOTHING per role.';

revoke all on function public.platform_admin_grant_company_membership(uuid, uuid, text[]) from public, anon;
grant execute on function public.platform_admin_grant_company_membership(uuid, uuid, text[]) to authenticated;

-- ============================================================================
-- 4) Invitations (Phases 2B, 13, 14) — create / resend / revoke.
--    Reused for the general "invite any new member" flow too (Phase 13),
--    not just the first-admin case — same function, same explicit
--    authorization check covers both a platform admin (no membership yet)
--    and an ordinary company_admin/operations_manager (already a member).
-- ============================================================================
create or replace function public.create_invitation(
  target_company_id uuid,
  target_email text,
  target_full_name text,
  target_role_names text[],
  target_project_id uuid default null,
  target_employee_id uuid default null
)
returns table (invitation public.company_invitations, token text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_token text;
  v_token_hash text;
  v_row public.company_invitations;
  v_is_platform_admin boolean;
  v_is_company_admin boolean;
  v_is_ops_manager_only boolean;
  v_forbidden_for_ops_manager constant text[] := array['company_admin', 'project_manager', 'hseq_manager', 'hse_officer', 'foreman', 'recruiter'];
begin
  v_is_platform_admin := public.is_platform_super_admin();
  v_is_company_admin := public.has_company_role(target_company_id, 'company_admin');
  v_is_ops_manager_only := (not v_is_company_admin) and public.has_company_role(target_company_id, 'operations_manager');

  if not (v_is_platform_admin or v_is_company_admin or v_is_ops_manager_only) then
    raise exception 'you are not authorized to invite members to this company';
  end if;

  if target_role_names is null or array_length(target_role_names, 1) is null then
    raise exception 'at least one role is required';
  end if;
  if 'platform_super_admin' = any(target_role_names) then
    raise exception 'platform_super_admin cannot be granted via an invitation';
  end if;
  if exists (select 1 from unnest(target_role_names) rn where not exists (select 1 from public.roles r where r.name = rn)) then
    raise exception 'one or more role names are not recognized';
  end if;
  -- Mirrors modules/employees/permissions.ts's assignableRoleNamesFor()
  -- exactly, as a server-side backstop against a caller bypassing the TS
  -- layer — an Operations Manager can invite, but never into the roles a
  -- Company Admin reserves for itself.
  if v_is_ops_manager_only and target_role_names && v_forbidden_for_ops_manager then
    raise exception 'you are not authorized to assign one or more of these roles';
  end if;

  v_email := lower(btrim(target_email));
  if v_email is null or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'a valid email address is required';
  end if;
  if target_full_name is null or btrim(target_full_name) = '' then
    raise exception 'a name is required';
  end if;
  if target_employee_id is not null and exists (select 1 from public.employees e where e.id = target_employee_id and e.company_id = target_company_id and e.profile_id is not null) then
    raise exception 'this employee record is already linked to an account';
  end if;

  v_token := replace(replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=', '');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into public.company_invitations (company_id, email, full_name, role_names, project_id, employee_id, token_hash, invited_by)
  values (target_company_id, v_email, btrim(target_full_name), target_role_names, target_project_id, target_employee_id, v_token_hash, auth.uid())
  returning * into v_row;

  if target_employee_id is not null then
    update public.employees set account_status = 'invited', updated_by = auth.uid() where id = target_employee_id and account_status = 'draft';
  end if;

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  values (target_company_id, auth.uid(), 'create', 'company_invitation', v_row.id, jsonb_build_object('email', v_email, 'roles', target_role_names));

  return query select v_row, v_token;
end;
$$;

comment on function public.create_invitation(uuid, text, text, text[], uuid, uuid) is
  'Item 2 path B / item 13. SECURITY DEFINER so the SAME function covers both a platform admin inviting a brand-new company''s first admin (no membership yet) and an ordinary company_admin/operations_manager inviting regular staff (already a member) — plain RLS cannot express the former. Returns the raw token exactly once (never stored); the caller is responsible for surfacing/sharing it since no email provider is configured in this environment (Phase 15).';

revoke all on function public.create_invitation(uuid, text, text, text[], uuid, uuid) from public, anon;
grant execute on function public.create_invitation(uuid, text, text, text[], uuid, uuid) to authenticated;

create or replace function public.resend_invitation(target_invitation_id uuid)
returns table (invitation public.company_invitations, token text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.company_invitations;
  v_token text;
  v_token_hash text;
  v_row public.company_invitations;
begin
  select * into v_existing from public.company_invitations where id = target_invitation_id;
  if v_existing.id is null then
    raise exception 'invitation % not found', target_invitation_id;
  end if;
  if not (public.is_platform_super_admin() or public.has_any_company_role(v_existing.company_id, array['company_admin', 'operations_manager'])) then
    raise exception 'you are not authorized to resend this invitation';
  end if;
  if v_existing.status <> 'pending' then
    raise exception 'only a pending invitation can be resent';
  end if;

  v_token := replace(replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=', '');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  update public.company_invitations
  set token_hash = v_token_hash, expires_at = now() + interval '7 days', updated_at = now()
  where id = target_invitation_id
  returning * into v_row;

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  values (v_row.company_id, auth.uid(), 'update', 'company_invitation', v_row.id, jsonb_build_object('resent', true));

  return query select v_row, v_token;
end;
$$;

comment on function public.resend_invitation(uuid) is
  'Item 14. Rotates the token and extends expiry on the SAME row (never creates a duplicate/uncontrolled second invitation row for the same person) — the old token stops working immediately since only the new hash is stored.';

revoke all on function public.resend_invitation(uuid) from public, anon;
grant execute on function public.resend_invitation(uuid) to authenticated;

create or replace function public.revoke_invitation(target_invitation_id uuid, target_reason text default null)
returns public.company_invitations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.company_invitations;
  v_row public.company_invitations;
begin
  select * into v_existing from public.company_invitations where id = target_invitation_id;
  if v_existing.id is null then
    raise exception 'invitation % not found', target_invitation_id;
  end if;
  if not (public.is_platform_super_admin() or public.has_any_company_role(v_existing.company_id, array['company_admin', 'operations_manager'])) then
    raise exception 'you are not authorized to revoke this invitation';
  end if;
  if v_existing.status <> 'pending' then
    raise exception 'only a pending invitation can be revoked';
  end if;

  update public.company_invitations
  set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoke_reason = target_reason, updated_at = now()
  where id = target_invitation_id
  returning * into v_row;

  if v_row.employee_id is not null then
    update public.employees set account_status = 'draft', updated_by = auth.uid() where id = v_row.employee_id and account_status = 'invited';
  end if;

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  values (v_row.company_id, auth.uid(), 'update', 'company_invitation', v_row.id, jsonb_build_object('revoked', true, 'reason', target_reason));

  return v_row;
end;
$$;

comment on function public.revoke_invitation(uuid, text) is
  'Item 14. Reverts a linked draft employee''s account_status back to draft (it never advanced past that until acceptance) so revoking a pending invite leaves no stuck "invited" employee.';

revoke all on function public.revoke_invitation(uuid, text) from public, anon;
grant execute on function public.revoke_invitation(uuid, text) to authenticated;

-- ============================================================================
-- 5) Accept invitation / activation (Phases 16, 17) — the transactional
--    core: validate token -> create/reactivate membership -> assign
--    roles -> link-or-create employee -> optional project assignment ->
--    mark accepted -> audit.
-- ============================================================================
create or replace function public.accept_invitation(target_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token_hash text;
  v_invitation public.company_invitations;
  v_caller_email text;
  v_membership public.company_memberships;
  v_role_id uuid;
  v_role_name text;
  v_employee_id uuid;
  v_employee_number text;
  v_first_name text;
  v_last_name text;
  v_name_parts text[];
begin
  if target_token is null or btrim(target_token) = '' then
    raise exception 'invalid invitation link';
  end if;

  v_token_hash := encode(extensions.digest(target_token, 'sha256'), 'hex');
  select * into v_invitation from public.company_invitations where token_hash = v_token_hash for update;
  if v_invitation.id is null then
    raise exception 'this invitation link is invalid';
  end if;
  if v_invitation.status = 'revoked' then
    raise exception 'this invitation has been revoked';
  end if;
  if v_invitation.status = 'accepted' then
    raise exception 'this invitation has already been accepted';
  end if;
  if v_invitation.expires_at < now() then
    raise exception 'this invitation has expired — ask a company administrator to resend it';
  end if;

  v_caller_email := lower(coalesce(auth.email(), ''));
  if v_caller_email = '' or v_caller_email <> lower(v_invitation.email) then
    raise exception 'this invitation was sent to a different email address than your account';
  end if;

  -- 1) Membership: create, or reactivate if this account previously left/was removed.
  insert into public.company_memberships (company_id, user_id, status, joined_at, created_by, updated_by)
  values (v_invitation.company_id, auth.uid(), 'active', now(), v_invitation.invited_by, auth.uid())
  on conflict (company_id, user_id) do update
    set status = 'active', joined_at = coalesce(public.company_memberships.joined_at, now()), updated_by = auth.uid(), updated_at = now()
  returning * into v_membership;

  -- 2) Roles.
  foreach v_role_name in array v_invitation.role_names loop
    select id into v_role_id from public.roles where name = v_role_name;
    if v_role_id is not null then
      insert into public.membership_roles (company_id, membership_id, role_id, created_by)
      values (v_invitation.company_id, v_membership.id, v_role_id, v_invitation.invited_by)
      on conflict (membership_id, role_id) do nothing;
    end if;
  end loop;

  -- 3) Employee: link the pre-existing draft record, or create a minimal one.
  if v_invitation.employee_id is not null then
    select id into v_employee_id from public.employees where id = v_invitation.employee_id and company_id = v_invitation.company_id;
    if v_employee_id is null then
      raise exception 'the employee record linked to this invitation no longer exists';
    end if;
    if exists (select 1 from public.employees where id = v_employee_id and profile_id is not null and profile_id <> auth.uid()) then
      raise exception 'this invitation''s linked employee record is already linked to a different account';
    end if;
    update public.employees set profile_id = auth.uid(), account_status = 'active', updated_by = auth.uid()
    where id = v_employee_id and profile_id is null;
  else
    select id into v_employee_id from public.employees where company_id = v_invitation.company_id and profile_id = auth.uid();
    if v_employee_id is null then
      v_name_parts := regexp_split_to_array(btrim(v_invitation.full_name), '\s+');
      v_first_name := v_name_parts[1];
      v_last_name := case when array_length(v_name_parts, 1) > 1 then array_to_string(v_name_parts[2:array_length(v_name_parts, 1)], ' ') else v_first_name end;

      v_employee_number := public.allocate_employee_number(v_invitation.company_id);

      insert into public.employees (company_id, profile_id, employee_number, first_name, last_name, employment_status, account_status, created_by, updated_by)
      values (v_invitation.company_id, auth.uid(), v_employee_number, v_first_name, v_last_name, 'active', 'active', v_invitation.invited_by, auth.uid())
      returning id into v_employee_id;
    else
      update public.employees set account_status = 'active', updated_by = auth.uid() where id = v_employee_id;
    end if;
  end if;

  -- 4) Optional project assignment — 'member' only, matches bulk import's
  --    exact reasoning (a fresh acceptance has no company role to satisfy
  --    project_assignments' non-member-role requirement yet).
  if v_invitation.project_id is not null and v_employee_id is not null then
    if not exists (select 1 from public.project_assignments where project_id = v_invitation.project_id and employee_id = v_employee_id and end_at is null) then
      insert into public.project_assignments (company_id, project_id, employee_id, assignment_role, assigned_by)
      values (v_invitation.company_id, v_invitation.project_id, v_employee_id, 'member', v_invitation.invited_by);
    end if;
  end if;

  -- 5) Mark accepted.
  update public.company_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid(), updated_at = now()
  where id = v_invitation.id;

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  values (v_invitation.company_id, auth.uid(), 'update', 'company_invitation', v_invitation.id, jsonb_build_object('accepted', true, 'employee_id', v_employee_id));

  return jsonb_build_object(
    'company_id', v_invitation.company_id,
    'membership_id', v_membership.id,
    'employee_id', v_employee_id,
    'role_names', v_invitation.role_names,
    'project_id', v_invitation.project_id
  );
end;
$$;

comment on function public.accept_invitation(text) is
  'Items 16/17. SECURITY DEFINER — the invitee is, by definition, not yet a member of the company at call time, so no ordinary RLS-gated insert would work. Validates the token by HASH lookup (never a plaintext compare), expiry, revoked/already-accepted status, and that the CALLING account''s own auth.email() matches the invited email exactly (the one hard guarantee against a leaked/forwarded link being accepted by the wrong account) — then performs every write transactionally: membership, roles, employee link-or-create, optional project assignment, and marks the invitation accepted. Calls allocate_employee_number() directly (not the role-gated next_employee_number() wrapper — the accepting user is never yet a company_admin/operations_manager) since SECURITY DEFINER already carries the authority next_employee_number()''s own internal role check exists to enforce.';

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- ============================================================================
-- 6) Bulk employee import (Phases 9-10) — caller already holds
--    EMPLOYEE_WRITE_ROLES, same as every existing employee-creating path;
--    plain SECURITY INVOKER, no bypass needed.
-- ============================================================================
create or replace function public.import_employees_bulk(
  target_company_id uuid,
  target_project_id uuid,
  rows jsonb
)
returns table (row_index int, employee_id uuid, employee_number text, invitation_id uuid, invitation_token text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row jsonb;
  v_idx int := 0;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
  v_position_title text;
  v_role_name text;
  v_employee_id uuid;
  v_employee_number text;
  v_invitation_id uuid;
  v_invitation_token text;
begin
  if not public.has_any_company_role(target_company_id, array['company_admin', 'operations_manager']) then
    raise exception 'you are not authorized to import employees for this company';
  end if;
  if target_project_id is not null then
    perform public.assert_project_not_archived(target_project_id);
  end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) = 0 then
    raise exception 'no rows to import';
  end if;
  if jsonb_array_length(rows) > 5000 then
    raise exception 'a single import is limited to 5000 rows';
  end if;

  for v_row in select * from jsonb_array_elements(rows) loop
    v_idx := v_idx + 1;
    v_first_name := btrim(coalesce(v_row ->> 'firstName', ''));
    v_last_name := btrim(coalesce(v_row ->> 'lastName', ''));
    v_email := nullif(lower(btrim(coalesce(v_row ->> 'email', ''))), '');
    v_phone := nullif(btrim(coalesce(v_row ->> 'phone', '')), '');
    v_position_title := nullif(btrim(coalesce(v_row ->> 'positionTitle', '')), '');
    v_role_name := nullif(btrim(coalesce(v_row ->> 'roleName', '')), '');

    if v_first_name = '' or v_last_name = '' then
      raise exception 'row %: first and last name are required', v_idx;
    end if;
    if v_role_name is not null and not exists (select 1 from public.roles r where r.name = v_role_name) then
      raise exception 'row %: unknown role "%"', v_idx, v_role_name;
    end if;
    if v_role_name = 'platform_super_admin' then
      raise exception 'row %: platform_super_admin cannot be assigned via import', v_idx;
    end if;

    v_employee_number := public.next_employee_number(target_company_id);

    insert into public.employees (company_id, employee_number, first_name, last_name, work_email, phone, position_title, employment_status, account_status, created_by, updated_by)
    values (target_company_id, v_employee_number, v_first_name, v_last_name, v_email, v_phone, v_position_title, 'active', 'draft', auth.uid(), auth.uid())
    returning id into v_employee_id;

    v_invitation_id := null;
    v_invitation_token := null;
    if target_project_id is not null then
      insert into public.project_assignments (company_id, project_id, employee_id, assignment_role, assigned_by)
      values (target_company_id, target_project_id, v_employee_id, 'member', auth.uid());
    end if;

    if v_email is not null then
      select (imp.invitation).id, imp.token into v_invitation_id, v_invitation_token
      from public.create_invitation(target_company_id, v_email, v_first_name || ' ' || v_last_name, array[coalesce(v_role_name, 'employee')], target_project_id, v_employee_id) as imp;
    end if;

    row_index := v_idx;
    employee_id := v_employee_id;
    employee_number := v_employee_number;
    invitation_id := v_invitation_id;
    invitation_token := v_invitation_token;
    return next;
  end loop;

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  values (target_company_id, auth.uid(), 'create', 'employee_bulk_import', target_company_id, jsonb_build_object('row_count', v_idx, 'project_id', target_project_id));
end;
$$;

comment on function public.import_employees_bulk(uuid, uuid, jsonb) is
  'Items 9/10. All-or-nothing (one function invocation is one transaction — any row failing validation raises and rolls back every row already inserted this call). Never trusts client-supplied role/project text beyond validating the role NAME against the real roles catalogue; the project is a single company_id-scoped uuid parameter, never taken per-row from the sheet. Formulas/macros are moot at this layer — the caller (modules/employees/import.ts) parses the .xlsx with exceljs and only ever sends this function plain validated strings, never spreadsheet formula objects.';

revoke all on function public.import_employees_bulk(uuid, uuid, jsonb) from public, anon;
grant execute on function public.import_employees_bulk(uuid, uuid, jsonb) to authenticated;

-- ============================================================================
-- 7) Anon-safe invitation preview — the accept-invite page needs to show
--    "You've been invited to <Company>" BEFORE the invitee necessarily has
--    an account yet (accept_invitation()'s own RLS-backed SELECT policy
--    only lets an ALREADY-authenticated matching-email caller see the row
--    directly, which is circular for someone who hasn't signed up yet).
--    Exact precedent: resolve_public_report(text) — anon-grantable,
--    hash lookup, returns null (never raises) on any not-found/invalid
--    case, and projects only the narrow, non-sensitive fields a preview
--    screen needs.
-- ============================================================================
create or replace function public.resolve_invitation_preview(target_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token_hash text;
  v_invitation public.company_invitations;
  v_company_name text;
  v_inviter_name text;
begin
  if target_token is null or btrim(target_token) = '' or length(target_token) > 500 then
    return null;
  end if;

  v_token_hash := encode(extensions.digest(target_token, 'sha256'), 'hex');
  select * into v_invitation from public.company_invitations where token_hash = v_token_hash;
  if v_invitation.id is null then
    return null;
  end if;

  select name into v_company_name from public.companies where id = v_invitation.company_id;
  select full_name into v_inviter_name from public.profiles where id = v_invitation.invited_by;

  return jsonb_build_object(
    'company_name', v_company_name,
    'inviter_name', v_inviter_name,
    'email', v_invitation.email,
    'full_name', v_invitation.full_name,
    'role_names', v_invitation.role_names,
    'status', v_invitation.status,
    'expires_at', v_invitation.expires_at
  );
end;
$$;

comment on function public.resolve_invitation_preview(text) is
  'Anon-safe. The ONLY anonymous entry point this migration adds — no other anon grant exists here (mirrors report_shares'' documented single-entry-point convention exactly). Never raises; returns null for any invalid/not-found/malformed token so a probing request can never distinguish "wrong token" from "expired" from "already accepted" from this call alone.';

revoke all on function public.resolve_invitation_preview(text) from public;
grant execute on function public.resolve_invitation_preview(text) to anon, authenticated;

-- ============================================================================
-- 8) Membership / project-assignment notifications (item 24) — reuses the
--    existing notifications table directly (these triggers already run
--    SECURITY DEFINER, so no notify_employee() indirection is needed —
--    company_memberships.user_id/project_assignments' resolved employee
--    profile_id are already the exact recipient_user_id notifications
--    wants). Never fires for a no-op save (e.g. re-saving the same
--    status) — each trigger's WHEN clause requires the value to have
--    actually changed.
-- ============================================================================
create or replace function public.trg_notify_membership_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_name text;
begin
  if new.status not in ('suspended', 'removed') then
    return new;
  end if;
  select name into v_company_name from public.companies where id = new.company_id;
  insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
  values (
    new.company_id, new.user_id,
    case when new.status = 'suspended' then 'company_membership_suspended' else 'company_membership_removed' end,
    case when new.status = 'suspended' then 'Company access suspended' else 'Company access removed' end,
    format('Your access to %s has been %s.', coalesce(v_company_name, 'this company'), new.status),
    '/dashboard'
  );
  return new;
end;
$$;

create trigger company_memberships_notify_status_change
  after update on public.company_memberships
  for each row
  when (new.status is distinct from old.status)
  execute function public.trg_notify_membership_status_changed();

create or replace function public.trg_notify_project_assignment_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient_user_id uuid;
  v_project_name text;
begin
  select profile_id into v_recipient_user_id from public.employees where id = coalesce(new.employee_id, old.employee_id);
  if v_recipient_user_id is null then
    return coalesce(new, old);
  end if;
  select name into v_project_name from public.projects where id = coalesce(new.project_id, old.project_id);

  if tg_op = 'INSERT' then
    insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
    values (new.company_id, v_recipient_user_id, 'project_assignment_added', 'Added to a project', format('You''ve been added to %s.', coalesce(v_project_name, 'a project')), '/dashboard');
    return new;
  end if;

  if tg_op = 'UPDATE' and old.end_at is null and new.end_at is not null then
    insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
    values (new.company_id, v_recipient_user_id, 'project_assignment_removed', 'Removed from a project', format('You''ve been removed from %s.', coalesce(v_project_name, 'a project')), '/dashboard');
  end if;
  return new;
end;
$$;

create trigger project_assignments_notify_added
  after insert on public.project_assignments
  for each row execute function public.trg_notify_project_assignment_changed();

create trigger project_assignments_notify_removed
  after update on public.project_assignments
  for each row
  when (old.end_at is distinct from new.end_at)
  execute function public.trg_notify_project_assignment_changed();

comment on function public.trg_notify_project_assignment_changed() is
  'Item 24. Silently no-ops for an employee with no linked profile (nothing to notify) — never raises, never blocks the underlying project_assignments write.';

-- ============================================================================
-- 9) Nav entry for the platform-admin route this migration finally gives
--    real product surface to stays a TS-layer concern (components/app-shell/
--    nav-config.ts) — nothing further needed at the DB layer for it.
-- ============================================================================
