import type { Database, Enums } from "@/types/database";
import type { BasicEmployee } from "@/modules/daily-workforce/types";

/** Holiday/Leave request workflow — Phases 8-10 (Operational Quality milestone). See supabase/migrations/20260819092000_absence_and_leave.sql. */

export type LeaveRequest = Database["public"]["Tables"]["leave_requests"]["Row"];
export type LeaveRequestHistory = Database["public"]["Tables"]["leave_request_history"]["Row"];

export type LeaveType = Enums<"leave_type">;
export type LeaveRequestStatus = Enums<"leave_request_status">;

export const LEAVE_TYPES: LeaveType[] = ["annual", "sick", "unpaid", "compassionate", "other"];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: "Annual leave",
  sick: "Sick leave",
  unpaid: "Unpaid leave",
  compassionate: "Compassionate leave",
  other: "Other",
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
