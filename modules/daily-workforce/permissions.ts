import type { RoleName } from "@/modules/companies/types";

/**
 * Daily Workforce / Today's Teams role gates — mirror the RLS in
 * supabase/migrations/20260812090000_daily_workforce_and_teams.sql exactly
 * (RLS is the real enforcement; these functions only decide what to
 * render — see docs/API_CONVENTIONS.md §6). Same "company-wide role OR the
 * project's own assigned Project Manager" shape as
 * modules/projects/permissions.ts's canManageProject(), since
 * daily_attendance/daily_teams' write RLS mirrors it exactly.
 */

const COMPANY_WIDE_MANAGE_ROLES: RoleName[] = ["company_admin", "operations_manager"];

/**
 * Setting daily_attendance status, or editing a Today's Team's own fields
 * (name/shift/work_area/activity) and locking/unlocking a day — company-
 * wide managers, or the project's own assigned Project Manager. Foreman is
 * deliberately excluded (see canManageOwnDailyTeam() below for their
 * narrower, single-team grant) — this milestone's explicit "Administrator
 * / Project Manager: manage daily workforce, teams, hours" direction.
 */
export function canManageDailyWorkforce(roleNames: RoleName[], myProjectAssignmentRoles: string[]): boolean {
  return roleNames.some((role) => COMPANY_WIDE_MANAGE_ROLES.includes(role)) || myProjectAssignmentRoles.includes("project_manager");
}

/**
 * Moving/removing a worker on ONE specific Today's Team — company-wide
 * managers, the project's own PM, OR (this milestone's explicit "Foreman:
 * ... manage their own team only" direction) the caller themselves holding
 * the `foreman` role AND currently being that SPECIFIC team's foreman
 * (`isTeamForeman`, resolved server-side via is_daily_team_foreman() —
 * never trust a client-supplied "I am the foreman" claim). A narrow,
 * single-team grant, mirroring the existing self-scoped pattern in
 * modules/scaffold-defects/permissions.ts (the responsible person's own
 * progress-update rights), not a broadening of Foreman's access to every
 * team.
 */
export function canManageOwnDailyTeam(roleNames: RoleName[], myProjectAssignmentRoles: string[], isTeamForeman: boolean): boolean {
  return canManageDailyWorkforce(roleNames, myProjectAssignmentRoles) || (roleNames.includes("foreman") && isTeamForeman);
}

const DAILY_WORKFORCE_BROAD_VIEWER_ROLES: RoleName[] = ["project_manager", "hseq_manager", "hse_officer", "inspector", "foreman"];

/**
 * Viewing the WHOLE day's workforce (every team, every employee's
 * attendance) rather than only one's own — company-wide managers, or any
 * of PM/HSE Manager/HSE Officer/Inspector/Foreman WITH project access.
 * Matches daily_attendance_select/daily_teams_select's RLS exactly — a
 * plain "employee" role (none of the above) falls through to seeing only
 * their own row, enforced by RLS itself, not by this function (there is no
 * "view own" variant to compute here — the query layer simply returns
 * fewer rows for that caller).
 */
export function canViewDailyWorkforceBroadly(roleNames: RoleName[], hasProjectAccess: boolean): boolean {
  return roleNames.some((role) => COMPANY_WIDE_MANAGE_ROLES.includes(role)) || (hasProjectAccess && roleNames.some((role) => DAILY_WORKFORCE_BROAD_VIEWER_ROLES.includes(role)));
}
