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
