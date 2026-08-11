import { z } from "zod";
import { optionalText } from "@/lib/validation";

/**
 * Server Function validation for Toolbox Meetings — see
 * docs/API_CONVENTIONS.md §5. The PDF file itself is validated separately
 * by lib/storage/toolbox-documents.ts's validatePdfFile() (MIME/extension/
 * size/magic-bytes), not through zod — Server Functions here receive a
 * FormData (metadata fields + the file) rather than a plain JSON object,
 * since a File can't round-trip through a JSON-serializable input type.
 */

export const toolboxMeetingMetadataSchema = z.object({
  projectId: z.string().uuid("Choose a project"),
  title: z.string().trim().min(1, "Title is required").max(200, "Keep it under 200 characters"),
  meetingDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  workArea: optionalText,
  heldByEmployeeId: z.string().uuid("Choose the HSE person who held the meeting"),
  notes: optionalText,
});
export type ToolboxMeetingMetadataInput = z.infer<typeof toolboxMeetingMetadataSchema>;

export const toolboxMeetingEditFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Keep it under 200 characters"),
  meetingDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  workArea: optionalText,
  heldByEmployeeId: z.string().uuid("Choose the HSE person who held the meeting"),
  notes: optionalText,
});
export type ToolboxMeetingEditFormInput = z.infer<typeof toolboxMeetingEditFormSchema>;

/** Required whenever the uploaded PDF is being swapped for a corrected one — mirrors the reopen/reject reason-required pattern used across every other module this session. */
export const replaceFileReasonSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required").max(2000, "Keep it under 2000 characters"),
});
export type ReplaceFileReasonInput = z.infer<typeof replaceFileReasonSchema>;
