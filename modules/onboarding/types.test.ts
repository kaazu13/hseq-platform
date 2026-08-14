import { describe, it, expect } from "vitest";
import { buildOnboardingChecklistItems, isOnboardingCoreComplete } from "./types";
import type { OnboardingChecklist } from "./types";

function baseChecklist(overrides: Partial<OnboardingChecklist> = {}): OnboardingChecklist {
  return {
    companyName: "Test Co",
    hasAdministrator: false,
    hasLogo: false,
    projectCount: 0,
    employeeCount: 0,
    projectAssignmentCount: 0,
    acceptedInvitationCount: 0,
    pendingInvitationCount: 0,
    ...overrides,
  };
}

describe("buildOnboardingChecklistItems", () => {
  it("marks company created as always done", () => {
    const items = buildOnboardingChecklistItems(baseChecklist());
    expect(items.find((i) => i.key === "company")?.done).toBe(true);
  });

  it("reflects administrator/logo/project/employee state accurately", () => {
    const items = buildOnboardingChecklistItems(baseChecklist({ hasAdministrator: true, hasLogo: true, projectCount: 2, employeeCount: 5 }));
    expect(items.find((i) => i.key === "admin")?.done).toBe(true);
    expect(items.find((i) => i.key === "logo")?.done).toBe(true);
    expect(items.find((i) => i.key === "project")?.detail).toContain("2 project");
    expect(items.find((i) => i.key === "employees")?.detail).toContain("5 employee");
  });

  it("never shows a percentage/score — every item is a plain done/not-done flag with a factual detail string", () => {
    const items = buildOnboardingChecklistItems(baseChecklist({ projectCount: 1, employeeCount: 1 }));
    for (const item of items) {
      expect(typeof item.done).toBe("boolean");
      if (item.detail) expect(item.detail).not.toMatch(/%/);
    }
  });

  it("invitations item is done when either accepted or pending invitations exist", () => {
    expect(buildOnboardingChecklistItems(baseChecklist({ pendingInvitationCount: 1 })).find((i) => i.key === "invitations")?.done).toBe(true);
    expect(buildOnboardingChecklistItems(baseChecklist({ acceptedInvitationCount: 1 })).find((i) => i.key === "invitations")?.done).toBe(true);
    expect(buildOnboardingChecklistItems(baseChecklist()).find((i) => i.key === "invitations")?.done).toBe(false);
  });
});

describe("isOnboardingCoreComplete", () => {
  it("requires an administrator, a project, AND an employee — logo/invitations never gate it", () => {
    expect(isOnboardingCoreComplete(baseChecklist({ hasAdministrator: true, projectCount: 1, employeeCount: 1 }))).toBe(true);
    expect(isOnboardingCoreComplete(baseChecklist({ hasAdministrator: true, projectCount: 1, employeeCount: 1, hasLogo: false, pendingInvitationCount: 0 }))).toBe(true);
  });

  it("is false while any core item is missing", () => {
    expect(isOnboardingCoreComplete(baseChecklist({ hasAdministrator: false, projectCount: 1, employeeCount: 1 }))).toBe(false);
    expect(isOnboardingCoreComplete(baseChecklist({ hasAdministrator: true, projectCount: 0, employeeCount: 1 }))).toBe(false);
    expect(isOnboardingCoreComplete(baseChecklist({ hasAdministrator: true, projectCount: 1, employeeCount: 0 }))).toBe(false);
  });
});
