import type { Database, Enums } from "@/types/database";

/**
 * Safety Observations — see
 * supabase/migrations/20260802120000_safety_observations_and_corrective_actions.sql
 * and docs/DATABASE_SCHEMA.md §6 (`safety_observations`). Mirrors
 * modules/lmra/types.ts's shape: a friendly domain alias layer over the
 * generated Database type, plus the fixed-vocabulary constants the UI
 * renders from.
 */
export type SafetyObservation = Database["public"]["Tables"]["safety_observations"]["Row"];
export type SafetyObservationParticipant = Database["public"]["Tables"]["safety_observation_participants"]["Row"];

export type ObservationCategory = Enums<"observation_category">;
export type ObservationRiskLevel = Enums<"observation_risk_level">;
export type ObservationStatus = Enums<"observation_status">;
export type ObservationTargetType = Enums<"observation_target_type">;
export type ObservationType = Enums<"observation_type">;
export type ObservationNegativeDisposition = Enums<"observation_negative_disposition">;

export const OBSERVATION_STATUSES: ObservationStatus[] = ["open", "closed"];

export const OBSERVATION_STATUS_LABELS: Record<ObservationStatus, string> = {
  open: "Open",
  closed: "Closed",
};

export const OBSERVATION_RISK_LEVELS: ObservationRiskLevel[] = ["low", "medium", "high", "critical"];

export const OBSERVATION_RISK_LEVEL_LABELS: Record<ObservationRiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/** "High-risk" for reporting purposes (e.g. Safety Overview's "Open high-risk observations" count) — matches observation_risk_level's own comment in the migration. */
export const OBSERVATION_HIGH_RISK_LEVELS: ObservationRiskLevel[] = ["high", "critical"];

/**
 * Fixed 13-item category list, in the order this milestone's requirements
 * listed them — the UI always renders them in this order, never re-sorted
 * alphabetically (same convention as modules/lmra/types.ts's
 * LMRA_HAZARD_TYPES).
 */
export const OBSERVATION_CATEGORIES: ObservationCategory[] = [
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
];

export const OBSERVATION_CATEGORY_LABELS: Record<ObservationCategory, string> = {
  positive_observation: "Positive observation",
  unsafe_act: "Unsafe act",
  unsafe_condition: "Unsafe condition",
  line_of_fire: "Line of fire",
  working_at_height: "Working at height",
  falling_objects: "Falling objects",
  material_handling: "Material handling",
  housekeeping: "Housekeeping",
  tools_equipment: "Tools and equipment",
  mobile_equipment_mewp: "Mobile equipment or MEWP",
  access_egress: "Access and egress",
  ppe: "PPE",
  other: "Other",
};

/** True for the one category that isn't a safety issue — drives the dedicated positive-vs-issue badge treatment (docs' "clearly distinguish positive observations from safety issues" requirement), never rendered with the same tone as an unsafe_act/unsafe_condition badge. */
export function isPositiveObservationCategory(category: ObservationCategory): boolean {
  return category === "positive_observation";
}

export const OBSERVATION_TARGET_TYPES: ObservationTargetType[] = ["employee", "daily_team", "general"];

export const OBSERVATION_TARGET_TYPE_LABELS: Record<ObservationTargetType, string> = {
  employee: "Individual employee",
  daily_team: "Today's Team",
  general: "General / no individual",
};

/**
 * positive / negative / general — INDEPENDENT of `category` above (see
 * supabase/migrations/20260814090000_observation_targeting.sql's header
 * comment for why: category is WHAT was observed, this is the INTENT/
 * TONE, and the two can genuinely disagree — e.g. a `category=
 * unsafe_condition` observation reporting a hazard can itself be
 * `observation_type=positive` when praising the reporter's vigilance).
 */
export const OBSERVATION_TYPES: ObservationType[] = ["positive", "negative", "general"];

export const OBSERVATION_TYPE_LABELS: Record<ObservationType, string> = {
  positive: "Positive",
  negative: "Negative",
  general: "General",
};

/** For a NEGATIVE observation only — a plain classification label for what, if anything, followed. Never auto-creates a corrective action or a disciplinary record — see the migration's column comment. */
export const OBSERVATION_NEGATIVE_DISPOSITIONS: ObservationNegativeDisposition[] = ["no_action", "coaching", "corrective_action", "formal_warning"];

export const OBSERVATION_NEGATIVE_DISPOSITION_LABELS: Record<ObservationNegativeDisposition, string> = {
  no_action: "No further action",
  coaching: "Coaching",
  corrective_action: "Corrective action",
  formal_warning: "Formal warning",
};

/**
 * The narrow, approved column set `get_basic_employee_info()` returns —
 * see modules/lmra/types.ts's identical comment for why this is derived
 * from the RPC's own return shape, never a raw `employees` select.
 */
export type BasicEmployee = Database["public"]["Functions"]["get_basic_employee_info"]["Returns"][number];

/** One observation with everything a detail page needs, resolved in one place. */
export type SafetyObservationDetail = SafetyObservation & {
  observer: BasicEmployee | null;
  participants: (SafetyObservationParticipant & { employee: BasicEmployee })[];
  targetEmployee: BasicEmployee | null;
  targetDailyTeam: { id: string; name: string; work_date: string } | null;
};

/** The human-readable observation reference shown on the PDF/shared report — same "derive from the record's own id" convention as modules/lmra/types.ts's formatLmraReference(), since observations have no natural per-project numbering. */
export function formatObservationReference(observation: Pick<SafetyObservation, "id">): string {
  return `OBS-${observation.id.slice(0, 8).toUpperCase()}`;
}
