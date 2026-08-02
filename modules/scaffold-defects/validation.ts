import { z } from "zod";
import { optionalText } from "@/lib/validation";

/**
 * Server Function validation for the Scaffold Defects domain — mirrors
 * modules/corrective-actions/validation.ts's shape exactly.
 */

const SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const;

const requiredDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

/** Create/edit core fields — only a manage-tier role may touch these (validate_scaffold_defect_update() in the migration enforces it at the database level too). */
export const scaffoldDefectFormSchema = z.object({
  description: z.string().trim().min(1, "Description is required"),
  severity: z.enum(SEVERITY_VALUES),
  responsiblePersonId: z.string().uuid("Choose a responsible person"),
  dueDate: requiredDate,
  immediateControl: optionalText,
  inspectionItemId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" || value === undefined ? undefined : value))
    .pipe(z.string().uuid().optional()),
});
export type ScaffoldDefectFormInput = z.infer<typeof scaffoldDefectFormSchema>;

/** Progress update — moving open → in_progress → awaiting_verification, available to the defect's own responsible person regardless of their module-level role. */
const PROGRESS_STATUS_VALUES = ["open", "in_progress", "awaiting_verification"] as const;
export const scaffoldDefectProgressFormSchema = z.object({
  status: z.enum(PROGRESS_STATUS_VALUES),
  completionNotes: optionalText,
});
export type ScaffoldDefectProgressFormInput = z.infer<typeof scaffoldDefectProgressFormSchema>;

/** Closing (verifying) an awaiting_verification defect. */
export const scaffoldDefectCloseFormSchema = z.object({
  verificationNotes: optionalText,
});
export type ScaffoldDefectCloseFormInput = z.infer<typeof scaffoldDefectCloseFormSchema>;

/** Rejecting an awaiting_verification defect, or reopening a closed/rejected one — both require a reason. */
export const scaffoldDefectReasonFormSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required"),
});
export type ScaffoldDefectReasonFormInput = z.infer<typeof scaffoldDefectReasonFormSchema>;
