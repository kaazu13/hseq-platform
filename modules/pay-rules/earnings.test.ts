import { describe, it, expect } from "vitest";
import { calculateEstimatedEarnings, sumEstimatedEarnings } from "./earnings";
import type { PayRule } from "./types";

function rule(overrides: Partial<PayRule>): PayRule {
  return {
    id: "rule-id",
    company_id: "company-id",
    category: "regular",
    calculation_type: "base_only",
    value: 0,
    currency: "EUR",
    stackable: true,
    effective_from: "2026-01-01",
    effective_to: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("calculateEstimatedEarnings — the user's own worked example", () => {
  it("base €20, 2 overtime hours at +20%, night premium +€2/h, Sunday premium +€3/h, all stackable -> hourly effective €20+€4+€2+€3", () => {
    const result = calculateEstimatedEarnings({
      hourlyRate: 20,
      currency: "EUR",
      breakdown: { regular: 0, overtime: 2, night: 2, travel: 0, other: 0 },
      isSunday: true,
      rulesByCategory: {
        overtime: rule({ category: "overtime", calculation_type: "percentage_extra", value: 20 }),
        night: rule({ category: "night", calculation_type: "fixed_extra_per_hour", value: 2 }),
        sunday: rule({ category: "sunday", calculation_type: "fixed_extra_per_hour", value: 3, stackable: true }),
      },
    });

    const overtimeLine = result.lineItems.find((l) => l.category === "overtime")!;
    // 2h: base 20*2=40, overtime premium 20*0.20*2=8, Sunday premium (stacks) 3*2=6 -> total 54
    expect(overtimeLine.basePay).toBe(40);
    expect(overtimeLine.categoryPremiumPay).toBe(8);
    expect(overtimeLine.sundayPremiumPay).toBe(6);
    expect(overtimeLine.totalPay).toBe(54);

    const nightLine = result.lineItems.find((l) => l.category === "night")!;
    // 2h: base 40, night premium 2*2=4, Sunday premium (stacks) 3*2=6 -> total 50
    expect(nightLine.basePay).toBe(40);
    expect(nightLine.categoryPremiumPay).toBe(4);
    expect(nightLine.sundayPremiumPay).toBe(6);
    expect(nightLine.totalPay).toBe(50);

    expect(result.total).toBe(54 + 50);
  });
});

describe("calculateEstimatedEarnings — overtime percentage", () => {
  it("applies percentage_extra as a fraction of the base hourly rate, per hour", () => {
    const result = calculateEstimatedEarnings({
      hourlyRate: 20,
      currency: "EUR",
      breakdown: { regular: 0, overtime: 3, night: 0, travel: 0, other: 0 },
      isSunday: false,
      rulesByCategory: { overtime: rule({ category: "overtime", calculation_type: "percentage_extra", value: 20 }) },
    });
    const line = result.lineItems.find((l) => l.category === "overtime")!;
    expect(line.basePay).toBe(60);
    expect(line.categoryPremiumPay).toBe(12); // 20 * 0.20 * 3
    expect(line.totalPay).toBe(72);
  });
});

describe("calculateEstimatedEarnings — night fixed premium", () => {
  it("applies fixed_extra_per_hour verbatim regardless of base rate", () => {
    const result = calculateEstimatedEarnings({
      hourlyRate: 18.5,
      currency: "EUR",
      breakdown: { regular: 0, overtime: 0, night: 4, travel: 0, other: 0 },
      isSunday: false,
      rulesByCategory: { night: rule({ category: "night", calculation_type: "fixed_extra_per_hour", value: 2 }) },
    });
    const line = result.lineItems.find((l) => l.category === "night")!;
    expect(line.categoryPremiumPay).toBe(8); // 2 * 4
    expect(line.totalPay).toBe(18.5 * 4 + 8);
  });
});

describe("calculateEstimatedEarnings — Sunday premium", () => {
  it("applies to regular hours (no own premium) on a Sunday", () => {
    const result = calculateEstimatedEarnings({
      hourlyRate: 20,
      currency: "EUR",
      breakdown: { regular: 8, overtime: 0, night: 0, travel: 0, other: 0 },
      isSunday: true,
      rulesByCategory: { sunday: rule({ category: "sunday", calculation_type: "fixed_extra_per_hour", value: 3 }) },
    });
    const line = result.lineItems.find((l) => l.category === "regular")!;
    expect(line.sundayPremiumPay).toBe(24); // 3 * 8
  });

  it("does NOT apply when isSunday is false, even with an active Sunday rule", () => {
    const result = calculateEstimatedEarnings({
      hourlyRate: 20,
      currency: "EUR",
      breakdown: { regular: 8, overtime: 0, night: 0, travel: 0, other: 0 },
      isSunday: false,
      rulesByCategory: { sunday: rule({ category: "sunday", calculation_type: "fixed_extra_per_hour", value: 3 }) },
    });
    expect(result.sundayPremiumTotal).toBe(0);
  });

  it("does NOT apply when the Sunday rule is base_only/disabled (value 0)", () => {
    const result = calculateEstimatedEarnings({
      hourlyRate: 20,
      currency: "EUR",
      breakdown: { regular: 8, overtime: 0, night: 0, travel: 0, other: 0 },
      isSunday: true,
      rulesByCategory: { sunday: rule({ category: "sunday", calculation_type: "base_only", value: 0 }) },
    });
    expect(result.sundayPremiumTotal).toBe(0);
  });
});

describe("calculateEstimatedEarnings — stacking behavior", () => {
  it("stackable=false: a category with its OWN premium (overtime) does NOT also get the Sunday premium", () => {
    const result = calculateEstimatedEarnings({
      hourlyRate: 20,
      currency: "EUR",
      breakdown: { regular: 0, overtime: 2, night: 0, travel: 0, other: 0 },
      isSunday: true,
      rulesByCategory: {
        overtime: rule({ category: "overtime", calculation_type: "percentage_extra", value: 20 }),
        sunday: rule({ category: "sunday", calculation_type: "fixed_extra_per_hour", value: 3, stackable: false }),
      },
    });
    const line = result.lineItems.find((l) => l.category === "overtime")!;
    expect(line.categoryPremiumPay).toBe(8); // unaffected
    expect(line.sundayPremiumPay).toBe(0); // withheld — non-stackable and overtime already carries its own premium
  });

  it("stackable=false: a category with NO premium of its own (regular) still gets the Sunday premium — nothing to withhold against", () => {
    const result = calculateEstimatedEarnings({
      hourlyRate: 20,
      currency: "EUR",
      breakdown: { regular: 8, overtime: 0, night: 0, travel: 0, other: 0 },
      isSunday: true,
      rulesByCategory: { sunday: rule({ category: "sunday", calculation_type: "fixed_extra_per_hour", value: 3, stackable: false }) },
    });
    const line = result.lineItems.find((l) => l.category === "regular")!;
    expect(line.sundayPremiumPay).toBe(24);
  });
});

describe("calculateEstimatedEarnings — no hidden calculation", () => {
  it("every category with hours produces a line item, zero-hour categories are omitted", () => {
    const result = calculateEstimatedEarnings({
      hourlyRate: 20,
      currency: "EUR",
      breakdown: { regular: 8, overtime: 0, night: 0, travel: 0, other: 0 },
      isSunday: false,
      rulesByCategory: {},
    });
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0].category).toBe("regular");
    expect(result.total).toBe(160);
  });
});

describe("sumEstimatedEarnings", () => {
  it("sums multiple days' totals into one period figure", () => {
    const day1 = calculateEstimatedEarnings({ hourlyRate: 20, currency: "EUR", breakdown: { regular: 8, overtime: 0, night: 0, travel: 0, other: 0 }, isSunday: false, rulesByCategory: {} });
    const day2 = calculateEstimatedEarnings({ hourlyRate: 20, currency: "EUR", breakdown: { regular: 4, overtime: 0, night: 0, travel: 0, other: 0 }, isSunday: false, rulesByCategory: {} });
    const summed = sumEstimatedEarnings([day1, day2]);
    expect(summed.total).toBe(160 + 80);
    expect(summed.lineItems).toHaveLength(2);
  });
});
