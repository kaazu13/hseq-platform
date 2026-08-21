"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { getMyEmployeeId } from "@/modules/daily-workforce/queries";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { canReviewRateRequests } from "./permissions";

/** Part 5 — the employee submits a request for THEMSELVES only (own employeeId, resolved server-side from the caller's own profile, never client-supplied). Supports both "specific requested rate" and "review only, no amount" (requestedRate omitted). */
export async function submitRateRequest(companyId: string, input: { requestedRate?: number; reason?: string }): Promise<ActionResult<null>> {
  const { user } = await requireCompanyMembership(companyId);
  const myEmployeeId = await getMyEmployeeId(companyId, user.id);
  if (!myEmployeeId) {
    return { ok: false, error: { code: "not_found", message: "No employee record found for your account." } };
  }
  if (input.requestedRate !== undefined && (!Number.isFinite(input.requestedRate) || input.requestedRate < 0)) {
    return { ok: false, error: { code: "validation_error", message: "Enter a valid, non-negative rate.", fieldErrors: { requestedRate: "Enter a valid, non-negative rate" } } };
  }

  const supabase = await createClient();
  const { data: current } = await supabase.from("employee_hourly_rates").select("hourly_rate, currency").eq("company_id", companyId).eq("employee_id", myEmployeeId).is("effective_to", null).maybeSingle();

  const { error } = await supabase.from("employee_rate_requests").insert({
    company_id: companyId,
    employee_id: myEmployeeId,
    current_rate_at_request: current?.hourly_rate ?? null,
    requested_rate: input.requestedRate ?? null,
    currency: current?.currency ?? "EUR",
    reason: input.reason?.trim() || null,
    submitted_by: user.id,
  });
  if (error) return { ok: false, error: { code: "server_error", message: "Couldn't submit the request. Try again." } };

  revalidatePath("/account/rates");
  revalidatePath("/dashboard");
  return { ok: true, data: null };
}

/** Part 5 — the requesting employee may withdraw their own still-pending request. RLS's own WITH CHECK (status = 'withdrawn' AND own employee row) is the real gate; this action just calls the same UPDATE. */
export async function withdrawRateRequest(companyId: string, requestId: string): Promise<ActionResult<null>> {
  await requireCompanyMembership(companyId);
  const supabase = await createClient();
  const { error, count } = await supabase.from("employee_rate_requests").update({ status: "withdrawn" }, { count: "exact" }).eq("id", requestId).eq("company_id", companyId).eq("status", "pending");
  if (error) return { ok: false, error: { code: "server_error", message: "Couldn't withdraw the request. Try again." } };
  if (count === 0) return { ok: false, error: { code: "not_found", message: "Request not found or no longer pending." } };
  revalidatePath("/account/rates");
  return { ok: true, data: null };
}

/** Part 7 — company_admin/planner/platform_super_admin only. Calls approve_employee_rate_request(), which atomically closes the prior rate period and inserts the new one. */
export async function approveRateRequest(companyId: string, requestId: string, input: { approvedRate: number; effectiveFrom: string; decisionReason?: string }): Promise<ActionResult<null>> {
  const [roleNames, isSuperAdmin] = await Promise.all([getUserRoleNames(companyId), isPlatformSuperAdmin()]);
  if (!canReviewRateRequests(roleNames, isSuperAdmin)) forbidden();

  if (!Number.isFinite(input.approvedRate) || input.approvedRate < 0) {
    return { ok: false, error: { code: "validation_error", message: "Enter a valid, non-negative rate.", fieldErrors: { approvedRate: "Enter a valid, non-negative rate" } } };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    return { ok: false, error: { code: "validation_error", message: "Enter a valid effective date.", fieldErrors: { effectiveFrom: "Required" } } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_employee_rate_request", {
    target_request_id: requestId,
    target_approved_rate: input.approvedRate,
    target_effective_from: input.effectiveFrom,
    target_decision_reason: input.decisionReason?.trim() || undefined,
  });
  if (error) return { ok: false, error: { code: "server_error", message: error.message } };

  revalidatePath("/rate-requests");
  return { ok: true, data: null };
}

/** Part 7 — company_admin/planner/platform_super_admin only. Decision reason is mandatory. */
export async function rejectRateRequest(companyId: string, requestId: string, decisionReason: string): Promise<ActionResult<null>> {
  const [roleNames, isSuperAdmin] = await Promise.all([getUserRoleNames(companyId), isPlatformSuperAdmin()]);
  if (!canReviewRateRequests(roleNames, isSuperAdmin)) forbidden();

  if (!decisionReason.trim()) {
    return { ok: false, error: { code: "validation_error", message: "A decision reason is required.", fieldErrors: { decisionReason: "Required" } } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_employee_rate_request", { target_request_id: requestId, target_decision_reason: decisionReason.trim() });
  if (error) return { ok: false, error: { code: "server_error", message: error.message } };

  revalidatePath("/rate-requests");
  return { ok: true, data: null };
}
