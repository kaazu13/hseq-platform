import { z } from "zod";
import { optionalText } from "@/lib/validation";

/**
 * Server Function validation for the Scaffolds/Scaffold Inspections
 * domain — see docs/API_CONVENTIONS.md §5 and modules/lmra/validation.ts
 * for the established shape.
 */

// `as const` tuples, not a cast of modules/scaffolds/types.ts's mutable
// arrays — see modules/observations/validation.ts's comment on why.
const SCAFFOLD_TYPE_VALUES = [
  "independent",
  "birdcage",
  "mobile",
  "suspended",
  "cantilever",
  "access_tower",
  "loading_bay",
  "temporary_roof",
  "other",
] as const;

export const scaffoldFormSchema = z.object({
  projectId: z.string().uuid("Choose a project"),
  tagNumber: z.string().trim().min(1, "Tag number is required"),
  workArea: z.string().trim().min(1, "Work area is required"),
  structureReference: optionalText,
  scaffoldType: z.enum(SCAFFOLD_TYPE_VALUES),
  intendedUse: z.string().trim().min(1, "Intended use is required"),
  maxLoadClass: z.string().trim().min(1, "Maximum permitted load or load class is required"),
  maxHeightMeters: z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (value === "" || value === undefined) return undefined;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        ctx.addIssue({ code: "custom", message: "Enter a positive height" });
        return undefined;
      }
      return parsed;
    }),
  erectedBy: optionalText,
  responsibleForemanId: z.string().uuid("Choose the responsible foreman"),
  erectedAt: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" || value === undefined ? undefined : value))
    .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").optional()),
  notes: optionalText,
});
export type ScaffoldFormInput = z.infer<typeof scaffoldFormSchema>;

const SCAFFOLD_INSPECTION_REASON_VALUES = [
  "initial_handover",
  "routine_inspection",
  "after_modification",
  "after_severe_weather",
  "after_impact_incident",
  "after_relocation",
  "reinspection_following_defects",
  "other",
] as const;

/** Create — core fields only. The checklist is a separate, per-section action (mirrors modules/lmra's separation of core fields from the hazard checklist). */
export const inspectionFormSchema = z
  .object({
    inspectionReason: z.enum(SCAFFOLD_INSPECTION_REASON_VALUES),
    previousInspectionId: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value === "" || value === undefined ? undefined : value))
      .pipe(z.string().uuid().optional()),
    inspectorId: z.string().uuid("Choose the inspector"),
    inspectedAt: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a valid date and time"),
    notes: optionalText,
  })
  .refine((data) => data.inspectionReason !== "reinspection_following_defects" || Boolean(data.previousInspectionId), {
    message: "A re-inspection following defects must reference the earlier inspection",
    path: ["previousInspectionId"],
  });
export type InspectionFormInput = z.infer<typeof inspectionFormSchema>;

const SCAFFOLD_INSPECTION_ITEM_RESULT_VALUES = ["acceptable", "defect_found", "not_applicable"] as const;
const SCAFFOLD_DEFECT_SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const;

const SCAFFOLD_INSPECTION_ITEM_TYPE_VALUES = [
  "foundation_sole_boards",
  "base_plates_adjustable_bases",
  "standards",
  "ledgers",
  "transoms",
  "bracing",
  "ties_anchors",
  "platforms_decking",
  "guardrails",
  "midrails",
  "toe_boards",
  "access_ladders_stairways",
  "access_gates",
  "loading_bays",
  "sheet_netting_condition",
  "falling_object_controls",
  "scaffold_tag_signage",
  "housekeeping",
  "maximum_load_information",
  "electrical_clearance",
  "vehicle_mobile_equipment_protection",
  "unauthorized_alterations",
  "overall_stability",
  "other_identified_issue",
] as const;

/** One row of the 24-item checklist. */
export const inspectionItemSchema = z.object({
  itemType: z.enum(SCAFFOLD_INSPECTION_ITEM_TYPE_VALUES),
  result: z.enum(SCAFFOLD_INSPECTION_ITEM_RESULT_VALUES),
  comment: z.string().trim(),
  requiredCorrectiveAction: z.string().trim(),
  severity: z.enum(SCAFFOLD_DEFECT_SEVERITY_VALUES).nullable(),
});

/** The whole checklist submitted together — exactly 24 rows, matching what create_initial_scaffold_inspection_items() seeds. */
export const inspectionItemsFormSchema = z.array(inspectionItemSchema).length(SCAFFOLD_INSPECTION_ITEM_TYPE_VALUES.length, `Expected exactly ${SCAFFOLD_INSPECTION_ITEM_TYPE_VALUES.length} checklist rows`);
export type InspectionItemsFormInput = z.infer<typeof inspectionItemsFormSchema>;

const SCAFFOLD_INSPECTION_OUTCOME_VALUES = ["safe_for_use", "safe_with_restrictions", "unsafe_do_not_use", "awaiting_corrective_action", "closed_dismantled"] as const;

/** Finalize-time confirmation — the outcome plus restrictions when required (validate_scaffold_inspection_update() in the migration enforces this too; this schema catches the same mistake earlier, before ever reaching the database). */
export const finalizeInspectionFormSchema = z
  .object({
    outcome: z.enum(SCAFFOLD_INSPECTION_OUTCOME_VALUES),
    restrictionsNotes: optionalText,
  })
  .refine((data) => data.outcome !== "safe_with_restrictions" || Boolean(data.restrictionsNotes?.trim()), {
    message: "Restrictions must be recorded when the outcome is safe with restrictions",
    path: ["restrictionsNotes"],
  });
export type FinalizeInspectionFormInput = z.infer<typeof finalizeInspectionFormSchema>;

/** Starting a correction to an already-finalized inspection — a reason is required (mirrors the reopen/reject reason requirement pattern used across every other HSEQ module this session). */
export const correctionReasonFormSchema = z.object({
  correctionReason: z.string().trim().min(1, "A reason is required"),
});
export type CorrectionReasonFormInput = z.infer<typeof correctionReasonFormSchema>;
