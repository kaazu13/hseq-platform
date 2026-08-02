import type { Database, Enums } from "@/types/database";

/**
 * LMRA (Last Minute Risk Assessment) — see
 * supabase/migrations/20260801090000_lmra.sql and
 * docs/DATABASE_SCHEMA.md §6 (`lmra_assessments`/`lmra_participants`).
 * Mirrors modules/projects/types.ts's shape: a friendly domain alias layer
 * over the generated Database type, plus the fixed-vocabulary constants the
 * UI renders from.
 */
export type LmraAssessment = Database["public"]["Tables"]["lmra_assessments"]["Row"];
export type LmraHazard = Database["public"]["Tables"]["lmra_hazards"]["Row"];
export type LmraParticipant = Database["public"]["Tables"]["lmra_participants"]["Row"];

export type LmraStatus = Enums<"lmra_status">;
export type LmraResult = Enums<"lmra_result">;
export type LmraHazardType = Enums<"lmra_hazard_type">;

export const LMRA_STATUSES: LmraStatus[] = ["draft", "submitted", "approved", "rejected", "archived"];

export const LMRA_STATUS_LABELS: Record<LmraStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Archived",
};

export const LMRA_RESULT_LABELS: Record<LmraResult, string> = {
  go: "Go",
  no_go: "No-Go — Stop Work",
};

/**
 * Fixed 12-item scaffolding hazard checklist, in the order every assessment
 * gets them created (matches the enum's declared order — see
 * create_initial_lmra_hazards() in the migration) — the UI always renders
 * them in this same order, never re-sorted alphabetically.
 */
export const LMRA_HAZARD_TYPES: LmraHazardType[] = [
  "working_at_height",
  "falling_objects",
  "line_of_fire",
  "manual_material_handling",
  "lifting_operations",
  "mobile_equipment_mewp",
  "weather_conditions",
  "access_egress",
  "housekeeping",
  "tools_equipment",
  "simultaneous_operations",
  "other",
];

export const LMRA_HAZARD_TYPE_LABELS: Record<LmraHazardType, string> = {
  working_at_height: "Working at height",
  falling_objects: "Falling objects",
  line_of_fire: "Line of fire",
  manual_material_handling: "Manual material handling",
  lifting_operations: "Lifting operations",
  mobile_equipment_mewp: "Mobile equipment and MEWP",
  weather_conditions: "Weather conditions",
  access_egress: "Access and egress",
  housekeeping: "Housekeeping",
  tools_equipment: "Tools and equipment",
  simultaneous_operations: "Simultaneous operations",
  other: "Other identified hazards",
};

/**
 * The narrow, approved column set `get_basic_employee_info()` returns —
 * see modules/projects/types.ts's identical comment for why this is
 * derived from the RPC's own return shape, never a raw `employees` select.
 */
export type BasicEmployee = Database["public"]["Functions"]["get_basic_employee_info"]["Returns"][number];

export type LmraHazardInput = {
  hazardType: LmraHazardType;
  isApplicable: boolean;
  controls: string;
  responsiblePersonId: string | null;
  controlsConfirmed: boolean;
  otherDescription: string;
};

/** One assessment with everything a detail/edit page needs, resolved in one place. */
export type LmraAssessmentDetail = LmraAssessment & {
  foreman: BasicEmployee | null;
  hazards: (LmraHazard & { responsiblePerson: BasicEmployee | null })[];
  participants: (LmraParticipant & { employee: BasicEmployee })[];
};
