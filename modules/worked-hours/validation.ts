import { z } from "zod";
import { optionalText } from "@/lib/validation";
import { WORKED_HOURS_MIN, WORKED_HOURS_MAX, WORKED_HOURS_EMPLOYEE_SCOPES, WORKED_HOURS_CATEGORIES } from "./types";

const hoursField = z
  .string()
  .trim()
  .min(1, "Hours is required")
  .refine((value) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= WORKED_HOURS_MIN && num <= WORKED_HOURS_MAX;
  }, `Hours must be between ${WORKED_HOURS_MIN} and ${WORKED_HOURS_MAX}`)
  .transform((value) => Number(value));

/** A single category's hours field — same bounds as hoursField, but zero-defaulting an empty string rather than rejecting it (a blank category input just means "0 hours for this category," not a validation error — every category field is optional in the form). */
const categoryHoursField = z
  .string()
  .trim()
  .transform((value) => (value === "" ? "0" : value))
  .refine((value) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= WORKED_HOURS_MIN && num <= WORKED_HOURS_MAX;
  }, `Hours must be between ${WORKED_HOURS_MIN} and ${WORKED_HOURS_MAX}`)
  .transform((value) => Number(value));

/**
 * `upsertWorkedHoursCategories` Server Function input (Worked Hours V2,
 * Phase 1-2) — one entry per controlled category, reason required only
 * when correcting an already-submitted day (the server/RPC-side check is
 * the real gate; this is the client-side usability layer). The <=24 total
 * check here is the UI-side half of the "must never exceed 24.0 hours"
 * invariant — sync_worked_hours_total()'s trigger is the always-enforced
 * database-side half, regardless of what this schema does or doesn't catch.
 */
export const upsertWorkedHoursCategoriesSchema = z
  .object({
    categories: z.object({
      regular: categoryHoursField,
      overtime: categoryHoursField,
      night: categoryHoursField,
      travel: categoryHoursField,
      other: categoryHoursField,
    }),
    note: optionalText,
    reason: optionalText,
  })
  .refine((data) => WORKED_HOURS_CATEGORIES.reduce((sum, category) => sum + data.categories[category], 0) <= WORKED_HOURS_MAX, {
    message: `Total hours across all categories cannot exceed ${WORKED_HOURS_MAX}.0`,
    path: ["categories"],
  });
export type UpsertWorkedHoursCategoriesInput = z.input<typeof upsertWorkedHoursCategoriesSchema>;

/** `bulkApplyWorkedHours` Server Function input — "Apply [X] [Category] to all". */
export const bulkApplyWorkedHoursSchema = z.object({
  category: z.enum(WORKED_HOURS_CATEGORIES as [string, ...string[]]),
  hours: hoursField,
  employeeIds: z.array(z.string().uuid()).min(1, "Select at least one employee"),
});
export type BulkApplyWorkedHoursInput = z.input<typeof bulkApplyWorkedHoursSchema>;

/** `reportWorkedHoursDiscrepancy` Server Function input. */
export const reportWorkedHoursDiscrepancySchema = z.object({
  comment: z.string().trim().min(1, "A comment is required").max(2000, "Keep it under 2000 characters"),
});
export type ReportWorkedHoursDiscrepancyInput = z.infer<typeof reportWorkedHoursDiscrepancySchema>;

const DISCREPANCY_RESOLUTION_VALUES = ["accepted", "rejected"] as const;

/** `resolveWorkedHoursDiscrepancy` Server Function input. */
export const resolveWorkedHoursDiscrepancySchema = z.object({
  status: z.enum(DISCREPANCY_RESOLUTION_VALUES),
  resolutionNote: z.string().trim().min(1, "A resolution note is required").max(2000, "Keep it under 2000 characters"),
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
