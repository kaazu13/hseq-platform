import { z } from "zod";
import { optionalText } from "@/lib/validation";

/**
 * `updateOwnProfile` Server Function — a user editing their own basic
 * profile details. Item 10: `fullName` is deliberately NOT here — a user's
 * display name is no longer self-editable at all (only a Platform Super
 * Admin may change it, via admin_update_profile_name()); the DB trigger
 * (validate_profile_update()) is the real, non-bypassable enforcement,
 * this is just the app layer never offering the field in the first place.
 * Role/company/status stay read-only everywhere in the UI, unchanged.
 */
export const updateOwnProfileFormSchema = z.object({
  phone: optionalText,
});
export type UpdateOwnProfileFormInput = z.infer<typeof updateOwnProfileFormSchema>;

/** `updateCompanyName` — company branding (Phase 15). */
export const updateCompanyNameSchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(200, "Keep it under 200 characters"),
});
export type UpdateCompanyNameInput = z.infer<typeof updateCompanyNameSchema>;
