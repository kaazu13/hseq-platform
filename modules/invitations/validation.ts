import { z } from "zod";
import { optionalText } from "@/lib/validation";
import { ROLE_NAMES } from "@/modules/companies/types";

const assignableRoleSchema = z.enum(ROLE_NAMES.filter((name) => name !== "platform_super_admin") as [string, ...string[]]);

/** Item 13 — invite a new member (or activate a pre-existing draft employee). `employeeId` links to an existing draft record when set; omitted means accept_invitation() creates a brand-new minimal employee from `fullName`. */
export const inviteMemberSchema = z.object({
  email: z.string().trim().min(1, "An email address is required").email("Enter a valid email address"),
  fullName: z.string().trim().min(1, "A name is required").max(200, "Keep it under 200 characters"),
  roleNames: z.array(assignableRoleSchema).min(1, "At least one role is required"),
  projectId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const revokeInvitationSchema = z.object({ reason: optionalText });
export type RevokeInvitationInput = z.infer<typeof revokeInvitationSchema>;
