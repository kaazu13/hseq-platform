import { z } from "zod";
import { optionalText } from "@/lib/validation";
import { ABSENCE_REPORT_REASONS } from "./types";

/** `reportAbsence` Server Function input — the employee's own self-report. */
export const reportAbsenceSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  reason: z.enum(ABSENCE_REPORT_REASONS as [string, ...string[]]),
  comment: optionalText,
});
export type ReportAbsenceInput = z.infer<typeof reportAbsenceSchema>;

/** `rejectAbsenceReport` — a review note is required. */
export const rejectAbsenceReportSchema = z.object({
  reviewNote: z.string().trim().min(1, "A review note is required").max(2000, "Keep it under 2000 characters"),
});
export type RejectAbsenceReportInput = z.infer<typeof rejectAbsenceReportSchema>;

/** `reopenAbsenceDay` — a reason is required, mirrors unlockDailyTeamsSchema. */
export const reopenAbsenceDaySchema = z.object({
  reason: z.string().trim().min(1, "A reason is required").max(2000, "Keep it under 2000 characters"),
});
export type ReopenAbsenceDayInput = z.infer<typeof reopenAbsenceDaySchema>;

/** `correctAbsenceStatus` — a reason is only actually required by set_daily_attendance_status() when the day is closed AND the status is changing; kept optional here so a normal open-day edit doesn't need one (mirrors upsertWorkedHoursCategoriesSchema's "reason is only enforced server-side" convention). */
export const correctAbsenceStatusSchema = z.object({
  status: z.enum(["not_set", "present", "absent", "sick", "leave", "training", "off_site"]),
  note: optionalText,
  reason: optionalText,
});
export type CorrectAbsenceStatusInput = z.infer<typeof correctAbsenceStatusSchema>;
