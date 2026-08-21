import type { Database } from "@/types/database";

export type PayRule = Database["public"]["Tables"]["pay_rules"]["Row"];
export type PayRuleCategory = Database["public"]["Enums"]["pay_rule_category"];
export type PayRuleCalculationType = Database["public"]["Enums"]["pay_rule_calculation_type"];

export const PAY_RULE_CATEGORIES: PayRuleCategory[] = ["regular", "overtime", "night", "travel", "other", "sunday"];

export const PAY_RULE_CATEGORY_LABELS: Record<PayRuleCategory, string> = {
  regular: "Regular",
  overtime: "Overtime",
  night: "Night",
  travel: "Travel",
  other: "Other",
  sunday: "Sunday",
};

export const PAY_RULE_CALCULATION_TYPE_LABELS: Record<PayRuleCalculationType, string> = {
  base_only: "Base rate only",
  percentage_extra: "Percentage extra",
  fixed_extra_per_hour: "Fixed extra per hour",
};

/** Human-readable summary of one rule — "Base hourly rate" / "+20%" / "+€2.00/hour". Never a raw calculation_type string. */
export function formatPayRuleValue(rule: Pick<PayRule, "calculation_type" | "value" | "currency">): string {
  if (rule.calculation_type === "base_only") return "Base hourly rate";
  if (rule.calculation_type === "percentage_extra") return `+${rule.value}%`;
  return `+${rule.value.toFixed(2)} ${rule.currency}/hour`;
}
