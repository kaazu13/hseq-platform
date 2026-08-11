import type { Database, Enums } from "@/types/database";

/**
 * LMRA (Last Minute Risk Assessment) — see
 * supabase/migrations/20260801090000_lmra.sql and
 * supabase/migrations/20260816090000_lmra_daily_workforce_redesign.sql.
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
export type LmraShift = Enums<"lmra_shift">;

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

/** Controlled shift vocabulary (Phase 2) — LMRA-scoped only, see the redesign migration's header comment for why daily_teams.shift stays free text. */
export const LMRA_SHIFTS: LmraShift[] = ["day", "night", "late"];

export const LMRA_SHIFT_LABELS: Record<LmraShift, string> = {
  day: "Day Shift",
  night: "Night Shift",
  late: "Late Shift",
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
 * Fixed, hazard-type-specific predefined common controls (Phase 5) — a
 * closed, not organization-configurable catalogue, same "fixed v1
 * catalogue" convention as LMRA_HAZARD_TYPES itself. Selecting a common
 * control ticks it into `lmra_hazards.selected_controls` (exact-string
 * matched server-side against this same list — see modules/lmra/validation.ts);
 * anything not covered belongs in the separate "additional control measure"
 * free-text field (`controls`), never invented here. `other` has no
 * predefined list — it's inherently a catch-all already served by
 * `other_description`.
 */
export const LMRA_COMMON_CONTROLS: Record<LmraHazardType, string[]> = {
  working_at_height: [
    "Approved scaffold/access platform",
    "Scaffold inspected and tagged",
    "100% tie-off required",
    "Certified anchor point identified",
    "Tools secured against falling",
    "Exclusion zone established",
    "Rescue arrangement confirmed",
  ],
  falling_objects: [
    "Exclusion zone established below work area",
    "Toe boards / debris netting installed",
    "Tools and materials secured/tethered",
    "Overhead protection in place",
    "Warning signage posted",
  ],
  line_of_fire: [
    "Exclusion zone established",
    "Barricades/warning tape in place",
    "No work permitted directly below/above others",
    "Spotter assigned",
  ],
  manual_material_handling: [
    "Mechanical aids used where possible",
    "Team lift for heavy/awkward items",
    "Correct lifting technique briefed",
    "Clear pathway to destination",
  ],
  lifting_operations: [
    "Lift plan in place",
    "Certified lifting equipment and slings",
    "Appointed person / banksman assigned",
    "Exclusion zone established",
    "Load path checked for obstructions",
  ],
  mobile_equipment_mewp: [
    "Operator certified/competent",
    "Pre-use inspection completed",
    "Ground conditions assessed",
    "Exclusion zone / barriers in place",
    "Harness and lanyard used in MEWP basket",
  ],
  weather_conditions: [
    "Wind speed checked against work limits",
    "Work halted in lightning/severe weather",
    "Surfaces checked for ice/rain slip hazard",
    "Weather forecast reviewed before starting",
  ],
  access_egress: [
    "Access route inspected and clear",
    "Ladders/stairs secured and in good condition",
    "Emergency egress route identified",
    "Housekeeping maintained on walkways",
  ],
  housekeeping: [
    "Work area kept clear of debris",
    "Materials stored tidily and stably",
    "Waste removed regularly",
    "Trip hazards identified and removed",
  ],
  tools_equipment: [
    "Tools inspected before use",
    "Correct tool for the task",
    "Guards/safety devices in place",
    "Damaged tools removed from service",
  ],
  simultaneous_operations: [
    "Work coordinated with other trades/teams",
    "SIMOPS communication plan in place",
    "Schedules deconflicted",
    "Common work areas clearly demarcated",
  ],
  other: [],
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
  selectedControls: string[];
  controls: string;
  responsiblePersonId: string | null;
  controlsConfirmed: boolean;
  otherDescription: string;
};

/**
 * The human-readable LMRA reference shown on the view page, PDF, and
 * shared report — derived from the record's own id (never a separately
 * stored/allocated sequence, matching modules/scaffolds/types.ts's
 * formatInspectionReference()'s "derive, don't duplicate-store"
 * convention) — LMRA has no natural per-project numbering the way a
 * scaffold does, so the first 8 hex characters of its uuid, uppercased,
 * are used as a short, stable, collision-safe-enough label.
 */
export function formatLmraReference(assessment: Pick<LmraAssessment, "id">): string {
  return `LMRA-${assessment.id.slice(0, 8).toUpperCase()}`;
}

/**
 * The 12 fresh, all-inapplicable rows a brand-new create form starts from
 * — a plain function, deliberately kept in this neutral (no "use client")
 * file so a Server Component page can call it directly when composing
 * initial props, same reason modules/employees/employee-options.ts's
 * toEmployeeOptions() lives outside any client component file.
 */
export function initialLmraHazardRows(): LmraHazardInput[] {
  return LMRA_HAZARD_TYPES.map((hazardType) => ({
    hazardType,
    isApplicable: false,
    selectedControls: [],
    controls: "",
    responsiblePersonId: null,
    controlsConfirmed: false,
    otherDescription: "",
  }));
}

/** Converts an existing assessment's 12 `lmra_hazards` DB rows into the edit form's camelCase input shape, in LMRA_HAZARD_TYPES' fixed order. */
export function lmraHazardInputsFromRows(hazards: Pick<LmraHazard, "hazard_type" | "is_applicable" | "selected_controls" | "controls" | "responsible_person_id" | "controls_confirmed" | "other_description">[]): LmraHazardInput[] {
  const byType = new Map(hazards.map((row) => [row.hazard_type, row]));
  return LMRA_HAZARD_TYPES.map((hazardType) => {
    const row = byType.get(hazardType);
    return {
      hazardType,
      isApplicable: row?.is_applicable ?? false,
      selectedControls: row?.selected_controls ?? [],
      controls: row?.controls ?? "",
      responsiblePersonId: row?.responsible_person_id ?? null,
      controlsConfirmed: row?.controls_confirmed ?? false,
      otherDescription: row?.other_description ?? "",
    };
  });
}

/** One assessment with everything a detail/edit page needs, resolved in one place. */
export type LmraAssessmentDetail = LmraAssessment & {
  completedBy: BasicEmployee | null;
  responsiblePerson: BasicEmployee | null;
  hazards: (LmraHazard & { responsiblePerson: BasicEmployee | null })[];
  participants: (LmraParticipant & { employee: BasicEmployee })[];
};

// ── Input limits (Phase 10) — mirrored exactly by the DB-level CHECK
// constraints added in the redesign migration; Zod (modules/lmra/validation.ts)
// is the primary gate, these are the single source both reference so the
// two never drift silently.
export const LMRA_WORK_AREA_MAX_LENGTH = 100;
export const LMRA_WORK_ACTIVITY_MAX_LENGTH = 200;
export const LMRA_NOTES_MAX_LENGTH = 2000;
export const LMRA_REVIEW_NOTES_MAX_LENGTH = 2000;
export const LMRA_STOP_WORK_REASON_MAX_LENGTH = 2000;
export const LMRA_OTHER_DESCRIPTION_MAX_LENGTH = 150;
export const LMRA_CONTROL_TEXT_MAX_LENGTH = 1000;
export const LMRA_MAX_PARTICIPANTS = 200;
export const LMRA_MAX_SELECTED_CONTROLS = 20;
