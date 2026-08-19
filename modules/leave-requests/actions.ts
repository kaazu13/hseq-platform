"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { getMyEmployeeId } from "@/modules/daily-workforce/queries";
import { canManageDailyWorkforce } from "@/modules/daily-workforce/permissions";
import {
  requestLeaveSchema,
  resubmitLeaveRequestSchema,
  approveLeaveRequestSchema,
  denyLeaveRequestSchema,
  returnLeaveRequestSchema,
  type RequestLeaveInput,
  type ResubmitLeaveRequestInput,
  type ApproveLeaveRequestInput,
  type DenyLeaveRequestInput,
  type ReturnLeaveRequestInput,
} from "./validation";
import type { LeaveRequest } from "./types";

/**
 * Server Functions for Holiday/Leave requests (Phases 8-10). Same fixed
 * recipe as every other module — app-layer checks are a fast pre-filter;
 * RLS/the RPCs' own manual checks
 * (supabase/migrations/20260819092000_absence_and_leave.sql) are the real
 * enforcement.
 */

async function requireLeaveManageAccess(companyId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, myProjectAssignmentRoles, isSuperAdmin] = await Promise.all([
    getUserRoleNames(companyId),
    getMyProjectAssignmentRoles(companyId, projectId, user.id),
    isPlatformSuperAdmin(),
  ]);
  // Part G (Workforce attendance correction): platform_super_admin has global authority.
  if (!isSuperAdmin && !canManageDailyWorkforce(roleNames, myProjectAssignmentRoles)) forbidden();
  return { user, roleNames };
}

function revalidateLeavePaths(companyId: string, projectId: string) {
  revalidatePath(`/companies/${companyId}/projects/${projectId}/leave`);
  revalidatePath(`/companies/${companyId}/projects/${projectId}/absences`);
  revalidatePath("/my-leave");
  revalidatePath("/dashboard");
}

/** Employee "[ Request Holiday / Leave ]" (Phase 8) — a plain RLS-gated insert (leave_requests_insert enforces "own employee record only"); the leave_requests_notify_managers_insert trigger handles manager notification. */
export async function requestLeave(companyId: string, projectId: string, input: RequestLeaveInput): Promise<ActionResult<LeaveRequest>> {
  const parsed = requestLeaveSchema.safeParse(input);
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
    .from("leave_requests")
    .insert({
      company_id: companyId,
      project_id: projectId,
      employee_id: employeeId,
      leave_type: parsed.data.leaveType as LeaveRequest["leave_type"],
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      employee_comment: (parsed.data.comment ?? null) as string,
      requested_by: user.id,
    })
    .select()
    .single();

  if (error || !data) {
    if (isRlsViolation(error)) forbidden();
    return { ok: false, error: { code: "server_error", message: "Couldn't submit the leave request. Try again." } };
  }

  revalidateLeavePaths(companyId, projectId);
  return { ok: true, data };
}

/** Employee amends and resubmits a RETURNED request (Phase 8). */
export async function resubmitLeaveRequest(companyId: string, projectId: string, leaveRequestId: string, input: ResubmitLeaveRequestInput): Promise<ActionResult<LeaveRequest>> {
  const parsed = resubmitLeaveRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireCompanyMembership(companyId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("resubmit_leave_request", {
      target_request_id: leaveRequestId,
      target_start_date: parsed.data.startDate,
      target_end_date: parsed.data.endDate,
      target_leave_type: parsed.data.leaveType as LeaveRequest["leave_type"],
      target_comment: (parsed.data.comment ?? null) as string,
    })
    .single();

  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't resubmit the leave request. Try again." } };
  }

  revalidateLeavePaths(companyId, projectId);
  return { ok: true, data };
}

/** Manager "[ Approve ]" (Phase 8-9) — applies the leave across the full date range. */
export async function approveLeaveRequest(companyId: string, projectId: string, leaveRequestId: string, input: ApproveLeaveRequestInput): Promise<ActionResult<LeaveRequest>> {
  const parsed = approveLeaveRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the comment.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireLeaveManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("approve_leave_request", { target_request_id: leaveRequestId, target_comment: (parsed.data.comment ?? null) as string }).single();
  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't approve the leave request. Try again." } };
  }

  revalidateLeavePaths(companyId, projectId);
  return { ok: true, data };
}

/** Manager "[ Deny ]" — a comment is required (Phase 8-9). */
export async function denyLeaveRequest(companyId: string, projectId: string, leaveRequestId: string, input: DenyLeaveRequestInput): Promise<ActionResult<LeaveRequest>> {
  const parsed = denyLeaveRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A comment is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireLeaveManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("deny_leave_request", { target_request_id: leaveRequestId, target_comment: parsed.data.comment }).single();
  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't deny the leave request. Try again." } };
  }

  revalidateLeavePaths(companyId, projectId);
  return { ok: true, data };
}

/** Manager "[ Return for Changes ]" — a comment is required (Phase 8-9). */
export async function returnLeaveRequest(companyId: string, projectId: string, leaveRequestId: string, input: ReturnLeaveRequestInput): Promise<ActionResult<LeaveRequest>> {
  const parsed = returnLeaveRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A comment is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireLeaveManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("return_leave_request", { target_request_id: leaveRequestId, target_comment: parsed.data.comment }).single();
  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't return the leave request. Try again." } };
  }

  revalidateLeavePaths(companyId, projectId);
  return { ok: true, data };
}

/** Requesting employee OR a manager cancels a pending/returned/still-upcoming approved request (Phase 8). */
export async function cancelLeaveRequest(companyId: string, projectId: string, leaveRequestId: string): Promise<ActionResult<LeaveRequest>> {
  await requireCompanyMembership(companyId);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("cancel_leave_request", { target_request_id: leaveRequestId }).single();
  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't cancel the leave request. Try again." } };
  }

  revalidateLeavePaths(companyId, projectId);
  return { ok: true, data };
}
