import { z } from "zod";

export const suspendAccountSchema = z.object({ reason: z.string().trim().min(1, "A reason is required").max(2000, "Keep it under 2000 characters") });
export type SuspendAccountInput = z.infer<typeof suspendAccountSchema>;

export const banAccountSchema = z.object({ reason: z.string().trim().min(1, "A reason is required").max(2000, "Keep it under 2000 characters") });
export type BanAccountInput = z.infer<typeof banAccountSchema>;

export const restoreAccountSchema = z.object({ reason: z.string().trim().max(2000, "Keep it under 2000 characters").optional() });
export type RestoreAccountInput = z.infer<typeof restoreAccountSchema>;

export const issuePlatformWarningSchema = z.object({ reason: z.string().trim().min(1, "A reason is required").max(2000, "Keep it under 2000 characters") });
export type IssuePlatformWarningInput = z.infer<typeof issuePlatformWarningSchema>;

/** Item 10: the ONE authorized path to change another user's name — Platform Super Admin only. */
export const adminUpdateUserNameSchema = z.object({ fullName: z.string().trim().min(1, "A name is required").max(200, "Keep it under 200 characters") });
export type AdminUpdateUserNameInput = z.infer<typeof adminUpdateUserNameSchema>;

/** Onboarding item 1 — Create Company. Slug/prefix are optional; create_company() derives safe values server-side when omitted, so this schema only rejects a slug/prefix the caller DID type but typed unsafely (still re-derived/deduped by the RPC either way — this is a fast client-side hint, not the real validation). */
export const createCompanySchema = z.object({
  name: z.string().trim().min(1, "A company name is required").max(200, "Keep it under 200 characters"),
  slug: z
    .string()
    .trim()
    .max(80, "Keep it under 80 characters")
    .regex(/^[a-z0-9-]*$/, "Lowercase letters, numbers, and hyphens only")
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  employeeNumberPrefix: z
    .string()
    .trim()
    .max(20, "Keep it under 20 characters")
    .regex(/^[A-Za-z0-9]*$/, "Letters and numbers only")
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

/** Onboarding item 2, path A — grant an EXISTING platform account membership in a company directly (no invitation round-trip). */
export const grantCompanyMembershipSchema = z.object({
  userId: z.string().uuid("Select an account"),
  roleNames: z.array(z.string()).min(1, "At least one role is required"),
});
export type GrantCompanyMembershipInput = z.infer<typeof grantCompanyMembershipSchema>;

/**
 * Part 2 — Roles & Permissions page. Mirrors create_custom_role()/
 * update_custom_role_permissions()'s own validation exactly (name length,
 * description length) as a fast client-side hint; the RPCs re-validate
 * server-side regardless, including the reserved-permission and
 * unrecognized-key checks this schema deliberately does NOT duplicate
 * (that catalogue can only be known server-side, at call time).
 */
export const createCustomRoleSchema = z.object({
  companyId: z.string().uuid("Select a company"),
  name: z.string().trim().min(1, "A role name is required").max(100, "Keep it under 100 characters"),
  description: z.string().trim().max(500, "Keep it under 500 characters").optional(),
  permissionKeys: z.array(z.string()),
});
export type CreateCustomRoleInput = z.infer<typeof createCustomRoleSchema>;

export const updateCustomRolePermissionsSchema = z.object({
  permissionKeys: z.array(z.string()),
});
export type UpdateCustomRolePermissionsInput = z.infer<typeof updateCustomRolePermissionsSchema>;

/** Part 2 — Usage & Billing. Mirrors upsert_company_subscription()'s own constraints (positive limits, bounded text lengths). */
export const upsertCompanySubscriptionSchema = z.object({
  planName: z.string().trim().max(100, "Keep it under 100 characters").optional(),
  subscriptionStatus: z.enum(["trialing", "active", "past_due", "canceled", "paused"]),
  employeeLimit: z.coerce.number().int().positive("Must be a positive number").optional(),
  projectLimit: z.coerce.number().int().positive("Must be a positive number").optional(),
  billingRenewalDate: z.string().trim().optional(),
  notes: z.string().trim().max(2000, "Keep it under 2000 characters").optional(),
});
export type UpsertCompanySubscriptionInput = z.infer<typeof upsertCompanySubscriptionSchema>;
