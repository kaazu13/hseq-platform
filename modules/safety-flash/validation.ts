import { z } from "zod";
import { optionalText } from "@/lib/validation";

const HSEQ_DOCUMENT_CATEGORY_VALUES = [
  "working_at_height",
  "line_of_fire",
  "material_handling",
  "falling_objects",
  "scaffold_erection_dismantling",
  "scaffold_inspection",
  "ppe",
  "access_egress",
  "housekeeping",
  "lifting_operations",
  "mewp_mobile_equipment",
  "tools_equipment",
  "weather_conditions",
  "emergency_response",
  "alcohol_drugs",
  "fit_for_work",
  "incident_lessons_learned",
  "other",
] as const;

export const safetyFlashMetadataSchema = z.object({
  projectId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" || value === undefined ? undefined : value))
    .pipe(z.string().uuid().optional()),
  title: z.string().trim().min(1, "Title is required").max(200, "Keep it under 200 characters"),
  dateIssued: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  category: z.enum(HSEQ_DOCUMENT_CATEGORY_VALUES),
  language: z.string().trim().min(1, "Language is required").max(50, "Keep it under 50 characters"),
  issuedByEmployeeId: z.string().uuid("Choose who issued this Safety Flash"),
  summary: optionalText,
});
export type SafetyFlashMetadataInput = z.infer<typeof safetyFlashMetadataSchema>;

export const safetyFlashEditFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Keep it under 200 characters"),
  dateIssued: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  category: z.enum(HSEQ_DOCUMENT_CATEGORY_VALUES),
  language: z.string().trim().min(1, "Language is required").max(50, "Keep it under 50 characters"),
  issuedByEmployeeId: z.string().uuid("Choose who issued this Safety Flash"),
  summary: optionalText,
});
export type SafetyFlashEditFormInput = z.infer<typeof safetyFlashEditFormSchema>;

export const replaceFileReasonSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required").max(2000, "Keep it under 2000 characters"),
});
export type ReplaceFileReasonInput = z.infer<typeof replaceFileReasonSchema>;
