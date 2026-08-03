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

export const toolboxTemplateMetadataSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  category: z.enum(HSEQ_DOCUMENT_CATEGORY_VALUES),
  language: z.string().trim().min(1, "Language is required"),
  description: optionalText,
});
export type ToolboxTemplateMetadataInput = z.infer<typeof toolboxTemplateMetadataSchema>;

export const toolboxTemplateEditFormSchema = toolboxTemplateMetadataSchema;
export type ToolboxTemplateEditFormInput = z.infer<typeof toolboxTemplateEditFormSchema>;

export const replaceFileReasonSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required"),
});
export type ReplaceFileReasonInput = z.infer<typeof replaceFileReasonSchema>;
