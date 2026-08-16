import { describe, it, expect } from "vitest";
import {
  equipmentStatusTone,
  equipmentConditionTone,
  equipmentRequestStatusTone,
  equipmentIssuedQuantity,
  describeEquipmentExpiry,
  EQUIPMENT_STATUSES,
  EQUIPMENT_CONDITIONS,
  EQUIPMENT_REQUEST_STATUSES,
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_CONDITION_LABELS,
  EQUIPMENT_REQUEST_STATUS_LABELS,
  EQUIPMENT_TRACKING_MODE_LABELS,
  EQUIPMENT_ASSIGNMENT_STATUS_LABELS,
  EQUIPMENT_HISTORY_EVENT_LABELS,
} from "./types";

describe("equipmentStatusTone", () => {
  it("maps GREEN=Available, ORANGE=Reserved, RED=Damaged/Lost/OutOfService, GRAY=Retired per item 2's semantic scheme", () => {
    expect(equipmentStatusTone("available")).toBe("positive");
    expect(equipmentStatusTone("reserved")).toBe("attention");
    expect(equipmentStatusTone("out_of_service")).toBe("negative");
    expect(equipmentStatusTone("lost")).toBe("negative");
    expect(equipmentStatusTone("retired")).toBe("neutral");
  });

  it("covers every status enum value with a label — never a raw string leaks through", () => {
    for (const status of EQUIPMENT_STATUSES) {
      expect(equipmentStatusTone(status)).toBeTruthy();
      expect(EQUIPMENT_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe("equipmentConditionTone", () => {
  it("maps GREEN=New/Good, ORANGE=Worn/RequiresInspection, RED=Damaged", () => {
    expect(equipmentConditionTone("new")).toBe("positive");
    expect(equipmentConditionTone("good")).toBe("positive");
    expect(equipmentConditionTone("worn")).toBe("attention");
    expect(equipmentConditionTone("requires_inspection")).toBe("attention");
    expect(equipmentConditionTone("damaged")).toBe("negative");
  });

  it("covers every condition enum value with a label", () => {
    for (const condition of EQUIPMENT_CONDITIONS) {
      expect(equipmentConditionTone(condition)).toBeTruthy();
      expect(EQUIPMENT_CONDITION_LABELS[condition]).toBeTruthy();
    }
  });
});

describe("equipmentRequestStatusTone", () => {
  it("maps Pending/Returned=ORANGE, Approved/Fulfilled=GREEN, Denied=RED, Cancelled=GRAY per item 10", () => {
    expect(equipmentRequestStatusTone("pending")).toBe("attention");
    expect(equipmentRequestStatusTone("returned")).toBe("attention");
    expect(equipmentRequestStatusTone("approved")).toBe("positive");
    expect(equipmentRequestStatusTone("fulfilled")).toBe("positive");
    expect(equipmentRequestStatusTone("denied")).toBe("negative");
    expect(equipmentRequestStatusTone("cancelled")).toBe("neutral");
  });

  it("covers every request status enum value with a label", () => {
    for (const status of EQUIPMENT_REQUEST_STATUSES) {
      expect(equipmentRequestStatusTone(status)).toBeTruthy();
      expect(EQUIPMENT_REQUEST_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe("equipmentIssuedQuantity", () => {
  it("is quantity minus available_quantity", () => {
    expect(equipmentIssuedQuantity({ quantity: 10, available_quantity: 6 })).toBe(4);
  });

  it("is 0 when nothing has been issued", () => {
    expect(equipmentIssuedQuantity({ quantity: 5, available_quantity: 5 })).toBe(0);
  });

  it("never goes negative even if available_quantity is somehow greater (defensive floor)", () => {
    expect(equipmentIssuedQuantity({ quantity: 3, available_quantity: 5 })).toBe(0);
  });
});

describe("describeEquipmentExpiry — Part 8's exact semantic rules", () => {
  const today = new Date("2026-08-16T12:00:00Z");

  it("no expiry set -> gray/neutral", () => {
    expect(describeEquipmentExpiry(null, today)).toEqual({ label: "No expiry set", tone: "neutral" });
  });

  it("more than 30 days remaining -> plain 'N days remaining', positive/green", () => {
    // 2026-08-16 + 128 days = 2026-12-22
    expect(describeEquipmentExpiry("2026-12-22", today)).toEqual({ label: "128 days remaining", tone: "positive" });
  });

  it("exactly 31 days remaining is still the green/positive branch (boundary)", () => {
    expect(describeEquipmentExpiry("2026-09-16", today)).toEqual({ label: "31 days remaining", tone: "positive" });
  });

  it("30 days or fewer remaining -> 'Expires in N days', attention/orange", () => {
    // 2026-08-16 + 18 days = 2026-09-03
    expect(describeEquipmentExpiry("2026-09-03", today)).toEqual({ label: "Expires in 18 days", tone: "attention" });
  });

  it("expiring today (0 days remaining) is still the orange 'expires in' branch, not expired", () => {
    expect(describeEquipmentExpiry("2026-08-16", today)).toEqual({ label: "Expires in 0 days", tone: "attention" });
  });

  it("already past -> 'Expired N days ago', negative/red", () => {
    // 2026-08-16 - 4 days = 2026-08-12
    expect(describeEquipmentExpiry("2026-08-12", today)).toEqual({ label: "Expired 4 days ago", tone: "negative" });
  });

  it("singular day wording for exactly 1", () => {
    expect(describeEquipmentExpiry("2026-08-17", today)).toEqual({ label: "Expires in 1 day", tone: "attention" });
    expect(describeEquipmentExpiry("2026-08-15", today)).toEqual({ label: "Expired 1 day ago", tone: "negative" });
  });
});

describe("label maps never expose raw enum strings", () => {
  it("every tracking mode, assignment status, and history event has a human label", () => {
    expect(EQUIPMENT_TRACKING_MODE_LABELS.serialized).toBe("Individually tracked");
    expect(EQUIPMENT_TRACKING_MODE_LABELS.quantity).toBe("Quantity / consumable");
    for (const label of Object.values(EQUIPMENT_ASSIGNMENT_STATUS_LABELS)) {
      expect(label).toBeTruthy();
    }
    for (const label of Object.values(EQUIPMENT_HISTORY_EVENT_LABELS)) {
      expect(label).toBeTruthy();
    }
  });
});
