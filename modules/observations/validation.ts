import { z } from "zod";
import { optionalText } from "@/lib/validation";

/**
 * Server Function validation for the Safety Observations domain — see
 * docs/API_CONVENTIONS.md §5 and modules/lmra/validation.ts for the
 * established shape.
 */

// `as const` tuples, not a cast of modules/observations/types.ts's mutable
// arrays — same convention as modules/projects/validation.ts's
// PROJECT_STATUS_VALUES: z.enum() needs a readonly literal tuple to infer
// the strict union (not just `string`), which a `Foo[] as [string,
// ...string[]]` cast would erase.
const CATEGORY_VALUES = [
  "positive_observation",
  "unsafe_act",
  "unsafe_condition",
  "line_of_fire",
  "working_at_height",
  "falling_objects",
  "material_handling",
  "housekeeping",
  "tools_equipment",
  "mobile_equipment_mewp",
  "access_egress",
  "ppe",
  "other",
] as const;
const RISK_LEVEL_VALUES = ["low", "medium", "high", "critical"] as const;
const TARGET_TYPE_VALUES = ["employee", "daily_team", "general"] as const;
const OBSERVATION_TYPE_VALUES = ["positive", "negative", "general"] as const;
const DISPOSITION_VALUES = ["no_action", "coaching", "corrective_action", "formal_warning"] as const;

/** `datetime-local` input format (`YYYY-MM-DDTHH:mm`) — the browser's own native value shape, converted to a full ISO timestamp in the Server Function (see modules/observations/actions.ts). */
const requiredLocalDateTime = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a valid date and time");

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

export const observationFormSchema = z
  .object({
    projectId: z.string().uuid("Choose a project"),
    workArea: z.string().trim().min(1, "Work area is required").max(100, "Keep it under 100 characters"),
    observedAt: requiredLocalDateTime,
    observerId: z.string().uuid("Choose who made this observation"),
    category: z.enum(CATEGORY_VALUES),
    description: z.string().trim().min(1, "Description is required").max(2000, "Keep it under 2000 characters"),
    immediateActionTaken: optionalText,
    riskLevel: z.enum(RISK_LEVEL_VALUES),
    isStopWork: z.boolean(),
    observationType: z.enum(OBSERVATION_TYPE_VALUES),
    targetType: z.enum(TARGET_TYPE_VALUES),
    targetEmployeeId: optionalUuid,
    targetDailyTeamId: optionalUuid,
    disposition: z.enum(DISPOSITION_VALUES).optional(),
  })
  // Mirrors safety_observations_target_consistency exactly — the DB
  // constraint is the real, authoritative gate; this just catches the same
  // mistake earlier, before ever reaching the database.
  .refine((data) => (data.targetType === "employee" ? Boolean(data.targetEmployeeId) : true), { message: "Choose an employee", path: ["targetEmployeeId"] })
  .refine((data) => (data.targetType === "daily_team" ? Boolean(data.targetDailyTeamId) : true), { message: "Choose a Today's Team", path: ["targetDailyTeamId"] })
  .refine((data) => (data.targetType !== "employee" ? !data.targetEmployeeId : true), { message: "Change the target type first", path: ["targetEmployeeId"] })
  .refine((data) => (data.targetType !== "daily_team" ? !data.targetDailyTeamId : true), { message: "Change the target type first", path: ["targetDailyTeamId"] })
  // Mirrors safety_observations_disposition_only_when_negative.
  .refine((data) => (data.disposition ? data.observationType === "negative" : true), { message: "A disposition only applies to a negative observation", path: ["disposition"] });
export type ObservationFormInput = z.infer<typeof observationFormSchema>;

/** Worker picker — the desired final set of participant employee ids, optional ("people involved, where appropriate"). */
export const observationParticipantsFormSchema = z.array(z.string().uuid()).max(200, "Too many workers selected");
export type ObservationParticipantsFormInput = z.infer<typeof observationParticipantsFormSchema>;
