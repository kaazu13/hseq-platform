"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { canManageEmployeeRates } from "./permissions";

/**
 * Sets a new current hourly rate for `employeeId`, closing whatever rate
 * period was previously open (Part 17 — "never overwritten," a new
 * immutable row every time). The DB's employee_hourly_rates_one_current_
 * per_employee unique index is the real guarantee against two open rows;
 * this action just performs the close-then-insert in the right order.
 */
export async function setEmployeeHourlyRate(
  companyId: string,
  employeeId: string,
  input: { hourlyRate: number; currency: string; effectiveFrom: string; reason?: string },
): Promise<ActionResult<null>> {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, isSuperAdmin] = await Promise.all([getUserRoleNames(companyId), isPlatformSuperAdmin()]);
  if (!canManageEmployeeRates(roleNames, isSuperAdmin)) {
    forbidden();
  }

  if (!Number.isFinite(input.hourlyRate) || input.hourlyRate < 0) {
    return { ok: false, error: { code: "validation_error", message: "Enter a valid hourly rate.", fieldErrors: { hourlyRate: "Enter a valid, non-negative rate" } } };
  }
  if (!input.currency.trim()) {
    return { ok: false, error: { code: "validation_error", message: "Currency is required.", fieldErrors: { currency: "Required" } } };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    return { ok: false, error: { code: "validation_error", message: "Enter a valid effective date.", fieldErrors: { effectiveFrom: "Required" } } };
  }

  const supabase = await createClient();

  const { data: current, error: currentError } = await supabase
    .from("employee_hourly_rates")
    .select("id, effective_from")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .is("effective_to", null)
    .maybeSingle();
  if (currentError) return { ok: false, error: { code: "server_error", message: "Couldn't load the current rate. Try again." } };

  if (current) {
    if (current.effective_from >= input.effectiveFrom) {
      return { ok: false, error: { code: "validation_error", message: "The new effective date must be after the current rate's start date.", fieldErrors: { effectiveFrom: "Must be later than the current rate's start date" } } };
    }
    const closeDate = new Date(`${input.effectiveFrom}T00:00:00Z`);
    closeDate.setUTCDate(closeDate.getUTCDate() - 1);
    const { error: closeError } = await supabase.from("employee_hourly_rates").update({ effective_to: closeDate.toISOString().slice(0, 10) }).eq("id", current.id);
    if (closeError) return { ok: false, error: { code: "server_error", message: "Couldn't close the previous rate period. Try again." } };
  }

  const { error: insertError } = await supabase.from("employee_hourly_rates").insert({
    company_id: companyId,
    employee_id: employeeId,
    hourly_rate: input.hourlyRate,
    currency: input.currency.trim().toUpperCase(),
    effective_from: input.effectiveFrom,
    reason: input.reason?.trim() || null,
    changed_by: user.id,
  });
  if (insertError) return { ok: false, error: { code: "server_error", message: "Couldn't save the new rate. Try again." } };

  revalidatePath("/account/rates");
  return { ok: true, data: null };
}
