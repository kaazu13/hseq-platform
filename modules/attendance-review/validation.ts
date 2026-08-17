import { z } from "zod";
import { DAILY_ATTENDANCE_STATUSES } from "@/modules/daily-workforce/types";

/** `requestAttendanceReview` — Task 3 Part 19. */
export const requestAttendanceReviewSchema = z.object({
  explanation: z.string().trim().min(1, "Explain why this record is wrong").max(2000, "Keep it under 2000 characters"),
});
export type RequestAttendanceReviewInput = z.infer<typeof requestAttendanceReviewSchema>;

/** `acceptAttendanceReview` — the reviewer supplies the corrected status + a required note in the same step. */
export const acceptAttendanceReviewSchema = z.object({
  correctedStatus: z.enum(DAILY_ATTENDANCE_STATUSES as [string, ...string[]]),
  reviewNote: z.string().trim().min(1, "A review note is required").max(2000, "Keep it under 2000 characters"),
  reason: z.string().trim().max(2000, "Keep it under 2000 characters").optional(),
});
export type AcceptAttendanceReviewInput = z.infer<typeof acceptAttendanceReviewSchema>;

export const rejectAttendanceReviewSchema = z.object({
  reviewNote: z.string().trim().min(1, "A review note is required").max(2000, "Keep it under 2000 characters"),
});
export type RejectAttendanceReviewInput = z.infer<typeof rejectAttendanceReviewSchema>;
