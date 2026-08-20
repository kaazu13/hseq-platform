-- ============================================================================
-- Root-cause fix: erection crew (team-link and participant) INSERT could
-- fail for hseq_manager/hse_officer/inspector while editing an EXISTING
-- scaffold — "Couldn't add the new erection crew members. Try again."
-- ============================================================================
-- scaffold_erection_teams_insert (20260831093000) and
-- scaffold_erection_participants_insert (20260901125000) both gate on
-- is_scaffold_broad_creator() OR is_caller_eligible_scaffold_foreman().
-- At the time scaffold_erection_teams_insert was written,
-- is_scaffold_broad_creator() ALSO covered hseq_manager/hse_officer/
-- inspector — but 20260901093000 ("scaffold register creation permission
-- fix") deliberately NARROWED is_scaffold_broad_creator() to only
-- company_admin/the project's own project_manager/platform_super_admin,
-- correctly restricting who may REGISTER a brand-new scaffold. Nobody
-- went back to update the two erection-link INSERT policies, which are
-- fired not just at creation but every time updateScaffold() reconciles
-- the crew on an EXISTING scaffold — a path hseq_manager (unconditional)
-- and hse_officer/inspector (project-scoped) ARE authorized to use per
-- canManageScaffold()/requireScaffoldManageAccess() (modules/scaffolds/
-- actions.ts) and is_scaffold_manage_tier() (this same DB). The result:
-- every one of THEIR crew edits hit a silent 403 RLS violation on the
-- INSERT half of the diff/reconcile (soft-remove UPDATE was already
-- correctly gated on is_scaffold_manage_tier and worked fine), while
-- company_admin/PM/platform_super_admin — who can't even reach
-- updateScaffold at all, since it uses the narrower canManageScaffold —
-- never hit this path and never exposed the bug.
--
-- Fix: OR in is_scaffold_manage_tier() on both INSERT policies, so
-- "anyone who can already edit this scaffold" can also update its
-- erection crew/team links, exactly matching updateScaffold()'s own
-- gate. The broad-creator/self-eligible-foreman paths are kept
-- unchanged for scaffold CREATION (createScaffold()'s own gate,
-- canCreateScaffold(), is unaffected by this migration).
-- ============================================================================

drop policy scaffold_erection_teams_insert on public.scaffold_erection_teams;
create policy scaffold_erection_teams_insert
  on public.scaffold_erection_teams
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and exists (
      select 1 from public.scaffolds s
      where s.id = scaffold_erection_teams.scaffold_id
        and (
          public.is_scaffold_broad_creator(s.company_id, s.project_id)
          or public.is_caller_eligible_scaffold_foreman(s.company_id, s.project_id)
          or public.is_scaffold_manage_tier(s.company_id, s.project_id)
        )
    )
  );

comment on policy scaffold_erection_teams_insert on public.scaffold_erection_teams is
  'Broad creator OR self-eligible Foreman (scaffold CREATION paths) OR manage-tier (hseq_manager/hse_officer/inspector — the scaffold EDIT path, updateScaffold()). Fixed 20260902090000: is_scaffold_broad_creator() was narrowed by 20260901093000 to exclude the manage-tier roles, which broke erection-team edits for them on existing scaffolds without this third branch.';

drop policy scaffold_erection_participants_insert on public.scaffold_erection_participants;
create policy scaffold_erection_participants_insert
  on public.scaffold_erection_participants
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and exists (
      select 1 from public.scaffolds s
      where s.id = scaffold_erection_participants.scaffold_id
        and (
          public.is_scaffold_broad_creator(s.company_id, s.project_id)
          or public.is_caller_eligible_scaffold_foreman(s.company_id, s.project_id)
          or public.is_scaffold_manage_tier(s.company_id, s.project_id)
        )
    )
  );

comment on policy scaffold_erection_participants_insert on public.scaffold_erection_participants is
  'Same fix as scaffold_erection_teams_insert (20260902090000) — the manage-tier branch is required so hseq_manager/hse_officer/inspector can add crew participants while editing an existing scaffold, not only at creation.';
