import type { Database, Enums } from "@/types/database";
import type { BasicEmployee } from "@/modules/daily-workforce/types";

/** Holiday/Leave request workflow — Phases 8-10 (Operational Quality milestone). See supabase/migrations/20260819092000_absence_and_leave.sql. */

export type LeaveRequest = Database["public"]["Tables"]["leave_requests"]["Row"];
export type LeaveRequestHistory = Database["public"]["Tables"]["leave_request_history"]["Row"];

export type LeaveType = Enums<"leave_type">;
export type LeaveRequestStatus = Enums<"leave_request_status">;

/**
 * The types OFFERED when requesting NEW leave (Task 3 Part 4 relabel).
 * 'annual'/'unpaid'/'compassionate' are deliberately excluded here — they
 * remain valid, permanent enum values (existing leave_requests rows
 * reference them, and Postgres enum values can't be dropped) but are
 * legacy-only going forward, not offered as a new choice. They still get a
 * full, correct label below — LEAVE_TYPE_LABELS covers every enum value,
 * past or present, so historical rows never fall back to a raw DB string.
 */
export const LEAVE_TYPES: LeaveType[] = ["sick", "holiday", "emergency", "other"];

/** Every valid leave_type, current and legacy — used where a value must be VALIDATED (e.g. resubmitting a request that already holds a legacy type), never where types are OFFERED as a new choice (use LEAVE_TYPES for that). */
export const ALL_LEAVE_TYPES: LeaveType[] = [...LEAVE_TYPES, "annual", "unpaid", "compassionate"];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  sick: "Sick leave",
  holiday: "Holiday",
  emergency: "Emergency leave",
  other: "Other",
  // Legacy values — no longer offered for new requests, still rendered
  // correctly wherever a historical row uses one.
  annual: "Annual leave",
  unpaid: "Unpaid leave",
  compassionate: "Compassionate leave",
};

export const LEAVE_REQUEST_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  returned: "Returned for changes",
  cancelled: "Cancelled",
};

export type LeaveRequestWithEmployee = LeaveRequest & { employee: BasicEmployee };

/** Inclusive calendar-day count for [start_date, end_date] — used for both display and export ("number of calendar days where meaningful"). */
export function countLeaveCalendarDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}
