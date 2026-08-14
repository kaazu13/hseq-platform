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
