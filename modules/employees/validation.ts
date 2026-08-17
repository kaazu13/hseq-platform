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
  firstName: z.string().trim().min(1, "First name is required").max(100, "Keep it under 100 characters"),
  lastName: z.string().trim().min(1, "Last name is required").max(100, "Keep it under 100 characters"),
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

/**
 * `updateMyBirthDate` (Task 3 Part 7) — own-view/edit only. The 14-100-year
 * sanity bound is the DB's employees_birth_date_sane constraint's real,
 * authoritative rule; re-validated here too so a wildly wrong date gets a
 * clear "enter a realistic date" message instead of the action's generic
 * server_error fallback (isRaisedException doesn't match a check-constraint
 * violation, only a plain RAISE EXCEPTION — see lib/supabase/errors.ts).
 */
export const updateMyBirthDateFormSchema = z.object({
  birthDate: optionalDate.pipe(
    z
      .string()
      .refine(
        (value) => {
          const date = new Date(`${value}T00:00:00Z`);
          const now = new Date();
          const fourteenYearsAgo = new Date(Date.UTC(now.getUTCFullYear() - 14, now.getUTCMonth(), now.getUTCDate()));
          const hundredYearsAgo = new Date(Date.UTC(now.getUTCFullYear() - 100, now.getUTCMonth(), now.getUTCDate()));
          return date <= fourteenYearsAgo && date >= hundredYearsAgo;
        },
        { message: "Enter a realistic birth date" },
      )
      .optional(),
  ),
});
export type UpdateMyBirthDateFormInput = z.infer<typeof updateMyBirthDateFormSchema>;

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
