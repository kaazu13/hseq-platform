"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { getMyEmployeeId } from "@/modules/daily-workforce/queries";
import { canManageDailyWorkforce } from "@/modules/daily-workforce/permissions";
import { reportAbsenceSchema, rejectAbsenceReportSchema, reopenAbsenceDaySchema, correctAbsenceStatusSchema, type ReportAbsenceInput, type RejectAbsenceReportInput, type ReopenAbsenceDayInput, type CorrectAbsenceStatusInput } from "./validation";
import type { AbsenceReport, DailyAttendanceDayLock } from "./types";

/**
 * Server Functions for Absence management (Phases 4-7). Same fixed recipe
 * as every other module (docs/API_CONVENTIONS.md §3) — app-layer checks
 * here are a fast pre-filter; the RPCs' own RLS/manual checks
 * (supabase/migrations/20260819092000_absence_and_leave.sql,
 * 20260819093000_absence_leave_notifications_fix.sql) are the real,
 * authoritative enforcement.
 */

async function requireAbsenceManageAccess(companyId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, myProjectAssignmentRoles] = await Promise.all([getUserRoleNames(companyId), getMyProjectAssignmentRoles(companyId, projectId, user.id)]);
  if (!canManageDailyWorkforce(roleNames, myProjectAssignmentRoles)) forbidden();
  return { user, roleNames };
}

function revalidateAbsencePaths(companyId: string, projectId: string) {
  revalidatePath(`/companies/${companyId}/projects/${projectId}/absences`);
  revalidatePath(`/companies/${companyId}/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/my-hours");
}

/** Manager "[ Mark Absent ]" / any status correction — thin wrapper over set_daily_attendance_status, reused from modules/daily-workforce so both Today's Teams and Absent Today share the exact same write path. */
export async function correctAbsenceStatus(companyId: string, projectId: string, employeeId: string, workDate: string, input: CorrectAbsenceStatusInput): Promise<ActionResult<{ status: string }>> {
  const parsed = correctAbsenceStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireAbsenceManageAccess(companyId, projectId);
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

  // Shares set_daily_attendance_status with modules/daily-workforce's own
  // setDailyAttendanceStatus (which can atomically move a worker on/off a
  // Today's Team and change their worked-hours eligibility) — revalidate
  // the same two extra paths that sibling action does, on top of the
  // absence-specific ones.
  revalidateAbsencePaths(companyId, projectId);
  revalidatePath(`/companies/${companyId}/projects/${projectId}/teams`);
  revalidatePath(`/companies/${companyId}/projects/${projectId}/worked-hours`);
  return { ok: true, data: { status: data.attendance.status } };
}

/** Manager "[ Close Absence Day ]" (Phase 5). */
export async function closeAbsenceDay(companyId: string, projectId: string, workDate: string): Promise<ActionResult<DailyAttendanceDayLock>> {
  await requireAbsenceManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("close_absence_day", { target_project_id: projectId, target_work_date: workDate }).single();
  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't close the absence day. Try again." } };
  }

  revalidateAbsencePaths(companyId, projectId);
  return { ok: true, data };
}

/** Manager "[ Reopen ]" a closed absence day — a reason is required (Phase 5). */
export async function reopenAbsenceDay(companyId: string, projectId: string, workDate: string, input: ReopenAbsenceDayInput): Promise<ActionResult<DailyAttendanceDayLock>> {
  const parsed = reopenAbsenceDaySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireAbsenceManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("reopen_absence_day", { target_project_id: projectId, target_work_date: workDate, target_reason: parsed.data.reason }).single();
  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't reopen the absence day. Try again." } };
  }

  revalidateAbsencePaths(companyId, projectId);
  return { ok: true, data };
}

/** Employee "[ Report Absence ]" (Phase 7) — RLS's absence_reports_insert policy enforces "own employee record only." */
export async function reportAbsence(companyId: string, projectId: string, input: ReportAbsenceInput): Promise<ActionResult<AbsenceReport>> {
  const parsed = reportAbsenceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireCompanyMembership(companyId);
  const employeeId = await getMyEmployeeId(companyId, user.id);
  if (!employeeId) {
    return { ok: false, error: { code: "server_error", message: "No employee record is linked to your account." } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("report_absence", {
      target_project_id: projectId,
      target_employee_id: employeeId,
      target_work_date: parsed.data.workDate,
      target_reason: parsed.data.reason as AbsenceReport["reason"],
      target_comment: (parsed.data.comment ?? null) as string,
    })
    .single();

  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't report absence. Try again." } };
  }

  revalidateAbsencePaths(companyId, projectId);
  revalidatePath("/dashboard");
  return { ok: true, data };
}

/** Manager "[ Confirm ]" a pending self-report — applies the effect to daily_attendance (Phase 7). */
export async function confirmAbsenceReport(companyId: string, projectId: string, reportId: string): Promise<ActionResult<AbsenceReport>> {
  await requireAbsenceManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("confirm_absence_report", { target_report_id: reportId }).single();
  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't confirm the report. Try again." } };
  }

  revalidateAbsencePaths(companyId, projectId);
  return { ok: true, data };
}

/** Manager "[ Reject ]" a pending self-report — a review note is required (Phase 7). */
export async function rejectAbsenceReport(companyId: string, projectId: string, reportId: string, input: RejectAbsenceReportInput): Promise<ActionResult<AbsenceReport>> {
  const parsed = rejectAbsenceReportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A review note is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireAbsenceManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("reject_absence_report", { target_report_id: reportId, target_review_note: parsed.data.reviewNote }).single();
  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't reject the report. Try again." } };
  }

  revalidateAbsencePaths(companyId, projectId);
  return { ok: true, data };
}
