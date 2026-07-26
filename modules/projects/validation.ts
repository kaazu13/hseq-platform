import { z } from "zod";

/**
 * Server Function validation for the projects domain — same shape/optional-
 * text conventions as modules/employees/validation.ts. Manager/roster
 * assignment (project_assignments) has its own, separate schema below —
 * assigning people to a project is never part of the project-fields form,
 * mirroring how role assignment is separate from the employee edit form.
 */
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" || value === undefined ? undefined : value));

const optionalDate = optionalText.pipe(
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .optional(),
);

const PROJECT_STATUS_VALUES = ["planning", "active", "completed", "archived"] as const;

export const projectFormSchema = z
  .object({
    name: z.string().trim().min(1, "Project name is required"),
    clientName: optionalText,
    code: optionalText,
    description: optionalText,
    status: z.enum(PROJECT_STATUS_VALUES),
    startDate: optionalDate,
    endDate: optionalDate,
    location: optionalText,
  })
  .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
    message: "End date can't be before start date",
    path: ["endDate"],
  });
export type ProjectFormInput = z.infer<typeof projectFormSchema>;

const PROJECT_ASSIGNMENT_ROLE_VALUES = ["project_manager", "hseq_manager", "hse_officer", "inspector", "member"] as const;

export const assignProjectRoleSchema = z.object({
  employeeId: z.string().uuid(),
  assignmentRole: z.enum(PROJECT_ASSIGNMENT_ROLE_VALUES),
  notes: optionalText,
});
export type AssignProjectRoleInput = z.infer<typeof assignProjectRoleSchema>;
