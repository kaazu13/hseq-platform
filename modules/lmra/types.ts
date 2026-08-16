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
  // Items 3/4: simple-English wording (short sentences, common words, one
  // instruction per line) plus an explicit harness control — previously
  // only "100% tie-off required" implied harness use; that is now its own,
  // separate line so the two distinct requirements are never conflated.
  working_at_height: [
    "Approved scaffold or work platform",
    "Safety harness worn and correctly fitted",
    "100% tie-off maintained where required",
    "Connected to an approved anchor point",
    "Scaffold inspected and tagged before use",
    "Tools secured against falling",
    "Keep the area below clear or barricaded",
    "Rescue plan understood and available",
  ],
  falling_objects: [
    "Keep people out of the area below",
    "Toe boards or debris netting installed",
    "Secure tools and materials so they cannot fall",
    "Overhead protection in place",
    "Put up warning signs",
  ],
  line_of_fire: [
    "Keep away from moving equipment",
    "Do not stand below suspended loads",
    "Keep hands away from pinch/crush points",
    "Barricade the danger area where needed",
    "Make sure the operator can see you",
    "Use a spotter when needed",
  ],
  manual_material_handling: [
    "Use mechanical aids where possible",
    "Use a team lift for heavy or awkward items",
    "Use the correct lifting technique",
    "Keep the pathway clear",
  ],
  lifting_operations: [
    "Lift plan is ready",
    "Use certified lifting equipment and slings",
    "Appointed person or banksman assigned",
    "Keep people out of the lifting area",
    "Check the load path for obstructions",
  ],
  mobile_equipment_mewp: [
    "Operator is certified and competent",
    "Complete a pre-use inspection",
    "Check ground conditions",
    "Put up barriers around the work area",
    "Wear harness and lanyard in the MEWP basket",
  ],
  weather_conditions: [
    "Check wind speed against work limits",
    "Stop work in lightning or severe weather",
    "Check surfaces for ice or rain slip hazard",
    "Check the weather forecast before starting",
  ],
  access_egress: [
    "Check the access route is clear",
    "Ladders and stairs are secure and in good condition",
    "Know the emergency exit route",
    "Keep walkways clear and tidy",
  ],
  housekeeping: [
    "Keep the work area clear of debris",
    "Store materials tidily and safely",
    "Remove waste regularly",
    "Find and remove trip hazards",
  ],
  tools_equipment: [
    "Inspect tools before use",
    "Use the correct tool for the task",
    "Keep guards and safety devices in place",
    "Remove damaged tools from use",
  ],
  simultaneous_operations: [
    "Coordinate work with other trades and teams",
    "Have a communication plan for simultaneous work",
    "Check schedules do not conflict",
    "Clearly mark shared work areas",
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

/**
 * Item 2: "Add My Today's Team" — the employee ids to merge into Workers
 * involved for one Today's Team (its Foreman, if any, every current
 * worker, and the caller themselves), deduplicated. A plain, pure
 * function so the dedup guarantee is directly unit-testable without a
 * request context — modules/lmra/actions.ts's getMyTodaysTeamForLmra()
 * is the only caller.
 */
export function buildMyTodaysTeamParticipantIds(team: { foreman: Pick<BasicEmployee, "id"> | null; workers: { employee: Pick<BasicEmployee, "id"> }[] }, myEmployeeId: string): string[] {
  return [...new Set([...(team.foreman ? [team.foreman.id] : []), ...team.workers.map((member) => member.employee.id), myEmployeeId])];
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
// ── List date-range presets (post-audit performance fix, Part 7) ──────
// The LMRA list previously had no default date window and could fetch a
// project's entire history unfiltered. "Last 30 days" is now the default,
// SHOWN as the active preset in the UI (never a silent filter behind an
// "All" label) — the other presets, including an explicit "All time" that
// still paginates rather than fetching everything, are one click away.
export type LmraDateRangePreset = "today" | "7d" | "30d" | "month" | "custom" | "all";

export const LMRA_DATE_RANGE_PRESETS: LmraDateRangePreset[] = ["today", "7d", "30d", "month", "custom", "all"];

export const LMRA_DATE_RANGE_PRESET_LABELS: Record<LmraDateRangePreset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
  custom: "Custom range",
  all: "All time",
};

export const LMRA_DEFAULT_DATE_RANGE_PRESET: LmraDateRangePreset = "30d";

/**
 * Pure date-window resolver for a preset — `referenceDate` defaults to
 * "now" but is an explicit param so this stays testable without mocking
 * the clock. `custom` returns whatever dateFrom/dateTo the caller already
 * has (from the URL); `all` returns neither (no date filter — the page
 * still MUST paginate in that case, this function has no say over that).
 */
export function resolveLmraDateRange(
  preset: LmraDateRangePreset,
  custom: { dateFrom?: string; dateTo?: string } = {},
  referenceDate: Date = new Date(),
): { dateFrom?: string; dateTo?: string } {
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));

  switch (preset) {
    case "today":
      return { dateFrom: toIso(today), dateTo: toIso(today) };
    case "7d": {
      const from = new Date(today);
      from.setUTCDate(from.getUTCDate() - 6);
      return { dateFrom: toIso(from), dateTo: toIso(today) };
    }
    case "30d": {
      const from = new Date(today);
      from.setUTCDate(from.getUTCDate() - 29);
      return { dateFrom: toIso(from), dateTo: toIso(today) };
    }
    case "month": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { dateFrom: toIso(from), dateTo: toIso(today) };
    }
    case "custom":
      return { dateFrom: custom.dateFrom, dateTo: custom.dateTo };
    case "all":
      return {};
  }
}

export const LMRA_WORK_AREA_MAX_LENGTH = 100;
export const LMRA_WORK_ACTIVITY_MAX_LENGTH = 200;
export const LMRA_NOTES_MAX_LENGTH = 2000;
export const LMRA_REVIEW_NOTES_MAX_LENGTH = 2000;
export const LMRA_STOP_WORK_REASON_MAX_LENGTH = 2000;
export const LMRA_OTHER_DESCRIPTION_MAX_LENGTH = 150;
export const LMRA_CONTROL_TEXT_MAX_LENGTH = 1000;
export const LMRA_MAX_PARTICIPANTS = 200;
export const LMRA_MAX_SELECTED_CONTROLS = 20;
