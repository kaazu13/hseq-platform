import { describe, it, expect } from "vitest";
import { canReviewRateRequests, canReadProjectRateRequests } from "./permissions";
import type { RoleName } from "@/modules/companies/types";

describe("canReviewRateRequests", () => {
  it("grants company_admin and planner", () => {
    expect(canReviewRateRequests(["company_admin"], false)).toBe(true);
    expect(canReviewRateRequests(["planner"], false)).toBe(true);
  });

  it("grants platform_super_admin globally regardless of company roles", () => {
    expect(canReviewRateRequests([], true)).toBe(true);
  });

  it("denies project_manager — read-only, never a decision authority", () => {
    expect(canReviewRateRequests(["project_manager"], false)).toBe(false);
  });

  it("denies operations_manager — no standing over compensation at all", () => {
    expect(canReviewRateRequests(["operations_manager"], false)).toBe(false);
  });

  it("denies a plain employee, even for their own request", () => {
    expect(canReviewRateRequests(["employee" as RoleName], false)).toBe(false);
  });
});

describe("canReadProjectRateRequests", () => {
  it("grants a project_manager assignment on the target project", () => {
    expect(canReadProjectRateRequests(["project_manager"])).toBe(true);
  });

  it("denies every other assignment role — read-only visibility is PM-specific, not a general workforce-manager grant", () => {
    expect(canReadProjectRateRequests(["foreman"])).toBe(false);
    expect(canReadProjectRateRequests(["member"])).toBe(false);
    expect(canReadProjectRateRequests([])).toBe(false);
  });
});
