import { z } from "zod";
import { optionalText } from "@/lib/validation";
import { LMRA_HAZARD_TYPES } from "./types";

/**
 * Server Function validation for the LMRA domain — see
 * docs/API_CONVENTIONS.md §5 and docs/UI_GUIDELINES.md §5 ("one schema,
 * used for both client-side field validation and server-side check").
 */

const requiredDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

/** Create/edit — core fields only. Hazards and participants are separate, per-section actions (mirrors modules/teams' separation of team fields from assignment changes). */
export const lmraAssessmentFormSchema = z.object({
  projectId: z.string().uuid("Choose a project"),
  workArea: z.string().trim().min(1, "Work area is required"),
  workActivity: z.string().trim().min(1, "Work activity is required"),
  workDate: requiredDate,
  shift: z.string().trim().min(1, "Shift is required"),
  responsibleForemanId: z.string().uuid("Choose the responsible foreman"),
  notes: optionalText,
});
export type LmraAssessmentFormInput = z.infer<typeof lmraAssessmentFormSchema>;

const HAZARD_TYPE_VALUES = LMRA_HAZARD_TYPES as [string, ...string[]];

/** One row of the 12-item hazard checklist. */
export const lmraHazardSchema = z.object({
  hazardType: z.enum(HAZARD_TYPE_VALUES),
  isApplicable: z.boolean(),
  controls: z.string().trim(),
  responsiblePersonId: z.string().uuid().nullable(),
  controlsConfirmed: z.boolean(),
  otherDescription: z.string().trim(),
});

/** The whole checklist submitted together — exactly 12 rows, one per hazard type, matching what create_initial_lmra_hazards() seeds. */
export const lmraHazardsFormSchema = z
  .array(lmraHazardSchema)
  .length(LMRA_HAZARD_TYPES.length, `Expected exactly ${LMRA_HAZARD_TYPES.length} hazard rows`);
export type LmraHazardsFormInput = z.infer<typeof lmraHazardsFormSchema>;

/** Worker picker — the desired final set of participant employee ids. */
export const lmraParticipantsFormSchema = z.array(z.string().uuid());
export type LmraParticipantsFormInput = z.infer<typeof lmraParticipantsFormSchema>;

const REVIEW_DECISION_VALUES = ["approved", "rejected"] as const;
export const lmraReviewFormSchema = z.object({
  decision: z.enum(REVIEW_DECISION_VALUES),
  reviewNotes: optionalText,
});
export type LmraReviewFormInput = z.infer<typeof lmraReviewFormSchema>;

const RESULT_VALUES = ["go", "no_go"] as const;
/** Submit-time confirmation — the on-site go/no-go call, required before a draft can move to 'submitted'. */
export const lmraSubmitFormSchema = z.object({
  result: z.enum(RESULT_VALUES),
  stopWorkReason: optionalText,
}).refine((data) => data.result !== "no_go" || Boolean(data.stopWorkReason?.trim()), {
  message: "A reason is required when stopping work",
  path: ["stopWorkReason"],
});
export type LmraSubmitFormInput = z.infer<typeof lmraSubmitFormSchema>;
