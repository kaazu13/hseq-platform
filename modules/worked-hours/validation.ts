import { z } from "zod";
import { optionalText } from "@/lib/validation";
import { WORKED_HOURS_MIN, WORKED_HOURS_MAX } from "./types";

const hoursField = z
  .string()
  .trim()
  .min(1, "Hours is required")
  .refine((value) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= WORKED_HOURS_MIN && num <= WORKED_HOURS_MAX;
  }, `Hours must be between ${WORKED_HOURS_MIN} and ${WORKED_HOURS_MAX}`)
  .transform((value) => Number(value));

/** `upsertWorkedHours` Server Function input — reason is required only when correcting already-submitted hours (validate_scaffold_inspection_update()-style server-side enforcement is the real gate; this just catches the common case earlier). */
export const upsertWorkedHoursSchema = z.object({
  hours: hoursField,
  note: optionalText,
  reason: optionalText,
});
export type UpsertWorkedHoursInput = z.infer<typeof upsertWorkedHoursSchema>;

/** `bulkApplyWorkedHours` Server Function input — "Apply [X] hours to all". */
export const bulkApplyWorkedHoursSchema = z.object({
  hours: hoursField,
  employeeIds: z.array(z.string().uuid()).min(1, "Select at least one employee"),
});
export type BulkApplyWorkedHoursInput = z.infer<typeof bulkApplyWorkedHoursSchema>;

/** `reportWorkedHoursDiscrepancy` Server Function input. */
export const reportWorkedHoursDiscrepancySchema = z.object({
  comment: z.string().trim().min(1, "A comment is required"),
});
export type ReportWorkedHoursDiscrepancyInput = z.infer<typeof reportWorkedHoursDiscrepancySchema>;

const DISCREPANCY_RESOLUTION_VALUES = ["accepted", "rejected"] as const;

/** `resolveWorkedHoursDiscrepancy` Server Function input. */
export const resolveWorkedHoursDiscrepancySchema = z.object({
  status: z.enum(DISCREPANCY_RESOLUTION_VALUES),
  resolutionNote: z.string().trim().min(1, "A resolution note is required"),
  resultingHours: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine((value) => value === undefined || (Number.isFinite(Number(value)) && Number(value) >= WORKED_HOURS_MIN && Number(value) <= WORKED_HOURS_MAX), `Hours must be between ${WORKED_HOURS_MIN} and ${WORKED_HOURS_MAX}`)
    .transform((value) => (value === undefined ? undefined : Number(value))),
});
export type ResolveWorkedHoursDiscrepancyInput = z.infer<typeof resolveWorkedHoursDiscrepancySchema>;
