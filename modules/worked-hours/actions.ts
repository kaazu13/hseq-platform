"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireCompanyMembership, requireUser, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { canManageWorkedHours } from "./permissions";
import {
  upsertWorkedHoursSchema,
  bulkApplyWorkedHoursSchema,
  reportWorkedHoursDiscrepancySchema,
  resolveWorkedHoursDiscrepancySchema,
  type UpsertWorkedHoursInput,
  type BulkApplyWorkedHoursInput,
  type ReportWorkedHoursDiscrepancyInput,
  type ResolveWorkedHoursDiscrepancyInput,
} from "./validation";
import type { WorkedHours, WorkedHoursDiscrepancy } from "./types";

/**
 * Server Functions for the Worked Hours domain — same fixed recipe as
 * every other module (docs/API_CONVENTIONS.md §3). RLS/the migration's
 * triggers are the real, authoritative enforcement in every case — see
 * supabase/migrations/20260813090000_worked_hours.sql.
 */

async function requireWorkedHoursManageAccess(companyId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, myProjectAssignmentRoles] = await Promise.all([
    getUserRoleNames(companyId),
    getMyProjectAssignmentRoles(companyId, projectId, user.id),
  ]);

  if (!canManageWorkedHours(roleNames, myProjectAssignmentRoles)) {
    forbidden();
  }

  return { user, roleNames };
}

function revalidateWorkedHoursPaths(companyId: string, projectId: string) {
  revalidatePath(`/companies/${companyId}/projects/${projectId}/worked-hours`);
  revalidatePath("/dashboard");
}

/**
 * The sole write path for worked_hours' hours/note — upsert_worked_hours().
 * Create or a free draft edit needs no reason; correcting an already-
 * SUBMITTED row requires one (validated both here and, authoritatively,
 * inside the RPC) and atomically records a worked_hours_corrections row
 * plus a "Worked hours updated" notification to the employee.
 */
export async function upsertWorkedHours(companyId: string, projectId: string, employeeId: string, workDate: string, input: UpsertWorkedHoursInput): Promise<ActionResult<WorkedHours>> {
  const parsed = upsertWorkedHoursSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the hours entered.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireWorkedHoursManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("upsert_worked_hours", {
      target_project_id: projectId,
      target_employee_id: employeeId,
      target_work_date: workDate,
      target_hours: parsed.data.hours,
      target_note: (parsed.data.note ?? null) as string,
      target_reason: (parsed.data.reason ?? null) as string,
    })
    .single();

  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save worked hours. Try again." } };
  }

  revalidateWorkedHoursPaths(companyId, projectId);
  return { ok: true, data: data as WorkedHours };
}

/** "Apply [X] hours to all" — bulk_apply_worked_hours(); already-submitted rows are left untouched by the RPC itself. */
export async function bulkApplyWorkedHours(companyId: string, projectId: string, workDate: string, input: BulkApplyWorkedHoursInput): Promise<ActionResult<null>> {
  const parsed = bulkApplyWorkedHoursSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireWorkedHoursManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { error } = await supabase.rpc("bulk_apply_worked_hours", {
    target_project_id: projectId,
    target_work_date: workDate,
    target_hours: parsed.data.hours,
    target_employee_ids: parsed.data.employeeIds,
  });

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't apply hours. Try again." } };
  }

  revalidateWorkedHoursPaths(companyId, projectId);
  return { ok: true, data: null };
}

/** Submits every currently-draft worked_hours row for (project, work_date) — a deliberate, separate action. */
export async function submitWorkedHours(companyId: string, projectId: string, workDate: string): Promise<ActionResult<null>> {
  await requireWorkedHoursManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { error } = await supabase.rpc("submit_worked_hours", { target_project_id: projectId, target_work_date: workDate });

  if (error) {
    if (isRlsViolation(error)) forbidden();
    return { ok: false, error: { code: "server_error", message: "Couldn't submit worked hours. Try again." } };
  }

  revalidateWorkedHoursPaths(companyId, projectId);
  return { ok: true, data: null };
}

/** Employee "[ Report discrepancy ]" action — report_worked_hours_discrepancy(). RLS confirms the caller owns the referenced worked_hours row; no elevated role required. */
export async function reportWorkedHoursDiscrepancy(companyId: string, workedHoursId: string, input: ReportWorkedHoursDiscrepancyInput): Promise<ActionResult<WorkedHoursDiscrepancy>> {
  const parsed = reportWorkedHoursDiscrepancySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A comment is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireCompanyMembership(companyId);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("report_worked_hours_discrepancy", { target_worked_hours_id: workedHoursId, target_comment: parsed.data.comment }).single();

  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't report this discrepancy. Try again." } };
  }

  revalidatePath("/dashboard");
  return { ok: true, data: data as WorkedHoursDiscrepancy };
}

/** PM/Admin accept/reject review of a discrepancy — resolve_worked_hours_discrepancy(). Accepting with a resulting hours value applies the correction via the same upsert_worked_hours() path any other correction uses. */
export async function resolveWorkedHoursDiscrepancy(companyId: string, projectId: string, discrepancyId: string, input: ResolveWorkedHoursDiscrepancyInput): Promise<ActionResult<WorkedHoursDiscrepancy>> {
  const parsed = resolveWorkedHoursDiscrepancySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireWorkedHoursManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("resolve_worked_hours_discrepancy", {
      target_discrepancy_id: discrepancyId,
      target_status: parsed.data.status,
      target_resolution_note: parsed.data.resolutionNote,
      target_resulting_hours: (parsed.data.resultingHours ?? null) as number,
    })
    .single();

  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't resolve this discrepancy. Try again." } };
  }

  revalidateWorkedHoursPaths(companyId, projectId);
  return { ok: true, data: data as WorkedHoursDiscrepancy };
}

/** Marks one of the caller's own notifications read — RLS confirms ownership (recipient_user_id = auth.uid()). */
export async function markNotificationRead(notificationId: string): Promise<ActionResult<null>> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    return { ok: false, error: { code: "server_error", message: "Couldn't update that notification." } };
  }

  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  return { ok: true, data: null };
}

/** Marks every one of the caller's own currently-unread notifications read in one request. RLS's notifications_update policy (recipient_user_id = auth.uid()) means this can never touch another user's rows even though no id list is passed. */
export async function markAllNotificationsRead(): Promise<ActionResult<null>> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    return { ok: false, error: { code: "server_error", message: "Couldn't update your notifications." } };
  }

  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  return { ok: true, data: null };
}
