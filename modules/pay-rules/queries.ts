import { createClient } from "@/lib/supabase/server";
import type { PayRule, PayRuleCategory } from "./types";

/** Every currently-open (effective_to IS NULL) pay rule for the company, one per category at most — the "what applies right now" view (Pay Rules admin page). */
export async function listCurrentPayRules(companyId: string): Promise<PayRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pay_rules").select("*").eq("company_id", companyId).is("effective_to", null);
  if (error) throw error;
  return data ?? [];
}

/** Full effective-dated history for one category — never used for a live calculation (see getEffectivePayRules below for that), only for the admin page's own audit view. */
export async function listPayRuleHistory(companyId: string, category: PayRuleCategory): Promise<PayRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pay_rules").select("*").eq("company_id", companyId).eq("category", category).order("effective_from", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Part 13/17 — the rule effective ON a SPECIFIC historical work date, per
 * category, for the Estimated Earnings engine. Never "today's rule
 * applied retroactively" — this is the exact mechanism that guarantees
 * historical correctness. One bounded query per category set (batched
 * below via getEffectivePayRulesForDateRange), never per-hour-row.
 */
export async function getEffectivePayRulesForDateRange(companyId: string, fromDate: string, toDate: string): Promise<PayRule[]> {
  const supabase = await createClient();
  // Every rule whose effective window could possibly overlap [fromDate, toDate]: started on/before toDate, and either still open or ended on/after fromDate.
  const { data, error } = await supabase.from("pay_rules").select("*").eq("company_id", companyId).lte("effective_from", toDate).or(`effective_to.is.null,effective_to.gte.${fromDate}`);
  if (error) throw error;
  return data ?? [];
}

/** Pure resolution over an already-fetched rule set — picks, per category, the ONE rule whose window contains workDate. Never a network call, so the monthly earnings calculation can call this per-day without re-fetching. */
export function resolveEffectivePayRules(rules: PayRule[], workDate: string): Partial<Record<PayRule["category"], PayRule>> {
  const result: Partial<Record<PayRule["category"], PayRule>> = {};
  for (const rule of rules) {
    if (rule.effective_from <= workDate && (rule.effective_to === null || rule.effective_to >= workDate)) {
      result[rule.category] = rule;
    }
  }
  return result;
}
