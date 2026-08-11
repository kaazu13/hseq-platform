import { z } from "zod";
import { REPORT_RECORD_TYPES } from "./types";

/**
 * Server Function validation for report sharing — see
 * docs/API_CONVENTIONS.md §5. The expiry preset is resolved to an absolute
 * timestamp CLIENT-SIDE for display, but the server independently
 * re-validates whatever timestamp actually arrives (must be null or
 * strictly in the future) rather than trusting the preset label at all.
 */

const RECORD_TYPE_VALUES = REPORT_RECORD_TYPES as [string, ...string[]];

export const createReportShareFormSchema = z.object({
  recordType: z.enum(RECORD_TYPE_VALUES),
  recordId: z.string().uuid(),
  expiresAt: z
    .string()
    .trim()
    .datetime({ message: "Invalid expiry date" })
    .optional()
    .nullable()
    .refine((value) => !value || new Date(value).getTime() > Date.now(), "Expiry must be in the future"),
});
export type CreateReportShareFormInput = z.infer<typeof createReportShareFormSchema>;

export const revokeReportShareFormSchema = z.object({
  shareId: z.string().uuid(),
});
export type RevokeReportShareFormInput = z.infer<typeof revokeReportShareFormSchema>;
