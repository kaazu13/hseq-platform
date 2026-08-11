import { z } from "zod";
import { optionalText } from "@/lib/validation";
import { WORKED_HOURS_MIN, WORKED_HOURS_MAX, WORKED_HOURS_EMPLOYEE_SCOPES } from "./types";

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
export type UpsertWorkedHoursInput = z.input<typeof upsertWorkedHoursSchema>;

/** `bulkApplyWorkedHours` Server Function input — "Apply [X] hours to all". */
export const bulkApplyWorkedHoursSchema = z.object({
  hours: hoursField,
  employeeIds: z.array(z.string().uuid()).min(1, "Select at least one employee"),
});
export type BulkApplyWorkedHoursInput = z.input<typeof bulkApplyWorkedHoursSchema>;

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
export type ResolveWorkedHoursDiscrepancyInput = z.input<typeof resolveWorkedHoursDiscrepancySchema>;

/** A generous, bounded ceiling on how many employees a single export request may name explicitly — "enforce sensible request parameter limits" (Phase 9); no real project roster approaches this. */
export const MAX_WORKED_HOURS_EXPORT_EMPLOYEES = 1000;

const WORKED_HOURS_EXPORT_MODE_VALUES = ["day", "week", "month"] as const;
const WORKED_HOURS_EXPORT_SCOPE_VALUES = WORKED_HOURS_EMPLOYEE_SCOPES as [string, ...string[]];

/**
 * `/worked-hours/export` query-parameter validation — the export Route
 * Handler's own gate on top of, never instead of, the company/project/role
 * checks it also performs. `employeeIds` is required and non-empty exactly
 * when `scope === "selected"`; the Route Handler still independently
 * re-validates every id belongs to the resolved company/project before
 * using it (this schema only bounds shape/count, never trusts membership).
 */
export const workedHoursExportQuerySchema = z
  .object({
    mode: z.enum(WORKED_HOURS_EXPORT_MODE_VALUES).catch("day"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    scope: z.enum(WORKED_HOURS_EXPORT_SCOPE_VALUES).catch("hours_only"),
    employeeIds: z.array(z.string().uuid()).max(MAX_WORKED_HOURS_EXPORT_EMPLOYEES, "Too many employees selected").optional(),
  })
  .refine((value) => value.scope !== "selected" || (value.employeeIds && value.employeeIds.length > 0), {
    message: "Select at least one employee",
    path: ["employeeIds"],
  });
export type WorkedHoursExportQueryInput = z.infer<typeof workedHoursExportQuerySchema>;
