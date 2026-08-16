-- Post-audit implementation package, Part 4 — Scaffold Register V2. This
-- migration intentionally changes one previously-audited business rule
-- (Foreman was view-only on Scaffold Register; this was CORRECT for the
-- baseline this session's earlier audit ran against). New rule: Foreman
-- may register/create a scaffold, restricted to themselves as Responsible
-- Foreman and to their own Today's Teams. Everything else about the
-- existing, audited permission model (SELECT policy's org-wide-manager
-- branch, is_scaffold_manage_tier for UPDATE, the void/immutability
-- discipline, the "no DELETE grant — HSEQ evidence" convention) is left
-- untouched.
--
-- ============================================================================
-- 1) Visibility: EMPLOYEE must never see Scaffold Register data at all —
--    previously any project-assigned person (including plain employees)
--    got SELECT via the role-agnostic has_project_access(project_id)
--    branch. Replaced with an explicit non-employee operational-role
--    allow-list; the org-wide-manager branch (company_admin/
--    operations_manager/hseq_manager) is unchanged.
-- ============================================================================
drop policy if exists scaffolds_select on public.scaffolds;
create policy scaffolds_select
  on public.scaffolds
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or (public.has_project_access(project_id) and public.has_any_company_role(company_id, array['project_manager', 'hse_officer', 'foreman', 'inspector']))
    )
  );

comment on policy scaffolds_select on public.scaffolds is
  'V2: employees are deliberately excluded — Scaffold Register is not a general employee-visible module. company_admin/operations_manager/hseq_manager: unconditional company-wide. project_manager/hse_officer/foreman/inspector: only with project access. Nobody else (including plain "employee") ever matches.';

-- ============================================================================
-- 2) Creation rights: Foreman (self-only), Project Manager, company_admin
--    (the existing, unambiguous "highest company authority" role — the
--    task's "appropriate existing company-level management role"; the
--    org-wide-manager SELECT branch already included company_admin, so
--    this extends it to create/register consistently. operations_manager
--    is deliberately NOT added here — every other HSEQ-record-creation
--    surface in this schema (LMRA, Observations, Corrective Actions)
--    consistently excludes it too, and its own seeded role description
--    scopes it to "normal employee administration," not HSEQ authority)
--    remain unchanged from the existing tier (hseq_manager org-wide,
--    hse_officer/inspector with project access).
-- ============================================================================
create or replace function public.is_scaffold_broad_creator(target_company_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    public.has_company_role(target_company_id, 'hseq_manager')
    or public.has_company_role(target_company_id, 'company_admin')
    or (public.has_any_company_role(target_company_id, array['hse_officer', 'inspector']) and public.has_project_access(target_project_id))
    or public.is_project_manager(target_project_id);
$$;

comment on function public.is_scaffold_broad_creator(uuid, uuid) is
  'Every scaffold-creation path EXCEPT "a Foreman registering with themselves as Responsible Foreman" (see is_caller_eligible_scaffold_foreman below) — these callers may set ANY eligible Foreman as responsible_foreman_id, not only themselves. Reused by validate_scaffold_insert() to decide whether the self-only lock applies.';

revoke all on function public.is_scaffold_broad_creator(uuid, uuid) from public, anon;
grant execute on function public.is_scaffold_broad_creator(uuid, uuid) to authenticated;

create or replace function public.is_caller_eligible_scaffold_foreman(target_company_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.employees e
    where e.profile_id = auth.uid()
      and e.company_id = target_company_id
      and public.is_eligible_scaffold_foreman(e.id, target_company_id, target_project_id)
  );
$$;

comment on function public.is_caller_eligible_scaffold_foreman(uuid, uuid) is
  'True if the calling user IS, themselves, an employee holding an eligible Responsible-Foreman qualification for target_project_id (same is_eligible_scaffold_foreman() rule the responsible_foreman_id column itself is already validated against). Backs the new "Foreman may register a scaffold" INSERT grant.';

revoke all on function public.is_caller_eligible_scaffold_foreman(uuid, uuid) from public, anon;
grant execute on function public.is_caller_eligible_scaffold_foreman(uuid, uuid) to authenticated;

drop policy if exists scaffolds_insert on public.scaffolds;
create policy scaffolds_insert
  on public.scaffolds
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.is_scaffold_broad_creator(company_id, project_id)
      or public.is_caller_eligible_scaffold_foreman(company_id, project_id)
    )
  );

comment on policy scaffolds_insert on public.scaffolds is
  'V2: broad creators (HSEQ Manager org-wide, Company Manager org-wide, HSE Officer/Inspector with project access, the project''s own PM) may set ANY eligible Responsible Foreman. A Foreman with no other qualifying role may ALSO create — but validate_scaffold_insert() below forces responsible_foreman_id to their own employee id in that case, rejecting any other value server-side (never merely a disabled UI field).';

-- scaffolds_update is DELIBERATELY left unchanged (is_scaffold_manage_tier
-- only) — the task's explicit ask was create/register rights; expanding
-- edit rights to company_admin/PM/Foreman-of-their-own-scaffold was not
-- requested and is not added here (see the final report for this scoping
-- decision, easy to revisit as an explicit follow-up if wanted).

-- ============================================================================
-- 3) Enforce the Foreman self-lock server-side (never merely a disabled
--    field) — extends the existing validate_scaffold_insert() trigger.
-- ============================================================================
create or replace function public.validate_scaffold_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.responsible_foreman_id);
  if not public.is_eligible_scaffold_foreman(new.responsible_foreman_id, new.company_id, new.project_id) then
    raise exception 'employee % is not an eligible Responsible Foreman for this project — must hold the Foreman role and an active Foreman team assignment on this project', new.responsible_foreman_id;
  end if;

  -- V2: a caller relying ONLY on the "I am an eligible Foreman myself"
  -- INSERT grant (not a broad creator) may never name anyone else as
  -- Responsible Foreman — server-enforced, independent of whatever the
  -- client sent.
  if not public.is_scaffold_broad_creator(new.company_id, new.project_id) then
    if not exists (
      select 1 from public.employees e
      where e.id = new.responsible_foreman_id
        and e.company_id = new.company_id
        and e.profile_id = auth.uid()
    ) then
      raise exception 'as a Foreman, you can only register a scaffold with yourself as the Responsible Foreman';
    end if;
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 4) Erection date: default to today going forward, required. Backfill
--    existing NULL rows to their created_at date first (non-destructive —
--    the best available real information for a scaffold that has no
--    recorded erection date, never a fabricated/arbitrary one).
-- ============================================================================
update public.scaffolds set erected_at = created_at::date where erected_at is null;
alter table public.scaffolds alter column erected_at set default current_date;
alter table public.scaffolds alter column erected_at set not null;

-- ============================================================================
-- 5) Scaffold erection teams — replaces the "Scaffold team size / Team
--    member 1/2/3..." manual roster for NEW scaffolds with a real link to
--    ONE OR MORE actual Today's Teams (daily_teams), scoped to the
--    scaffold's own erection date. scaffold_team_members (the old manual
--    roster) is NOT dropped or altered — existing/legacy scaffolds keep
--    their historical roster exactly as recorded; new scaffolds simply
--    stop writing to it (see modules/scaffolds/actions.ts).
-- ============================================================================
create table public.scaffold_erection_teams (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- Denormalized from the scaffold, never client-trusted — set by
  -- validate_scaffold_erection_team_insert() below, same convention as
  -- scaffold_team_members.project_id.
  project_id uuid not null,
  scaffold_id uuid not null,
  daily_team_id uuid not null,
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  constraint scaffold_erection_teams_unique unique (scaffold_id, daily_team_id),
  constraint scaffold_erection_teams_id_company_id_key unique (id, company_id),
  constraint scaffold_erection_teams_scaffold_fk foreign key (scaffold_id, company_id) references public.scaffolds (id, company_id) on delete cascade,
  constraint scaffold_erection_teams_daily_team_fk foreign key (daily_team_id, company_id) references public.daily_teams (id, company_id) on delete restrict
);

comment on table public.scaffold_erection_teams is
  'Which Today''s Teams (daily_teams) actually erected a scaffold — a real link to historical daily-team records (Part 4C), never a flattened copy of worker names. "on delete restrict" for daily_team_id: a daily_teams row that already has an erection-team link is HSEQ evidence and can never be silently removed out from under it (matches this schema''s consistent "historical record, not editable away" discipline elsewhere).';

create index scaffold_erection_teams_scaffold_id_idx on public.scaffold_erection_teams (scaffold_id);
create index scaffold_erection_teams_daily_team_id_idx on public.scaffold_erection_teams (daily_team_id);
create index scaffold_erection_teams_project_id_idx on public.scaffold_erection_teams (project_id);

create or replace function public.validate_scaffold_erection_team_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_scaffold public.scaffolds;
  v_team public.daily_teams;
begin
  select * into v_scaffold from public.scaffolds where id = new.scaffold_id;
  if v_scaffold.id is null then
    raise exception 'scaffold % not found', new.scaffold_id;
  end if;
  new.company_id := v_scaffold.company_id;
  new.project_id := v_scaffold.project_id;

  select * into v_team from public.daily_teams where id = new.daily_team_id;
  if v_team.id is null then
    raise exception 'daily team % not found', new.daily_team_id;
  end if;

  -- The linked team must genuinely belong to the SAME project and the
  -- SAME date as the scaffold's own erection date — never a
  -- client-trusted pairing, and never silently valid if the scaffold''s
  -- erected_at is later edited to a date this team never worked.
  if v_team.project_id is distinct from v_scaffold.project_id then
    raise exception 'that team does not belong to this scaffold''s project';
  end if;
  if v_team.work_date is distinct from v_scaffold.erected_at then
    raise exception 'that team is not from this scaffold''s erection date (%)', v_scaffold.erected_at;
  end if;

  -- A caller relying ONLY on the "I am an eligible Foreman myself" path
  -- may only attach THEIR OWN Today's Teams — server-enforced, never a
  -- client-trusted "which teams did I lead" claim. Broad creators
  -- (PM/company-level/HSEQ) may attach any eligible team from the
  -- project/date.
  if not public.is_scaffold_broad_creator(v_scaffold.company_id, v_scaffold.project_id) then
    if not exists (
      select 1 from public.employees e
      where e.id = v_team.foreman_employee_id
        and e.profile_id = auth.uid()
    ) then
      raise exception 'as a Foreman, you can only attach your own Today''s Teams to a scaffold you register';
    end if;
  end if;

  return new;
end;
$$;

create trigger scaffold_erection_teams_validate_insert
  before insert on public.scaffold_erection_teams
  for each row execute function public.validate_scaffold_erection_team_insert();

-- No UPDATE grant/policy at all — a link is either present or removed
-- (DELETE), never edited in place; matches every "row is an evidentiary
-- fact" table in this schema (e.g. scaffold_team_members' own
-- non-destructive-only shape, though here a mis-added link is simply
-- removable outright since it carries no history of its own worth
-- preserving once removed, unlike a roster membership that once
-- represented real presence).
alter table public.scaffold_erection_teams enable row level security;
alter table public.scaffold_erection_teams force row level security;

grant select, insert, delete on public.scaffold_erection_teams to authenticated;

create policy scaffold_erection_teams_select
  on public.scaffold_erection_teams
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or (public.has_project_access(project_id) and public.has_any_company_role(company_id, array['project_manager', 'hse_officer', 'foreman', 'inspector']))
    )
  );

create policy scaffold_erection_teams_insert
  on public.scaffold_erection_teams
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and exists (
      select 1 from public.scaffolds s
      where s.id = scaffold_erection_teams.scaffold_id
        and (public.is_scaffold_broad_creator(s.company_id, s.project_id) or public.is_caller_eligible_scaffold_foreman(s.company_id, s.project_id))
    )
  );

create policy scaffold_erection_teams_delete
  on public.scaffold_erection_teams
  for delete
  to authenticated
  using (
    public.is_company_member(company_id)
    and exists (
      select 1 from public.scaffolds s
      where s.id = scaffold_erection_teams.scaffold_id
        and public.is_scaffold_manage_tier(s.company_id, s.project_id)
    )
  );

comment on policy scaffold_erection_teams_insert on public.scaffold_erection_teams is
  'Mirrors scaffolds_insert''s own two paths (broad creator, or self-eligible Foreman) — the WITH CHECK company_id/project_id columns are set by the BEFORE INSERT trigger from the scaffold row itself, so this policy re-derives them from scaffolds rather than trusting the (not-yet-set-by-the-client) row values.';
