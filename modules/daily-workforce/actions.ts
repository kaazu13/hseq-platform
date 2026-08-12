"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { canManageDailyWorkforce } from "./permissions";
import {
  setDailyAttendanceStatusSchema,
  dailyTeamFormSchema,
  createDailyTeamSchema,
  reorderDailyTeamsSchema,
  moveDailyTeamMemberSchema,
  unlockDailyTeamsSchema,
  type SetDailyAttendanceStatusInput,
  type DailyTeamFormInput,
  type CreateDailyTeamInput,
  type ReorderDailyTeamsInput,
  type MoveDailyTeamMemberInput,
  type UnlockDailyTeamsInput,
} from "./validation";
import type { DailyAttendance, DailyTeam, DailyTeamMember, DailyTeamShift } from "./types";

/**
 * Server Functions for the Daily Workforce / Today's Teams domain — same
 * fixed recipe as every other module (docs/API_CONVENTIONS.md §3). The app-
 * layer permission checks here are a coarse pre-filter for a fast, clear
 * error; RLS/the migration's triggers are the real, authoritative
 * enforcement in every case — see
 * supabase/migrations/20260812090000_daily_workforce_and_teams.sql.
 */

async function requireDailyWorkforceManageAccess(companyId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, myProjectAssignmentRoles] = await Promise.all([
    getUserRoleNames(companyId),
    getMyProjectAssignmentRoles(companyId, projectId, user.id),
  ]);

  if (!canManageDailyWorkforce(roleNames, myProjectAssignmentRoles)) {
    forbidden();
  }

  return { user, roleNames };
}

/** Today's Teams reads its date from a `?date=` search param, which revalidatePath doesn't scope by — every date under this project path is covered by revalidating the base path. */
function revalidateDailyWorkforcePaths(companyId: string, projectId: string) {
  revalidatePath(`/companies/${companyId}/projects/${projectId}/teams`);
  revalidatePath("/dashboard");
}

/**
 * Sets an employee's daily_attendance status for one (project, work_date) —
 * the sole write path, via set_daily_attendance_status() (this milestone's
 * explicit "atomic status update + team removal" requirement). The UI
 * performs its own pre-check (getDailyAttendance + the worker's current
 * assignedTeam from listWorkforceForDate) to show a confirmation dialog
 * BEFORE calling this when marking someone unavailable who is currently
 * assigned — but this action (and the RPC underneath it) enforces the
 * atomic removal unconditionally regardless, so a contradictory state can
 * never persist even if that confirmation is skipped.
 */
export async function setDailyAttendanceStatus(
  companyId: string,
  projectId: string,
  employeeId: string,
  workDate: string,
  input: SetDailyAttendanceStatusInput,
): Promise<ActionResult<{ attendance: DailyAttendance; removedFromTeamId: string | null }>> {
  const parsed = setDailyAttendanceStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the status.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireDailyWorkforceManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("set_daily_attendance_status", {
      target_project_id: projectId,
      target_employee_id: employeeId,
      target_work_date: workDate,
      target_status: parsed.data.status,
      target_note: (parsed.data.note ?? null) as string,
      target_reason: (parsed.data.reason ?? null) as string,
    })
    .single();

  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't update attendance status. Try again." } };
  }

  revalidateDailyWorkforcePaths(companyId, projectId);
  revalidatePath(`/companies/${companyId}/projects/${projectId}/worked-hours`);
  return { ok: true, data: { attendance: data.attendance, removedFromTeamId: data.removed_from_team_id } };
}

/** Create-or-update a Today's Team's own fields (name/shift/work area/activity) — save_daily_team(). dailyTeamId null = create. */
export async function saveDailyTeam(
  companyId: string,
  projectId: string,
  workDate: string,
  dailyTeamId: string | null,
  input: DailyTeamFormInput,
): Promise<ActionResult<{ dailyTeamId: string }>> {
  const parsed = dailyTeamFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireDailyWorkforceManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("save_daily_team", {
      target_daily_team_id: dailyTeamId as string,
      target_project_id: projectId,
      target_work_date: workDate,
      target_name: parsed.data.name,
      target_shift: (parsed.data.shift ?? null) as DailyTeamShift,
      target_work_area: (parsed.data.workArea ?? null) as string,
      target_activity: (parsed.data.activity ?? null) as string,
    })
    .single();

  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save the team. Try again." } };
  }

  revalidateDailyWorkforcePaths(companyId, projectId);
  return { ok: true, data: { dailyTeamId: (data as DailyTeam).id } };
}

/** Item 9: the ONLY way to create a NEW Today's Team — name, shift, and an eligible foreman are all required, atomically (create_daily_team_with_foreman()). */
export async function createDailyTeam(companyId: string, projectId: string, workDate: string, input: CreateDailyTeamInput): Promise<ActionResult<{ dailyTeamId: string }>> {
  const parsed = createDailyTeamSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireDailyWorkforceManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("create_daily_team_with_foreman", {
      target_project_id: projectId,
      target_work_date: workDate,
      target_name: parsed.data.name,
      target_shift: parsed.data.shift as DailyTeamShift,
      target_foreman_employee_id: parsed.data.foremanEmployeeId,
      target_work_area: (parsed.data.workArea ?? null) as string,
      target_activity: (parsed.data.activity ?? null) as string,
    })
    .single();

  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't create the team. Try again." } };
  }

  revalidateDailyWorkforcePaths(companyId, projectId);
  return { ok: true, data: { dailyTeamId: (data as DailyTeam).id } };
}

/** Item 4: persists drag-reordered card positions — DISPLAY ORDER ONLY, never touches membership/shift/foreman/work_area/activity. */
export async function reorderDailyTeams(companyId: string, projectId: string, workDate: string, input: ReorderDailyTeamsInput): Promise<ActionResult<null>> {
  const parsed = reorderDailyTeamsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Invalid order.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireDailyWorkforceManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { error } = await supabase.rpc("reorder_daily_teams", {
    target_project_id: projectId,
    target_work_date: workDate,
    target_ordered_team_ids: parsed.data.orderedTeamIds,
  });

  if (error) {
    if (isRlsViolation(error)) forbidden();
    return { ok: false, error: { code: "server_error", message: "Couldn't save the new order. Try again." } };
  }

  revalidateDailyWorkforcePaths(companyId, projectId);
  return { ok: true, data: null };
}

/**
 * Moves (or newly assigns) a worker onto a Today's Team —
 * move_daily_team_member(). App-layer check here is deliberately
 * optimistic for a Foreman (company-wide managers/PM always pass; a
 * Foreman passes the coarse role check but RLS's is_daily_team_foreman()
 * check is what actually confirms it's THEIR team — a Foreman attempting
 * to move a worker onto someone else's team gets a clean 403 from RLS,
 * caught below).
 */
export async function moveDailyTeamMember(companyId: string, projectId: string, workDate: string, input: MoveDailyTeamMemberInput): Promise<ActionResult<{ dailyTeamMemberId: string }>> {
  const parsed = moveDailyTeamMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the selection.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireCompanyMembership(companyId);
  const roleNames = await getUserRoleNames(companyId);
  const myProjectAssignmentRoles = await getMyProjectAssignmentRoles(companyId, projectId, user.id);
  if (!canManageDailyWorkforce(roleNames, myProjectAssignmentRoles) && !roleNames.includes("foreman")) {
    forbidden();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("move_daily_team_member", {
      target_project_id: projectId,
      target_work_date: workDate,
      target_daily_team_id: parsed.data.dailyTeamId,
      target_employee_id: parsed.data.employeeId,
      target_role: parsed.data.role,
    })
    .single();

  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't assign that worker. Try again." } };
  }

  revalidateDailyWorkforcePaths(companyId, projectId);
  return { ok: true, data: { dailyTeamMemberId: (data as DailyTeamMember).id } };
}

/** Removes a worker from their current Today's Team entirely (no replacement) — a direct, RLS-gated close (removed_at/removed_by), same shape as end_team_assignment() in the older teams model. */
export async function removeDailyTeamMember(companyId: string, projectId: string, workDate: string, dailyTeamMemberId: string): Promise<ActionResult<null>> {
  const { user } = await requireCompanyMembership(companyId);
  const roleNames = await getUserRoleNames(companyId);
  const myProjectAssignmentRoles = await getMyProjectAssignmentRoles(companyId, projectId, user.id);
  if (!canManageDailyWorkforce(roleNames, myProjectAssignmentRoles) && !roleNames.includes("foreman")) {
    forbidden();
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("daily_team_members")
    .update({ removed_at: new Date().toISOString(), removed_by: user.id }, { count: "exact" })
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("work_date", workDate)
    .eq("id", dailyTeamMemberId)
    .is("removed_at", null);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't remove that worker. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "That team membership was not found, or is already removed." } };
  }

  revalidateDailyWorkforcePaths(companyId, projectId);
  return { ok: true, data: null };
}

/** End-of-day "[ Lock Today's Teams ]" — locks every open Today's Team for (project, work_date). */
export async function lockDailyTeams(companyId: string, projectId: string, workDate: string): Promise<ActionResult<null>> {
  await requireDailyWorkforceManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { error } = await supabase.rpc("lock_daily_teams", { target_project_id: projectId, target_work_date: workDate });

  if (error) {
    if (isRlsViolation(error)) forbidden();
    return { ok: false, error: { code: "server_error", message: "Couldn't lock Today's Teams. Try again." } };
  }

  revalidateDailyWorkforcePaths(companyId, projectId);
  return { ok: true, data: null };
}

/** The exceptional, audited correction path — unlocks a locked day, requiring a reason (unlock_daily_teams()). */
export async function unlockDailyTeams(companyId: string, projectId: string, workDate: string, input: UnlockDailyTeamsInput): Promise<ActionResult<null>> {
  const parsed = unlockDailyTeamsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireDailyWorkforceManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { error } = await supabase.rpc("unlock_daily_teams", { target_project_id: projectId, target_work_date: workDate, target_reason: parsed.data.reason });

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't unlock Today's Teams. Try again." } };
  }

  revalidateDailyWorkforcePaths(companyId, projectId);
  return { ok: true, data: null };
}
