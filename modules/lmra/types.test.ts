import { describe, it, expect } from "vitest";
import { initialLmraHazardRows, lmraHazardInputsFromRows, LMRA_HAZARD_TYPES, LMRA_COMMON_CONTROLS } from "./types";

describe("initialLmraHazardRows", () => {
  it("returns exactly 12 rows, one per LMRA_HAZARD_TYPES entry, in that fixed order", () => {
    const rows = initialLmraHazardRows();
    expect(rows).toHaveLength(12);
    expect(rows.map((row) => row.hazardType)).toEqual(LMRA_HAZARD_TYPES);
  });

  it("every fresh row starts inapplicable with empty controls", () => {
    for (const row of initialLmraHazardRows()) {
      expect(row.isApplicable).toBe(false);
      expect(row.selectedControls).toEqual([]);
      expect(row.controls).toBe("");
      expect(row.responsiblePersonId).toBeNull();
      expect(row.controlsConfirmed).toBe(false);
      expect(row.otherDescription).toBe("");
    }
  });
});

describe("lmraHazardInputsFromRows", () => {
  it("maps an existing assessment's DB rows into the camelCase input shape, preserving values", () => {
    const rows = lmraHazardInputsFromRows([
      {
        hazard_type: "working_at_height",
        is_applicable: true,
        selected_controls: ["Approved scaffold/access platform"],
        controls: "Extra tie-off point added",
        responsible_person_id: "123e4567-e89b-42d3-a456-426614174000",
        controls_confirmed: true,
        other_description: null,
      },
    ]);

    const heightRow = rows.find((row) => row.hazardType === "working_at_height")!;
    expect(heightRow.isApplicable).toBe(true);
    expect(heightRow.selectedControls).toEqual(["Approved scaffold/access platform"]);
    expect(heightRow.controls).toBe("Extra tie-off point added");
    expect(heightRow.responsiblePersonId).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(heightRow.controlsConfirmed).toBe(true);
  });

  it("always returns exactly 12 rows, filling in defaults for any hazard type missing from the input", () => {
    const rows = lmraHazardInputsFromRows([]);
    expect(rows).toHaveLength(12);
    expect(rows.every((row) => row.isApplicable === false)).toBe(true);
  });

  it("preserves LMRA_HAZARD_TYPES' fixed order regardless of input order", () => {
    const rows = lmraHazardInputsFromRows([
      { hazard_type: "other", is_applicable: false, selected_controls: [], controls: null, responsible_person_id: null, controls_confirmed: false, other_description: null },
      { hazard_type: "working_at_height", is_applicable: false, selected_controls: [], controls: null, responsible_person_id: null, controls_confirmed: false, other_description: null },
    ]);
    expect(rows.map((row) => row.hazardType)).toEqual(LMRA_HAZARD_TYPES);
  });
});

describe("LMRA_COMMON_CONTROLS", () => {
  it("has an entry for every one of the 12 fixed hazard types", () => {
    for (const hazardType of LMRA_HAZARD_TYPES) {
      expect(LMRA_COMMON_CONTROLS[hazardType]).toBeDefined();
      expect(Array.isArray(LMRA_COMMON_CONTROLS[hazardType])).toBe(true);
    }
  });

  it("'other' has no predefined common controls — it's a catch-all served by other_description instead", () => {
    expect(LMRA_COMMON_CONTROLS.other).toEqual([]);
  });

  it("every non-'other' hazard type has at least one predefined common control", () => {
    for (const hazardType of LMRA_HAZARD_TYPES) {
      if (hazardType === "other") continue;
      expect(LMRA_COMMON_CONTROLS[hazardType].length).toBeGreaterThan(0);
    }
  });
});
