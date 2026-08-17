import type { Database, Enums } from "@/types/database";
import type { BasicEmployee } from "@/modules/daily-workforce/types";

/** Task 3 Part 19 — the absence/attendance review-contest workflow. See supabase/migrations/20260901118000_attendance_review_requests.sql. */
export type AttendanceReviewRequest = Database["public"]["Tables"]["attendance_review_requests"]["Row"];
export type AttendanceReviewStatus = Enums<"attendance_review_status">;

export const ATTENDANCE_REVIEW_STATUS_LABELS: Record<AttendanceReviewStatus, string> = {
  pending: "Pending review",
  accepted: "Accepted",
  rejected: "Rejected",
};

export type AttendanceReviewRequestWithEmployee = AttendanceReviewRequest & { employee: BasicEmployee };
