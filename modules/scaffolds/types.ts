import type { Database, Enums } from "@/types/database";

/**
 * Scaffolds and Scaffold Inspections — see
 * supabase/migrations/20260803120000_scaffold_inspections.sql and
 * docs/DATABASE_SCHEMA.md §6 (`scaffold_inspections`). Mirrors
 * modules/lmra/types.ts's shape: a friendly domain alias layer over the
 * generated Database type, plus the fixed-vocabulary constants the UI
 * renders from. Bundles the scaffold register, inspections, and the
 * inspection checklist together (one tightly-bound aggregate — a
 * checklist item is meaningless without its inspection, an inspection
 * meaningless without its scaffold), the same way modules/lmra/ bundles
 * assessments/hazards/participants. Defects are a SEPARATE module
 * (modules/scaffold-defects/) — same "aggregate vs. independently-listed
 * remediation tracking" split as observations vs. corrective-actions.
 */
export type Scaffold = Database["public"]["Tables"]["scaffolds"]["Row"];
export type ScaffoldInspection = Database["public"]["Tables"]["scaffold_inspections"]["Row"];
export type ScaffoldInspectionItem = Database["public"]["Tables"]["scaffold_inspection_items"]["Row"];
/** Legacy manual roster (pre-V2) — still rendered for scaffolds that already have rows here, never written to by new create/edit flows. See ScaffoldErectionTeam below for the V2 replacement. */
export type ScaffoldTeamMember = Database["public"]["Tables"]["scaffold_team_members"]["Row"];
/** V2 (Part 4C): a real link to one of the scaffold's Today's Teams (daily_teams), scoped to its erection date — replaces the manual roster for every scaffold created going forward. */
export type ScaffoldErectionTeam = Database["public"]["Tables"]["scaffold_erection_teams"]["Row"];
/** V2 (Part 4F): a completion photo of the finished scaffold. */
export type ScaffoldPhoto = Database["public"]["Tables"]["scaffold_photos"]["Row"];

export type ScaffoldType = Enums<"scaffold_type">;
export type ScaffoldStatus = Enums<"scaffold_status">;
export type ScaffoldInspectionStatus = Enums<"scaffold_inspection_status">;
export type ScaffoldInspectionOutcome = Enums<"scaffold_inspection_outcome">;
export type ScaffoldInspectionReason = Enums<"scaffold_inspection_reason">;
export type ScaffoldInspectionItemType = Enums<"scaffold_inspection_item_type">;
export type ScaffoldInspectionItemResult = Enums<"scaffold_inspection_item_result">;
export type ScaffoldDefectSeverity = Enums<"scaffold_defect_severity">;

export const SCAFFOLD_TYPES: ScaffoldType[] = [
  "independent",
  "birdcage",
  "mobile",
  "suspended",
  "cantilever",
  "access_tower",
  "loading_bay",
  "temporary_roof",
  "other",
];

export const SCAFFOLD_TYPE_LABELS: Record<ScaffoldType, string> = {
  independent: "Independent scaffold",
  birdcage: "Birdcage scaffold",
  mobile: "Mobile scaffold",
  suspended: "Suspended scaffold",
  cantilever: "Cantilever scaffold",
  access_tower: "Access tower",
  loading_bay: "Loading bay",
  temporary_roof: "Temporary roof",
  other: "Other",
};

export const SCAFFOLD_STATUSES: ScaffoldStatus[] = ["pending_inspection", "safe", "restricted", "awaiting_corrective_action", "unsafe", "closed"];

export const SCAFFOLD_STATUS_LABELS: Record<ScaffoldStatus, string> = {
  pending_inspection: "Pending inspection",
  safe: "Safe",
  restricted: "Restricted",
  awaiting_corrective_action: "Awaiting corrective action",
  unsafe: "Unsafe",
  closed: "Closed / dismantled",
};

export const SCAFFOLD_INSPECTION_STATUSES: ScaffoldInspectionStatus[] = ["draft", "finalized"];

export const SCAFFOLD_INSPECTION_STATUS_LABELS: Record<ScaffoldInspectionStatus, string> = {
  draft: "Draft",
  finalized: "Finalized",
};

export const SCAFFOLD_INSPECTION_OUTCOMES: ScaffoldInspectionOutcome[] = [
  "safe_for_use",
  "safe_with_restrictions",
  "unsafe_do_not_use",
  "awaiting_corrective_action",
  "closed_dismantled",
];

export const SCAFFOLD_INSPECTION_OUTCOME_LABELS: Record<ScaffoldInspectionOutcome, string> = {
  safe_for_use: "Safe for use",
  safe_with_restrictions: "Safe with restrictions",
  unsafe_do_not_use: "Unsafe — do not use",
  awaiting_corrective_action: "Awaiting corrective action",
  closed_dismantled: "Closed / dismantled",
};

export const SCAFFOLD_INSPECTION_REASONS: ScaffoldInspectionReason[] = [
  "initial_handover",
  "routine_inspection",
  "after_modification",
  "after_severe_weather",
  "after_impact_incident",
  "after_relocation",
  "reinspection_following_defects",
  "other",
];

export const SCAFFOLD_INSPECTION_REASON_LABELS: Record<ScaffoldInspectionReason, string> = {
  initial_handover: "Initial handover",
  routine_inspection: "Routine inspection",
  after_modification: "After modification",
  after_severe_weather: "After severe weather",
  after_impact_incident: "After impact or incident",
  after_relocation: "After relocation",
  reinspection_following_defects: "Re-inspection following defects",
  other: "Other",
};

/**
 * Fixed 24-item checklist, in the order create_initial_scaffold_inspection_items()
 * seeds them — the UI always renders them in this order, never re-sorted
 * (same convention as modules/lmra/types.ts's LMRA_HAZARD_TYPES).
 */
export const SCAFFOLD_INSPECTION_ITEM_TYPES: ScaffoldInspectionItemType[] = [
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
];

export const SCAFFOLD_INSPECTION_ITEM_TYPE_LABELS: Record<ScaffoldInspectionItemType, string> = {
  foundation_sole_boards: "Foundation and sole boards",
  base_plates_adjustable_bases: "Base plates and adjustable bases",
  standards: "Standards",
  ledgers: "Ledgers",
  transoms: "Transoms",
  bracing: "Bracing",
  ties_anchors: "Ties and anchors",
  platforms_decking: "Platforms and decking",
  guardrails: "Guardrails",
  midrails: "Midrails",
  toe_boards: "Toe boards",
  access_ladders_stairways: "Access ladders or stairways",
  access_gates: "Access gates",
  loading_bays: "Loading bays",
  sheet_netting_condition: "Sheet or netting condition",
  falling_object_controls: "Falling-object controls",
  scaffold_tag_signage: "Scaffold tag and signage",
  housekeeping: "Housekeeping",
  maximum_load_information: "Maximum load information",
  electrical_clearance: "Clearance from electrical hazards",
  vehicle_mobile_equipment_protection: "Protection from vehicles or mobile equipment",
  unauthorized_alterations: "Unauthorized alterations",
  overall_stability: "Overall stability",
  other_identified_issue: "Other identified issue",
};

export const SCAFFOLD_INSPECTION_ITEM_RESULTS: ScaffoldInspectionItemResult[] = ["acceptable", "defect_found", "not_applicable"];

export const SCAFFOLD_INSPECTION_ITEM_RESULT_LABELS: Record<ScaffoldInspectionItemResult, string> = {
  acceptable: "Acceptable",
  defect_found: "Defect found",
  not_applicable: "Not applicable",
};

export const SCAFFOLD_DEFECT_SEVERITIES: ScaffoldDefectSeverity[] = ["low", "medium", "high", "critical"];

export const SCAFFOLD_DEFECT_SEVERITY_LABELS: Record<ScaffoldDefectSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/**
 * The number of days before expiry a valid inspection starts showing as
 * "expiring soon" — this milestone asked for the VALIDITY PERIOD itself
 * to be configurable (project -> company -> system default, resolved
 * in the database — see resolve_scaffold_inspection_validity_days() in
 * the migration), but said nothing about the WARNING THRESHOLD being
 * configurable too. A fixed, documented default here, not a hidden
 * business rule.
 */
export const SCAFFOLD_INSPECTION_EXPIRING_SOON_DAYS = 3;

/** The scaffold's fully time-aware display status — combines the stored `scaffolds.status` snapshot with the CURRENT inspection's expiry, since "a scaffold must not display a valid current status based on an expired inspection" (this milestone's explicit requirement) and "expiring soon"/"expired" are deliberately not stored values (see scaffold_status's comment in the migration). */
export type ScaffoldDisplayStatus = "pending_inspection" | "safe" | "restricted" | "awaiting_corrective_action" | "expiring_soon" | "expired" | "unsafe" | "closed";

export const SCAFFOLD_DISPLAY_STATUS_LABELS: Record<ScaffoldDisplayStatus, string> = {
  pending_inspection: "Pending inspection",
  safe: "Safe",
  restricted: "Restricted",
  awaiting_corrective_action: "Awaiting corrective action",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  unsafe: "Unsafe",
  closed: "Closed / dismantled",
};

/**
 * The real, time-aware status to show — a stored `safe`/`restricted`/
 * `awaiting_corrective_action` status is overridden by `expired` once its
 * current inspection's `expires_at` has passed, or by `expiring_soon`
 * within SCAFFOLD_INSPECTION_EXPIRING_SOON_DAYS of it — an expired
 * inspection must never be displayed as if it were still currently valid.
 * `unsafe`/`closed`/`pending_inspection` are never overridden by expiry —
 * those are already the most severe/least-informative states expiry
 * checking could add nothing to.
 */
export function getScaffoldDisplayStatus(status: ScaffoldStatus, currentInspectionExpiresAt: string | null, now: Date = new Date()): ScaffoldDisplayStatus {
  if (status === "unsafe" || status === "closed" || status === "pending_inspection") return status;

  if (!currentInspectionExpiresAt) return status;

  const expiresAt = new Date(currentInspectionExpiresAt);
  if (expiresAt.getTime() <= now.getTime()) return "expired";

  const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  if (daysUntilExpiry <= SCAFFOLD_INSPECTION_EXPIRING_SOON_DAYS) return "expiring_soon";

  return status;
}

/**
 * The narrow, approved column set `get_basic_employee_info()` returns —
 * see modules/lmra/types.ts's identical comment for why this is derived
 * from the RPC's own return shape, never a raw `employees` select.
 */
export type BasicEmployee = Database["public"]["Functions"]["get_basic_employee_info"]["Returns"][number];

/** A checklist item with its optional linked defect's severity resolved for display — most rendering needs are covered by the raw row itself. */
export type ScaffoldInspectionItemWithResponsible = ScaffoldInspectionItem & {
  responsiblePerson?: BasicEmployee | null;
};

/** One inspection with its checklist and inspector resolved. */
export type ScaffoldInspectionDetail = ScaffoldInspection & {
  inspector: BasicEmployee | null;
  items: ScaffoldInspectionItem[];
};

/** One inspection with its parent scaffold's display fields resolved — backs the project-wide Scaffold Inspections list, where each row must show and link to its scaffold without a separate lookup per row. */
export type ScaffoldInspectionWithScaffold = ScaffoldInspection & {
  scaffold: Pick<Scaffold, "id" | "tag_number" | "scaffold_number" | "work_area">;
};

/** One resolved scaffold team member — the employee fields a display list/print view needs, never more (see get_basic_employee_info()'s own narrow column set). */
export type ScaffoldTeamMemberDetail = {
  id: string;
  employeeId: string;
  teamPosition: number;
  firstName: string;
  lastName: string;
};

/** One resolved erection-team link — the daily team's own display fields (name/shift/work area/foreman/worker count), resolved for the scaffold detail page, never a flattened copy. */
export type ScaffoldErectionTeamDetail = {
  id: string;
  dailyTeamId: string;
  name: string;
  shift: Database["public"]["Tables"]["daily_teams"]["Row"]["shift"];
  workArea: string | null;
  foremanName: string | null;
  workerCount: number;
};

/** One resolved completion photo — a short-lived signed URL for display (the bucket is private; there is no public/stable URL, unlike company logos), never the raw storage path exposed to the client. `uploadedByName` is resolved from `profiles.full_name` (scaffold_photos.uploaded_by is a profile/auth-user id, not an employee id — whoever uploaded a photo may not even have an employees row, e.g. a company_admin). */
export type ScaffoldPhotoDetail = {
  id: string;
  url: string;
  originalFilename: string;
  uploadedByName: string | null;
  uploadedAt: string;
  orderIndex: number;
};

/** One scaffold with everything a detail page needs, resolved in one place. */
export type ScaffoldDetail = Scaffold & {
  responsibleForeman: BasicEmployee | null;
  /** Legacy manual roster — populated ONLY for scaffolds created before V2 that still have scaffold_team_members rows; empty for every V2 scaffold. */
  teamMembers: ScaffoldTeamMemberDetail[];
  /** V2's real Today's Team links — empty for legacy scaffolds that predate this table. */
  erectionTeams: ScaffoldErectionTeamDetail[];
  photos: ScaffoldPhotoDetail[];
};

/**
 * Formats the three optional dimension columns into the required
 * "5.70 m H × 12.00 m L × 1.20 m W" display — omitting whichever
 * dimensions aren't recorded rather than showing a placeholder for them
 * (this milestone's explicit "if only some dimensions exist, show only
 * available dimensions" requirement). Returns null when none are set, so
 * callers can render their own empty state instead of an empty string.
 */
export function formatScaffoldDimensions(scaffold: Pick<Scaffold, "height_metres" | "length_metres" | "width_metres">): string | null {
  const parts: string[] = [];
  if (scaffold.height_metres !== null) parts.push(`${Number(scaffold.height_metres).toFixed(2)} m H`);
  if (scaffold.length_metres !== null) parts.push(`${Number(scaffold.length_metres).toFixed(2)} m L`);
  if (scaffold.width_metres !== null) parts.push(`${Number(scaffold.width_metres).toFixed(2)} m W`);
  return parts.length > 0 ? parts.join(" × ") : null;
}

/**
 * The human-readable scaffold-inspection reference — "SI-{scaffold_number}-
 * {sequence_number}" (e.g. "SI-7723-001"), zero-padded to at least 3
 * digits. Purely derived, never stored (matches formatScaffoldDimensions()/
 * getScaffoldDisplayStatus()'s "derive, don't duplicate-store a formatted
 * string" convention) — the durable, uniqueness-bearing values are
 * scaffold_number (unique per project) and sequence_number (lifetime-
 * continuous per scaffold, allocated by the database — see
 * supabase/migrations/20260808090000_scaffold_numbering_and_inspection_reference.sql),
 * both immutable after creation. Deliberately does NOT embed the
 * inspection date — inspected_at is its own separate, independently
 * displayed field; the sequence itself never resets by date.
 */
export function formatInspectionReference(
  scaffold: Pick<Scaffold, "scaffold_number">,
  inspection: Pick<ScaffoldInspection, "sequence_number">,
): string {
  return `SI-${scaffold.scaffold_number}-${String(inspection.sequence_number).padStart(3, "0")}`;
}

/**
 * Suggested, documented scaffold-team-size bound — the milestone's own
 * suggested range (minimum 1, maximum 50). Enforced both here (zod) and
 * loosely backstopped by the database's own generous `team_position`
 * range check (1-200) — the app-layer limit is the real, single source of
 * truth for "reasonable," not the database's wider allowance.
 */
export const SCAFFOLD_TEAM_MIN_SIZE = 1;
export const SCAFFOLD_TEAM_MAX_SIZE = 50;

// ── Scaffold completion photos (Part 4F) ───────────────────────────────
export const SCAFFOLD_PHOTOS_MAX_COUNT = 30;
export const SCAFFOLD_PHOTO_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per raw upload
