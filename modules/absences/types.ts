import type { Database, Enums } from "@/types/database";
import type { BasicEmployee } from "@/modules/daily-workforce/types";

/**
 * Absence management — Phases 4-7 (Operational Quality milestone). Built
 * entirely on top of daily_attendance (modules/daily-workforce), never a
 * second attendance system — see supabase/migrations/20260819092000_absence_and_leave.sql's
 * header comment. "Absent Today" is a filtered view over
 * listWorkforceForDate(), not a new roster query.
 */

export type DailyAttendanceDayLock = Database["public"]["Tables"]["daily_attendance_day_locks"]["Row"];
export type DailyAttendanceCorrection = Database["public"]["Tables"]["daily_attendance_corrections"]["Row"];
export type AbsenceReport = Database["public"]["Tables"]["absence_reports"]["Row"];

export type AbsenceReportReason = Enums<"absence_report_reason">;
export type AbsenceReportStatus = Enums<"absence_report_status">;

export const ABSENCE_REPORT_REASONS: AbsenceReportReason[] = ["sick", "personal", "family_emergency", "transport_issue", "other"];

export const ABSENCE_REPORT_REASON_LABELS: Record<AbsenceReportReason, string> = {
  sick: "Sick",
  personal: "Personal",
  family_emergency: "Family emergency",
  transport_issue: "Transport issue",
  other: "Other",
};

export const ABSENCE_REPORT_STATUS_LABELS: Record<AbsenceReportStatus, string> = {
  pending: "Pending review",
  confirmed: "Confirmed",
  rejected: "Rejected",
};

export type AbsenceReportWithEmployee = AbsenceReport & { employee: BasicEmployee };

/** One row in the Absent Today list — an employee currently marked unavailable, from the SAME daily_attendance source of truth as Today's Teams. */
export type AbsentTodayRow = {
  employee: BasicEmployee;
  status: Enums<"daily_attendance_status">;
  note: string | null;
};
