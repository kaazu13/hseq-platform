import { z } from "zod";
import { optionalText } from "@/lib/validation";
import {
  LMRA_HAZARD_TYPES,
  LMRA_SHIFTS,
  LMRA_COMMON_CONTROLS,
  LMRA_WORK_AREA_MAX_LENGTH,
  LMRA_WORK_ACTIVITY_MAX_LENGTH,
  LMRA_NOTES_MAX_LENGTH,
  LMRA_REVIEW_NOTES_MAX_LENGTH,
  LMRA_STOP_WORK_REASON_MAX_LENGTH,
  LMRA_OTHER_DESCRIPTION_MAX_LENGTH,
  LMRA_CONTROL_TEXT_MAX_LENGTH,
  LMRA_MAX_PARTICIPANTS,
  LMRA_MAX_SELECTED_CONTROLS,
  type LmraHazardType,
  type LmraShift,
} from "./types";

/**
 * Server Function validation for the LMRA domain — see
 * docs/API_CONVENTIONS.md §5 and docs/UI_GUIDELINES.md §5 ("one schema,
 * used for both client-side field validation and server-side check"), and
 * this milestone's Phase 10 ("do not rely only on HTML maxlength — enforce
 * server-side limits"). No pre-existing shared length-limit constants were
 * found in lib/validation.ts (only optionalText/optionalDate) — the
 * LMRA_*_MAX_LENGTH constants in ./types.ts are new, module-scoped, and
 * mirrored exactly by the DB-level CHECK constraints added in
 * supabase/migrations/20260816090000_lmra_daily_workforce_redesign.sql
 * (Zod is the primary gate; the DB constraints are a defensive backstop).
 */

const requiredDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

const optionalNotes = (maxLength: number) => optionalText.pipe(z.string().max(maxLength, `Keep it under ${maxLength} characters`).optional());

export const lmraShiftSchema = z.enum(LMRA_SHIFTS as [LmraShift, ...LmraShift[]]);

const HAZARD_TYPE_VALUES = LMRA_HAZARD_TYPES as [LmraHazardType, ...LmraHazardType[]];

/** One row of the 12-item hazard checklist, extended with the fixed predefined-controls checklist (Phase 5). */
export const lmraHazardSchema = z
  .object({
    hazardType: z.enum(HAZARD_TYPE_VALUES),
    isApplicable: z.boolean(),
    selectedControls: z.array(z.string().trim().min(1).max(200)).max(LMRA_MAX_SELECTED_CONTROLS),
    controls: z.string().trim().max(LMRA_CONTROL_TEXT_MAX_LENGTH, `Keep it under ${LMRA_CONTROL_TEXT_MAX_LENGTH} characters`),
    responsiblePersonId: z.string().uuid().nullable(),
    controlsConfirmed: z.boolean(),
    otherDescription: z.string().trim().max(LMRA_OTHER_DESCRIPTION_MAX_LENGTH, `Keep it under ${LMRA_OTHER_DESCRIPTION_MAX_LENGTH} characters`),
  })
  .refine((data) => data.selectedControls.every((control) => LMRA_COMMON_CONTROLS[data.hazardType].includes(control)), {
    message: "One or more selected controls aren't valid for this hazard",
    path: ["selectedControls"],
  });

/** The whole checklist submitted together — exactly 12 rows, one per hazard type, matching what create_initial_lmra_hazards() seeds. */
export const lmraHazardsFormSchema = z
  .array(lmraHazardSchema)
  .length(LMRA_HAZARD_TYPES.length, `Expected exactly ${LMRA_HAZARD_TYPES.length} hazard rows`);
export type LmraHazardsFormInput = z.infer<typeof lmraHazardsFormSchema>;

/** Worker picker — the desired final set of participant employee ids, bounded (Phase 10's "sensible upper limit"). */
export const lmraParticipantsFormSchema = z.array(z.string().uuid()).max(LMRA_MAX_PARTICIPANTS, "Too many workers selected");
export type LmraParticipantsFormInput = z.infer<typeof lmraParticipantsFormSchema>;

const RESULT_VALUES = ["go", "no_go"] as const;

/**
 * Create — one consolidated submission (Phase 7: work details, workers
 * involved, hazards+controls, and final confirmation all in one form,
 * saved atomically). `submit` distinguishes the two save actions: false =
 * "Save Draft" (no confirmation/go-no-go required yet), true = "Save LMRA"
 * (requires the confirmation checkbox and, if stopping work, a reason —
 * same rule lmraSubmitFormSchema below already enforces for the separate
 * later-submit path).
 */
export const lmraCreateFormSchema = z
  .object({
    projectId: z.string().uuid("Choose a project"),
    workArea: z.string().trim().min(1, "Work area is required").max(LMRA_WORK_AREA_MAX_LENGTH, `Keep it under ${LMRA_WORK_AREA_MAX_LENGTH} characters`),
    workActivity: z.string().trim().min(1, "Work activity is required").max(LMRA_WORK_ACTIVITY_MAX_LENGTH, `Keep it under ${LMRA_WORK_ACTIVITY_MAX_LENGTH} characters`),
    workDate: requiredDate,
    shift: lmraShiftSchema,
    completedByEmployeeId: z.string().uuid("Choose who completed this LMRA"),
    responsiblePersonId: z.string().uuid().nullable(),
    notes: optionalNotes(LMRA_NOTES_MAX_LENGTH),
    participantEmployeeIds: lmraParticipantsFormSchema,
    hazards: lmraHazardsFormSchema,
    submit: z.boolean(),
    result: z.enum(RESULT_VALUES),
    stopWorkReason: optionalNotes(LMRA_STOP_WORK_REASON_MAX_LENGTH),
    confirmed: z.boolean(),
  })
  .refine((data) => !data.submit || data.confirmed, {
    message: "Confirm that the hazards and control measures have been discussed before saving",
    path: ["confirmed"],
  })
  .refine((data) => !data.submit || data.result !== "no_go" || Boolean(data.stopWorkReason?.trim()), {
    message: "A reason is required when stopping work",
    path: ["stopWorkReason"],
  });
export type LmraCreateFormInput = z.infer<typeof lmraCreateFormSchema>;

/** Edit — core fields, workers, and hazards/controls (draft-only for the latter two, enforced server-side by update_lmra_assessment()); never the go/no-go decision, which stays a detail-page action (lmraSubmitFormSchema below) once a draft is ready. */
export const lmraEditFormSchema = z.object({
  workArea: z.string().trim().min(1, "Work area is required").max(LMRA_WORK_AREA_MAX_LENGTH, `Keep it under ${LMRA_WORK_AREA_MAX_LENGTH} characters`),
  workActivity: z.string().trim().min(1, "Work activity is required").max(LMRA_WORK_ACTIVITY_MAX_LENGTH, `Keep it under ${LMRA_WORK_ACTIVITY_MAX_LENGTH} characters`),
  workDate: requiredDate,
  shift: lmraShiftSchema,
  responsiblePersonId: z.string().uuid().nullable(),
  notes: optionalNotes(LMRA_NOTES_MAX_LENGTH),
  participantEmployeeIds: lmraParticipantsFormSchema,
  hazards: lmraHazardsFormSchema,
});
export type LmraEditFormInput = z.infer<typeof lmraEditFormSchema>;

const REVIEW_DECISION_VALUES = ["approved", "rejected"] as const;
export const lmraReviewFormSchema = z.object({
  decision: z.enum(REVIEW_DECISION_VALUES),
  reviewNotes: optionalNotes(LMRA_REVIEW_NOTES_MAX_LENGTH),
});
export type LmraReviewFormInput = z.infer<typeof lmraReviewFormSchema>;

/** Submit-time confirmation for a draft saved earlier (LmraSubmitCard, detail page) — the on-site go/no-go call, required before a draft can move to 'submitted' via that separate path. */
export const lmraSubmitFormSchema = z
  .object({
    result: z.enum(RESULT_VALUES),
    stopWorkReason: optionalNotes(LMRA_STOP_WORK_REASON_MAX_LENGTH),
  })
  .refine((data) => data.result !== "no_go" || Boolean(data.stopWorkReason?.trim()), {
    message: "A reason is required when stopping work",
    path: ["stopWorkReason"],
  });
export type LmraSubmitFormInput = z.infer<typeof lmraSubmitFormSchema>;
