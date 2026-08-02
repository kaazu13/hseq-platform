import { z } from "zod";
import { optionalText } from "@/lib/validation";

/**
 * Server Function validation for the Corrective Actions domain — see
 * docs/API_CONVENTIONS.md §5 and modules/lmra/validation.ts for the
 * established shape.
 */

// `as const` tuple, not a cast of the mutable CORRECTIVE_ACTION_PRIORITIES
// array — see modules/observations/validation.ts's comment on why.
const PRIORITY_VALUES = ["low", "medium", "high", "critical"] as const;

const requiredDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

/** Create/edit core fields — description, responsible person, priority, due date. Only a manage-tier role may touch these (validate_corrective_action_update() in the migration enforces it at the database level too). */
export const correctiveActionFormSchema = z.object({
  description: z.string().trim().min(1, "Description is required"),
  responsiblePersonId: z.string().uuid("Choose a responsible person"),
  priority: z.enum(PRIORITY_VALUES),
  dueDate: requiredDate,
});
export type CorrectiveActionFormInput = z.infer<typeof correctiveActionFormSchema>;

/** Progress update — moving open → in_progress → awaiting_verification, available to the action's own author/assignee (docs/ROLES_AND_PERMISSIONS.md §5 footnote 10/11). */
const PROGRESS_STATUS_VALUES = ["open", "in_progress", "awaiting_verification"] as const;
export const correctiveActionProgressFormSchema = z.object({
  status: z.enum(PROGRESS_STATUS_VALUES),
  completionNotes: optionalText,
});
export type CorrectiveActionProgressFormInput = z.infer<typeof correctiveActionProgressFormSchema>;

/** Closing (accepting) an awaiting_verification action — closure evidence is a text description, not a file (see the migration's header comment, point 7: no Storage support yet). */
export const correctiveActionCloseFormSchema = z.object({
  closureEvidence: optionalText,
});
export type CorrectiveActionCloseFormInput = z.infer<typeof correctiveActionCloseFormSchema>;

/** Rejecting an awaiting_verification action, or reopening a closed/rejected one — both require a reason (this milestone's explicit requirement). */
export const correctiveActionReasonFormSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required"),
});
export type CorrectiveActionReasonFormInput = z.infer<typeof correctiveActionReasonFormSchema>;
