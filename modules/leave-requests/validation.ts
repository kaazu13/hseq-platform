import { z } from "zod";
import { optionalText } from "@/lib/validation";
import { LEAVE_TYPES } from "./types";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

/** `requestLeave` — employee "[ Request Holiday / Leave ]" (Phase 8). "Do not allow end date before start date," "enforce sensible date-range limits." */
export const requestLeaveSchema = z
  .object({
    leaveType: z.enum(LEAVE_TYPES as [string, ...string[]]),
    startDate: z.string().regex(DATE_REGEX, "Pick a start date"),
    endDate: z.string().regex(DATE_REGEX, "Pick an end date"),
    comment: optionalText,
  })
  .refine((value) => daysBetween(value.startDate, value.endDate) >= 0, { message: "End date cannot be before the start date", path: ["endDate"] })
  .refine((value) => daysBetween(value.startDate, value.endDate) <= MAX_RANGE_DAYS, { message: "That date range is too long — check the dates", path: ["endDate"] });
export type RequestLeaveInput = z.infer<typeof requestLeaveSchema>;

/** `resubmitLeaveRequest` — same shape as requesting, since the employee is re-supplying the full corrected form. */
export const resubmitLeaveRequestSchema = requestLeaveSchema;
export type ResubmitLeaveRequestInput = z.infer<typeof resubmitLeaveRequestSchema>;

/** `approveLeaveRequest` — comment optional. */
export const approveLeaveRequestSchema = z.object({ comment: optionalText });
export type ApproveLeaveRequestInput = z.infer<typeof approveLeaveRequestSchema>;

/** `denyLeaveRequest` — a management comment is required. */
export const denyLeaveRequestSchema = z.object({ comment: z.string().trim().min(1, "A comment is required").max(2000, "Keep it under 2000 characters") });
export type DenyLeaveRequestInput = z.infer<typeof denyLeaveRequestSchema>;

/** `returnLeaveRequest` — a comment is required. */
export const returnLeaveRequestSchema = z.object({ comment: z.string().trim().min(1, "A comment is required").max(2000, "Keep it under 2000 characters") });
export type ReturnLeaveRequestInput = z.infer<typeof returnLeaveRequestSchema>;
