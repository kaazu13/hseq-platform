import { describe, it, expect } from "vitest";
import { suspendAccountSchema, banAccountSchema, issuePlatformWarningSchema, adminUpdateUserNameSchema, createCustomRoleSchema, updateCustomRolePermissionsSchema, upsertCompanySubscriptionSchema } from "./validation";

describe("suspendAccountSchema", () => {
  it("requires a non-blank reason", () => {
    expect(suspendAccountSchema.safeParse({ reason: "Repeated policy violations" }).success).toBe(true);
    expect(suspendAccountSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(suspendAccountSchema.safeParse({ reason: "   " }).success).toBe(false);
  });
});

describe("banAccountSchema", () => {
  it("requires a non-blank reason", () => {
    expect(banAccountSchema.safeParse({ reason: "Confirmed fraudulent activity" }).success).toBe(true);
    expect(banAccountSchema.safeParse({ reason: "" }).success).toBe(false);
  });
});

describe("issuePlatformWarningSchema", () => {
  it("requires a non-blank reason", () => {
    expect(issuePlatformWarningSchema.safeParse({ reason: "Inappropriate use of shared documents" }).success).toBe(true);
    expect(issuePlatformWarningSchema.safeParse({ reason: "" }).success).toBe(false);
  });
});

describe("adminUpdateUserNameSchema — item 10: the Platform Super Admin's dedicated rename path", () => {
  it("requires a non-blank name", () => {
    expect(adminUpdateUserNameSchema.safeParse({ fullName: "Corrected Name" }).success).toBe(true);
    expect(adminUpdateUserNameSchema.safeParse({ fullName: "" }).success).toBe(false);
    expect(adminUpdateUserNameSchema.safeParse({ fullName: "   " }).success).toBe(false);
  });

  it("rejects an oversized name", () => {
    expect(adminUpdateUserNameSchema.safeParse({ fullName: "x".repeat(201) }).success).toBe(false);
  });
});

describe("createCustomRoleSchema — Part 2 Roles & Permissions", () => {
  const base = { companyId: "11111111-1111-4111-8111-111111111111", name: "Site Coordinator", permissionKeys: ["scaffold.view"] };

  it("accepts a valid role with a company id, name, and permission list", () => {
    expect(createCustomRoleSchema.safeParse(base).success).toBe(true);
  });

  it("accepts an empty permission list (a role can legitimately grant nothing yet)", () => {
    expect(createCustomRoleSchema.safeParse({ ...base, permissionKeys: [] }).success).toBe(true);
  });

  it("requires a non-blank name", () => {
    expect(createCustomRoleSchema.safeParse({ ...base, name: "" }).success).toBe(false);
    expect(createCustomRoleSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
  });

  it("rejects an oversized name or description", () => {
    expect(createCustomRoleSchema.safeParse({ ...base, name: "x".repeat(101) }).success).toBe(false);
    expect(createCustomRoleSchema.safeParse({ ...base, description: "x".repeat(501) }).success).toBe(false);
  });

  it("requires a valid uuid company id", () => {
    expect(createCustomRoleSchema.safeParse({ ...base, companyId: "not-a-uuid" }).success).toBe(false);
  });

  it("does NOT reject a reserved permission key client-side — that check can only be done server-side against the live catalogue (see this schema's own comment)", () => {
    // The schema accepts any string key; is_reserved rejection happens
    // inside create_custom_role()/update_custom_role_permissions() only.
    expect(createCustomRoleSchema.safeParse({ ...base, permissionKeys: ["company_admin.manage"] }).success).toBe(true);
  });
});

describe("updateCustomRolePermissionsSchema", () => {
  it("accepts any permission key list, including empty", () => {
    expect(updateCustomRolePermissionsSchema.safeParse({ permissionKeys: [] }).success).toBe(true);
    expect(updateCustomRolePermissionsSchema.safeParse({ permissionKeys: ["lmra.view", "lmra.create"] }).success).toBe(true);
  });
});

describe("upsertCompanySubscriptionSchema — Part 9 billing foundation UI", () => {
  it("accepts a minimal valid input (status only)", () => {
    expect(upsertCompanySubscriptionSchema.safeParse({ subscriptionStatus: "trialing" }).success).toBe(true);
  });

  it("rejects an invalid subscription status", () => {
    expect(upsertCompanySubscriptionSchema.safeParse({ subscriptionStatus: "not_a_real_status" }).success).toBe(false);
  });

  it("rejects a non-positive employee/project limit", () => {
    expect(upsertCompanySubscriptionSchema.safeParse({ subscriptionStatus: "active", employeeLimit: 0 }).success).toBe(false);
    expect(upsertCompanySubscriptionSchema.safeParse({ subscriptionStatus: "active", projectLimit: -5 }).success).toBe(false);
  });

  it("accepts a positive employee/project limit", () => {
    expect(upsertCompanySubscriptionSchema.safeParse({ subscriptionStatus: "active", employeeLimit: 50, projectLimit: 10 }).success).toBe(true);
  });
});
