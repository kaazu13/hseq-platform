import type { Database, Enums } from "@/types/database";

/**
 * Equipment V2 — see supabase/migrations/20260827090000_equipment.sql's
 * header comment for the full domain-model rationale (one table for both
 * serialized assets and quantity-based consumables, company-wide vs
 * project-issued stock via the same nullable-project_id precedent
 * safety_flashes already established, item-level history only — request
 * decisions are their own complete history by construction).
 */
export type EquipmentItem = Database["public"]["Tables"]["equipment_items"]["Row"];
export type EquipmentAssignment = Database["public"]["Tables"]["equipment_assignments"]["Row"];
export type EquipmentRequest = Database["public"]["Tables"]["equipment_requests"]["Row"];
export type EquipmentHistoryEntry = Database["public"]["Tables"]["equipment_history"]["Row"];

export type EquipmentTrackingMode = Enums<"equipment_tracking_mode">;
export type EquipmentStatus = Enums<"equipment_status">;
export type EquipmentCondition = Enums<"equipment_condition">;
export type EquipmentAssignmentStatus = Enums<"equipment_assignment_status">;
export type EquipmentRequestStatus = Enums<"equipment_request_status">;
export type EquipmentHistoryEvent = Enums<"equipment_history_event">;

export const EQUIPMENT_TRACKING_MODES: EquipmentTrackingMode[] = ["serialized", "quantity"];
export const EQUIPMENT_TRACKING_MODE_LABELS: Record<EquipmentTrackingMode, string> = {
  serialized: "Individually tracked",
  quantity: "Quantity / consumable",
};

export const EQUIPMENT_STATUSES: EquipmentStatus[] = ["available", "issued", "reserved", "out_of_service", "lost", "retired"];
export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  available: "Available",
  issued: "Issued",
  reserved: "Reserved",
  out_of_service: "Out of Service",
  lost: "Lost",
  retired: "Retired",
};

export const EQUIPMENT_CONDITIONS: EquipmentCondition[] = ["new", "good", "worn", "damaged", "requires_inspection"];
export const EQUIPMENT_CONDITION_LABELS: Record<EquipmentCondition, string> = {
  new: "New",
  good: "Good",
  worn: "Worn",
  damaged: "Damaged",
  requires_inspection: "Requires Inspection",
};

export const EQUIPMENT_ASSIGNMENT_STATUS_LABELS: Record<EquipmentAssignmentStatus, string> = {
  active: "Active",
  returned: "Returned",
  lost: "Lost",
  written_off: "Written Off",
};

export const EQUIPMENT_REQUEST_STATUSES: EquipmentRequestStatus[] = ["pending", "approved", "denied", "fulfilled", "cancelled", "returned"];
export const EQUIPMENT_REQUEST_STATUS_LABELS: Record<EquipmentRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
  returned: "Returned for Changes",
};

export const EQUIPMENT_HISTORY_EVENT_LABELS: Record<EquipmentHistoryEvent, string> = {
  added: "Added to inventory",
  edited: "Edited",
  issued: "Issued",
  returned: "Returned",
  damaged: "Marked damaged",
  lost: "Marked lost",
  recovered: "Recovered",
  out_of_service: "Out of service",
  retired: "Retired",
  expiry_updated: "Expiry updated",
};

/**
 * Item 2's global semantic status presentation, applied to Equipment.
 * GREEN = available/good; ORANGE = reserved/worn/requires-inspection;
 * RED = damaged/lost/out-of-service; GRAY = retired.
 */
export function equipmentStatusTone(status: EquipmentStatus): "positive" | "attention" | "negative" | "neutral" {
  switch (status) {
    case "available":
      return "positive";
    case "issued":
      return "neutral";
    case "reserved":
      return "attention";
    case "out_of_service":
    case "lost":
      return "negative";
    case "retired":
      return "neutral";
  }
}

export function equipmentConditionTone(condition: EquipmentCondition): "positive" | "attention" | "negative" | "neutral" {
  switch (condition) {
    case "new":
    case "good":
      return "positive";
    case "worn":
    case "requires_inspection":
      return "attention";
    case "damaged":
      return "negative";
  }
}

/** Pending/Returned = orange; Approved/Fulfilled = green; Denied = red; Cancelled = gray (item 10). */
export function equipmentRequestStatusTone(status: EquipmentRequestStatus): "positive" | "attention" | "negative" | "neutral" {
  switch (status) {
    case "approved":
    case "fulfilled":
      return "positive";
    case "denied":
      return "negative";
    case "cancelled":
      return "neutral";
    case "pending":
    case "returned":
      return "attention";
  }
}

/** The narrow, approved column set get_basic_employee_info() returns — same convention as every other module. */
export type BasicEmployee = Database["public"]["Functions"]["get_basic_employee_info"]["Returns"][number];

/** One inventory row with computed display fields the Inventory view actually renders from. */
export type EquipmentItemWithCounts = EquipmentItem & {
  issuedQuantity: number;
};

export function equipmentIssuedQuantity(item: Pick<EquipmentItem, "quantity" | "available_quantity">): number {
  return Math.max(item.quantity - item.available_quantity, 0);
}

/** One assignment resolved with its employee and item display fields — the Issued view / employee "My Equipment" view's row shape. */
export type EquipmentAssignmentWithDetail = EquipmentAssignment & {
  employee: BasicEmployee;
  item: Pick<EquipmentItem, "id" | "name" | "reference_number" | "category" | "tracking_mode">;
  issuedByName: string | null;
};

/**
 * Part 8: expiry/days-remaining display — exact semantic rules, fixed
 * colors never bound to the user's accent theme (SemanticTone, same
 * convention as every other status in this codebase). `today` is
 * injectable for tests; defaults to the real current date.
 *
 * >30 days remaining -> "128 days remaining" (positive/green, implicit
 * valid). <=30 days remaining (including 0, i.e. expires today) ->
 * "Expires in N days" (attention/orange). Already past -> "Expired N days
 * ago" (negative/red). No expiry set -> "No expiry set" (neutral/gray).
 */
export function describeEquipmentExpiry(expiresAt: string | null, today: Date = new Date()): { label: string; tone: "positive" | "attention" | "negative" | "neutral" } {
  if (!expiresAt) {
    return { label: "No expiry set", tone: "neutral" };
  }

  // Local calendar-date arithmetic (UTC midnight anchors, matching this
  // codebase's established `${value}T00:00:00Z` convention) — never
  // affected by the caller's wall-clock time of day.
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const expiresUtc = Date.parse(`${expiresAt}T00:00:00Z`);
  const daysRemaining = Math.round((expiresUtc - todayUtc) / 86_400_000);

  if (daysRemaining < 0) {
    const daysAgo = -daysRemaining;
    return { label: `Expired ${daysAgo} ${daysAgo === 1 ? "day" : "days"} ago`, tone: "negative" };
  }
  if (daysRemaining <= 30) {
    return { label: `Expires in ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"}`, tone: "attention" };
  }
  return { label: `${daysRemaining} days remaining`, tone: "positive" };
}

export type EquipmentRequestWithDetail = EquipmentRequest & {
  employee: BasicEmployee;
};

export type EquipmentHistoryEntryWithDetail = EquipmentHistoryEntry & {
  employee: BasicEmployee | null;
};

/** A handful of common category suggestions (item 1's examples) — a free-text field, never a hard enum, so this is a UI convenience only, not a DB constraint. */
export const EQUIPMENT_CATEGORY_SUGGESTIONS = [
  "PPE",
  "Fall Protection",
  "Power Tool",
  "Hand Tool",
  "Measuring Device",
  "Electronics",
  "Lifting Accessory",
  "Workwear",
  "Radio / Communication",
] as const;
