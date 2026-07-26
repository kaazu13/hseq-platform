import { z } from "zod";
import { optionalText, optionalDate } from "@/lib/validation";

/**
 * Shared schema for the employee create/edit Server Functions — used for
 * both client-side field validation and the server-side check inside each
 * Server Function. See docs/API_CONVENTIONS.md §5 (Validation).
 */

/**
 * Fields shared by both create and edit. `employmentStatus`/`startDate`
 * (hire date)/`endDate` are deliberately NOT here — as of the Employment
 * Lifecycle milestone, employment state is owned exclusively by
 * `employee_employment_periods` (see `endEmploymentFormSchema`/
 * `rehireFormSchema` below), never by the general edit form. The database
 * itself now enforces this: `employees.employment_status`/`start_date`/
 * `end_date` are no longer directly UPDATE-able by `authenticated` (see
 * supabase/migrations/20260727090000_employment_periods.sql §7) — sending
 * them from `updateEmployee` would fail at the database, not just be
 * redundant.
 */
const sharedEmployeeFields = {
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  workEmail: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((value) => (value === "" || value === undefined ? undefined : value))
    .refine((value) => value === undefined || z.string().email().safeParse(value).success, {
      message: "Enter a valid email address",
    }),
  phone: optionalText,
  positionTitle: optionalText,
  birthDate: optionalDate,
};

/**
 * Create-only: `startDate` here is the new employee's hire date, which
 * seeds their first (and, at creation time, only) employment period — see
 * `create_initial_employment_period()` in the same migration referenced
 * above. Not part of `sharedEmployeeFields` since edit never touches it.
 */
export const createEmployeeFormSchema = z.object({ ...sharedEmployeeFields, startDate: optionalDate });
export type CreateEmployeeFormInput = z.infer<typeof createEmployeeFormSchema>;

export const employeeFormSchema = z.object(sharedEmployeeFields);
export type EmployeeFormInput = z.infer<typeof employeeFormSchema>;

const EMPLOYMENT_END_REASON_VALUES = ["resigned", "terminated", "layoff", "end_of_contract", "other"] as const;

const requiredDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

/** `endEmployment` Server Function — closes the employee's current open employment period. */
export const endEmploymentFormSchema = z.object({
  endDate: requiredDate,
  endReason: z.enum(EMPLOYMENT_END_REASON_VALUES),
  endNote: optionalText,
});
export type EndEmploymentFormInput = z.infer<typeof endEmploymentFormSchema>;

/** `rehireEmployee` Server Function — opens a new employment period for a previously-terminated employee. */
export const rehireFormSchema = z.object({
  startDate: requiredDate,
});
export type RehireFormInput = z.infer<typeof rehireFormSchema>;
