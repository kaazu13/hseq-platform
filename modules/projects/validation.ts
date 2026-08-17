import { z } from "zod";
import { optionalText, optionalDate } from "@/lib/validation";

/**
 * Server Function validation for the projects domain — same shape/optional-
 * text conventions as modules/employees/validation.ts. Manager/roster
 * assignment (project_assignments) has its own, separate schema below —
 * assigning people to a project is never part of the project-fields form,
 * mirroring how role assignment is separate from the employee edit form.
 */

const PROJECT_STATUS_VALUES = ["planning", "active", "completed", "archived"] as const;

export const projectFormSchema = z
  .object({
    name: z.string().trim().min(1, "Project name is required").max(200, "Keep it under 200 characters"),
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

/** `updateProjectLocationSettings` (Task 3 Part 12) — country_code/timezone, a separate narrower-gated write path from the general project-fields form. The 2-letter-code/real-IANA-timezone checks mirror validate_project_location_settings_update()'s DB-level validation; re-validated here too for a clear client-side error instead of a raw exception. */
const VALID_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

export const projectLocationSettingsSchema = z.object({
  countryCode: optionalText.pipe(z.string().regex(/^[A-Z]{2}$/, "Pick a country").optional()),
  timezone: optionalText.pipe(
    z
      .string()
      .refine((value) => VALID_TIMEZONES.has(value), "Pick a valid timezone")
      .optional(),
  ),
});
export type ProjectLocationSettingsInput = z.infer<typeof projectLocationSettingsSchema>;

/** `updateProjectSiteLocation` (Task 3 Part 13) — site_address/lat/long, separate write path (and separate role gate — adds planner) from Part 12's country/timezone. Lat/long must be supplied together or not at all — a lone coordinate is meaningless for the Directions link (Part 14). */
export const projectSiteLocationSchema = z
  .object({
    siteAddress: optionalText,
    siteLatitude: z.coerce.number().min(-90).max(90).optional(),
    siteLongitude: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((data) => (data.siteLatitude === undefined) === (data.siteLongitude === undefined), {
    message: "Enter both latitude and longitude, or leave both blank",
    path: ["siteLongitude"],
  });
export type ProjectSiteLocationInput = z.infer<typeof projectSiteLocationSchema>;

export const assignProjectRoleSchema = z.object({
  employeeId: z.string().uuid(),
  assignmentRole: z.enum(PROJECT_ASSIGNMENT_ROLE_VALUES),
  notes: optionalText,
});
export type AssignProjectRoleInput = z.infer<typeof assignProjectRoleSchema>;
