"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { canManagePayRules } from "./permissions";
import type { PayRuleCategory, PayRuleCalculationType } from "./types";

/** Part 10/18 — sets a company's rule for one category, close-then-insert (same immutable-history shape as setEmployeeHourlyRate()). Never rewrites a prior period. */
export async function setPayRule(
  companyId: string,
  input: { category: PayRuleCategory; calculationType: PayRuleCalculationType; value: number; currency: string; stackable: boolean; effectiveFrom: string },
): Promise<ActionResult<null>> {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, isSuperAdmin] = await Promise.all([getUserRoleNames(companyId), isPlatformSuperAdmin()]);
  if (!canManagePayRules(roleNames, isSuperAdmin)) forbidden();

  if (input.calculationType !== "base_only" && (!Number.isFinite(input.value) || input.value < 0)) {
    return { ok: false, error: { code: "validation_error", message: "Enter a valid, non-negative value.", fieldErrors: { value: "Enter a valid, non-negative value" } } };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    return { ok: false, error: { code: "validation_error", message: "Enter a valid effective date.", fieldErrors: { effectiveFrom: "Required" } } };
  }

  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase.from("pay_rules").select("id, effective_from").eq("company_id", companyId).eq("category", input.category).is("effective_to", null).maybeSingle();
  if (currentError) return { ok: false, error: { code: "server_error", message: "Couldn't load the current rule. Try again." } };

  if (current) {
    if (current.effective_from >= input.effectiveFrom) {
      return { ok: false, error: { code: "validation_error", message: "The new effective date must be after the current rule's start date.", fieldErrors: { effectiveFrom: "Must be later than the current rule's start date" } } };
    }
    const closeDate = new Date(`${input.effectiveFrom}T00:00:00Z`);
    closeDate.setUTCDate(closeDate.getUTCDate() - 1);
    const { error: closeError } = await supabase.from("pay_rules").update({ effective_to: closeDate.toISOString().slice(0, 10) }).eq("id", current.id);
    if (closeError) return { ok: false, error: { code: "server_error", message: "Couldn't close the previous rule period. Try again." } };
  }

  const { error: insertError } = await supabase.from("pay_rules").insert({
    company_id: companyId,
    category: input.category,
    calculation_type: input.calculationType,
    value: input.calculationType === "base_only" ? 0 : input.value,
    currency: input.currency.trim().toUpperCase() || "EUR",
    stackable: input.stackable,
    effective_from: input.effectiveFrom,
    created_by: user.id,
  });
  if (insertError) return { ok: false, error: { code: "server_error", message: "Couldn't save the rule. Try again." } };

  revalidatePath("/rate-requests");
  revalidatePath("/pay-rules");
  return { ok: true, data: null };
}
