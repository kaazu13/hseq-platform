import type { WorkedHoursCategory, WorkedHoursCategoryBreakdown } from "@/modules/worked-hours/types";
import type { PayRule, PayRuleCategory } from "./types";

export type EarningsLineItem = {
  category: WorkedHoursCategory;
  hours: number;
  basePay: number;
  categoryPremiumPay: number;
  sundayPremiumPay: number;
  totalPay: number;
};

export type EstimatedEarnings = {
  currency: string;
  lineItems: EarningsLineItem[];
  basePayTotal: number;
  categoryPremiumTotal: number;
  sundayPremiumTotal: number;
  total: number;
};

/**
 * Parts 13/14/17 — the deterministic estimated-earnings calculation.
 * NEVER retroactive: the caller must resolve `hourlyRate` and every rule
 * in `rulesByCategory`/`sundayRule` as whatever was EFFECTIVE on the
 * work date being calculated (see getEffectivePayRulesForDateRange() +
 * getCurrentEmployeeRate()-equivalent historical lookup) — this function
 * itself has no notion of "today" at all, purely arithmetic over
 * already-resolved inputs.
 *
 * Part 12's stacking rule, made explicit and deterministic: for a
 * category that already carries its own premium (overtime/night — a
 * non-base_only rule), the Sunday premium ALSO applies only if the
 * Sunday rule is marked `stackable`. For a category with no premium of
 * its own (regular/travel/other — base_only), the Sunday premium always
 * applies on a Sunday when the Sunday rule is active, regardless of
 * `stackable` (there is nothing to stack against). This guarantees no
 * hour is ever silently double-counted and no calculation is hidden —
 * every component of the total is broken out in `lineItems`.
 */
export function calculateEstimatedEarnings(params: {
  hourlyRate: number;
  currency: string;
  breakdown: WorkedHoursCategoryBreakdown;
  isSunday: boolean;
  rulesByCategory: Partial<Record<PayRuleCategory, PayRule>>;
  categories?: WorkedHoursCategory[];
}): EstimatedEarnings {
  const categories = params.categories ?? (["regular", "overtime", "night", "travel", "other"] as WorkedHoursCategory[]);
  const sundayRule = params.isSunday ? params.rulesByCategory.sunday : undefined;
  const sundayActive = Boolean(sundayRule && sundayRule.calculation_type !== "base_only" && sundayRule.value > 0);

  const lineItems: EarningsLineItem[] = [];
  let basePayTotal = 0;
  let categoryPremiumTotal = 0;
  let sundayPremiumTotal = 0;

  for (const category of categories) {
    const hours = params.breakdown[category] ?? 0;
    if (hours <= 0) continue;

    const basePay = round2(params.hourlyRate * hours);
    const rule = params.rulesByCategory[category as PayRuleCategory];
    const hasOwnPremium = Boolean(rule && rule.calculation_type !== "base_only" && rule.value > 0);
    const categoryPremiumPerHour = hasOwnPremium ? premiumPerHour(rule!, params.hourlyRate) : 0;
    const categoryPremiumPay = round2(categoryPremiumPerHour * hours);

    let sundayPremiumPay = 0;
    if (sundayActive && (!hasOwnPremium || sundayRule!.stackable)) {
      const sundayPerHour = premiumPerHour(sundayRule!, params.hourlyRate);
      sundayPremiumPay = round2(sundayPerHour * hours);
    }

    const totalPay = round2(basePay + categoryPremiumPay + sundayPremiumPay);
    lineItems.push({ category, hours, basePay, categoryPremiumPay, sundayPremiumPay, totalPay });
    basePayTotal = round2(basePayTotal + basePay);
    categoryPremiumTotal = round2(categoryPremiumTotal + categoryPremiumPay);
    sundayPremiumTotal = round2(sundayPremiumTotal + sundayPremiumPay);
  }

  return {
    currency: params.currency,
    lineItems,
    basePayTotal,
    categoryPremiumTotal,
    sundayPremiumTotal,
    total: round2(basePayTotal + categoryPremiumTotal + sundayPremiumTotal),
  };
}

/**
 * Part 12 — "Determine Sunday using work date + project timezone." The
 * work_date string is already the PROJECT's own local calendar date
 * (resolved once, at record time, via getProjectLocalDate() — the same
 * convention every other date-of-record in this app follows), so no
 * further timezone conversion happens here — treating it as a plain UTC
 * calendar date and asking "day 0" is the correct, timezone-safe check.
 */
export function isSundayDate(workDate: string): boolean {
  return new Date(`${workDate}T00:00:00Z`).getUTCDay() === 0;
}

function premiumPerHour(rule: PayRule, hourlyRate: number): number {
  if (rule.calculation_type === "percentage_extra") return hourlyRate * (rule.value / 100);
  if (rule.calculation_type === "fixed_extra_per_hour") return rule.value;
  return 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Sums a list of days' EstimatedEarnings into one period total — used for the monthly My Hours estimate (Part 14). */
export function sumEstimatedEarnings(days: EstimatedEarnings[]): Omit<EstimatedEarnings, "lineItems"> & { lineItems: EarningsLineItem[] } {
  let basePayTotal = 0;
  let categoryPremiumTotal = 0;
  let sundayPremiumTotal = 0;
  const lineItems: EarningsLineItem[] = [];
  const currency = days[0]?.currency ?? "EUR";
  for (const day of days) {
    basePayTotal = round2(basePayTotal + day.basePayTotal);
    categoryPremiumTotal = round2(categoryPremiumTotal + day.categoryPremiumTotal);
    sundayPremiumTotal = round2(sundayPremiumTotal + day.sundayPremiumTotal);
    lineItems.push(...day.lineItems);
  }
  return { currency, lineItems, basePayTotal, categoryPremiumTotal, sundayPremiumTotal, total: round2(basePayTotal + categoryPremiumTotal + sundayPremiumTotal) };
}
