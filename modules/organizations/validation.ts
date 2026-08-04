import { z } from "zod";
import { optionalText } from "@/lib/validation";

/** `updateOwnProfile` Server Function — a user editing their own basic profile details (never role/organization/status, which stay read-only everywhere in the UI). */
export const updateOwnProfileFormSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  phone: optionalText,
});
export type UpdateOwnProfileFormInput = z.infer<typeof updateOwnProfileFormSchema>;
