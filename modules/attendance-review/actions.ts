"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireCompanyMembership, requireUser, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { getMyEmployeeId } from "@/modules/daily-workforce/queries";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRaisedException, isUniqueViolation } from "@/lib/supabase/errors";
import { canReviewAttendance } from "./permissions";
import { requestAttendanceReviewSchema, acceptAttendanceReviewSchema, rejectAttendanceReviewSchema, type RequestAttendanceReviewInput, type AcceptAttendanceReviewInput, type RejectAttendanceReviewInput } from "./validation";
import type { AttendanceReviewRequest } from "./types";
import type { Database } from "@/types/database";

/**
 * Server Functions for the Task 3 Part 19 attendance-review workflow —
 * same fixed recipe as every other module (docs/API_CONVENTIONS.md §3).
 */

/** Employee "[ Request review ]" on My Hours' Absences tab — own record only; requestAttendanceReview()'s own RLS/composite FK is the real, non-bypassable scoping. */
export async function requestAttendanceReview(companyId: string, projectId: string, workDate: string, input: RequestAttendanceReviewInput): Promise<ActionResult<AttendanceReviewRequest>> {
  const parsed = requestAttendanceReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireCompanyMembership(companyId);
  const myEmployeeId = await getMyEmployeeId(companyId, user.id);
  if (!myEmployeeId) {
    return { ok: false, error: { code: "validation_error", message: "You don't have a linked employee record in this company." } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_attendance_review", {
    target_project_id: projectId,
    target_employee_id: myEmployeeId,
    target_work_date: workDate,
    target_explanation: parsed.data.explanation,
  });

  if (error || !data) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: { code: "conflict", message: "You already have a pending review request for this day." } };
    }
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't submit your review request. Try again." } };
  }

  revalidatePath("/my-hours");
  return { ok: true, data };
}

async function requireAttendanceReviewerAccess(companyId: string, projectId: string) {
  const { user } = await requireUser();
  if (await isPlatformSuperAdmin()) {
    return { user };
  }
  await requireCompanyMembership(companyId);
  const [roleNames, myProjectRoles] = await Promise.all([getUserRoleNames(companyId), getMyProjectAssignmentRoles(companyId, projectId, user.id)]);
  if (!canReviewAttendance(roleNames, myProjectRoles)) {
    forbidden();
  }
  return { user };
}

/** Reviewer "[ Accept ]" — supplies the corrected status + a required note; accept_attendance_review() applies the correction in the same atomic step (via set_daily_attendance_status()). */
export async function acceptAttendanceReview(companyId: string, projectId: string, requestId: string, input: AcceptAttendanceReviewInput): Promise<ActionResult<AttendanceReviewRequest>> {
  const parsed = acceptAttendanceReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireAttendanceReviewerAccess(companyId, projectId);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_attendance_review", {
    target_request_id: requestId,
    target_corrected_status: parsed.data.correctedStatus as Database["public"]["Enums"]["daily_attendance_status"],
    target_review_note: parsed.data.reviewNote,
    target_reason: parsed.data.reason,
  });

  if (error || !data) {
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't accept the review. Try again." } };
  }

  revalidatePath(`/companies/${companyId}/projects/${projectId}/absences`);
  return { ok: true, data };
}

/** Reviewer "[ Reject ]" — a review note is required. */
export async function rejectAttendanceReview(companyId: string, projectId: string, requestId: string, input: RejectAttendanceReviewInput): Promise<ActionResult<AttendanceReviewRequest>> {
  const parsed = rejectAttendanceReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireAttendanceReviewerAccess(companyId, projectId);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reject_attendance_review", {
    target_request_id: requestId,
    target_review_note: parsed.data.reviewNote,
  });

  if (error || !data) {
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't reject the review. Try again." } };
  }

  revalidatePath(`/companies/${companyId}/projects/${projectId}/absences`);
  return { ok: true, data };
}
