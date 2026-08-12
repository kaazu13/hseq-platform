import { z } from "zod";
import { optionalText } from "@/lib/validation";

/** `updateOwnProfile` Server Function — a user editing their own basic profile details (never role/company/status, which stay read-only everywhere in the UI). */
export const updateOwnProfileFormSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(200, "Keep it under 200 characters"),
  phone: optionalText,
});
export type UpdateOwnProfileFormInput = z.infer<typeof updateOwnProfileFormSchema>;

/** `updateCompanyName` — company branding (Phase 15). */
export const updateCompanyNameSchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(200, "Keep it under 200 characters"),
});
export type UpdateCompanyNameInput = z.infer<typeof updateCompanyNameSchema>;
