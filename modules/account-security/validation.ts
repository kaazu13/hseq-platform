import { z } from "zod";

/**
 * Task 3 Part 31 — self-service password change. The 8-character minimum
 * matches the ONLY other password-entry point in this codebase
 * (modules/invitations/components/accept-invite-form.tsx's client-side
 * check and modules/invitations/actions.ts's server-side one) rather than
 * inventing a second policy.
 */
export const changeMyPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "New password must be different from your current password.",
    path: ["newPassword"],
  });

export type ChangeMyPasswordInput = z.infer<typeof changeMyPasswordSchema>;
