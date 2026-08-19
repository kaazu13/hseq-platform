import { describe, it, expect } from "vitest";
import { scaffoldFormSchema, inspectionFormSchema, inspectionItemsFormSchema, finalizeInspectionFormSchema, correctionReasonFormSchema, voidInspectionFormSchema } from "./validation";
import { SCAFFOLD_INSPECTION_ITEM_TYPES } from "./types";

const ERECTION_TEAM_A = "123e4567-e89b-42d3-a456-426614174010";
const ERECTION_TEAM_B = "123e4567-e89b-42d3-a456-426614174011";
const WORKER_A = "123e4567-e89b-42d3-a456-426614174020";
const WORKER_B = "123e4567-e89b-42d3-a456-426614174021";

const VALID_SCAFFOLD_INPUT = {
  projectId: "123e4567-e89b-42d3-a456-426614174000",
  tagNumber: "SC-042",
  workArea: "North elevation, level 2",
  structureReference: "",
  scaffoldType: "independent",
  intendedUse: "Facade repair access",
  maxLoadClass: "Light Duty (2.0 kN/m2)",
  heightMetres: "12.5",
  lengthMetres: "8",
  widthMetres: "1.2",
  erectedBy: "",
  responsibleForemanId: "123e4567-e89b-42d3-a456-426614174001",
  erectedAt: "2026-08-10",
  notes: "",
  erectionTeamIds: [ERECTION_TEAM_A, ERECTION_TEAM_B],
  participants: [
    { employeeId: WORKER_A, source: "team_import", sourceDailyTeamId: ERECTION_TEAM_A },
    { employeeId: WORKER_B, source: "manual" },
  ],
  inspectionIntervalType: "seven_days",
  inspectionIntervalDays: "7",
  latitude: "",
  longitude: "",
};

describe("scaffoldFormSchema", () => {
  it("accepts a fully populated valid input", () => {
    const result = scaffoldFormSchema.safeParse(VALID_SCAFFOLD_INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.heightMetres).toBe(12.5);
      expect(result.data.lengthMetres).toBe(8);
      expect(result.data.widthMetres).toBe(1.2);
    }
  });

  it("rejects blank tag number/work area/intended use/max load class", () => {
    expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, tagNumber: "  " }).success).toBe(false);
    expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, workArea: "" }).success).toBe(false);
    expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, intendedUse: "" }).success).toBe(false);
    expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, maxLoadClass: "" }).success).toBe(false);
  });

  it("rejects an oversized tag number/work area/intended use/max load class (Phase 11 input-limit audit)", () => {
    expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, tagNumber: "a".repeat(51) }).success).toBe(false);
    expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, workArea: "a".repeat(101) }).success).toBe(false);
    expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, intendedUse: "a".repeat(201) }).success).toBe(false);
    expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, maxLoadClass: "a".repeat(101) }).success).toBe(false);
  });

  it("rejects a non-positive or non-numeric height/length/width", () => {
    for (const field of ["heightMetres", "lengthMetres", "widthMetres"] as const) {
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, [field]: "0" }).success).toBe(false);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, [field]: "-5" }).success).toBe(false);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, [field]: "not a number" }).success).toBe(false);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, [field]: "Infinity" }).success).toBe(false);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, [field]: "NaN" }).success).toBe(false);
    }
  });

  it("accepts decimal and integer height/length/width", () => {
    const result = scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, heightMetres: "5.7", lengthMetres: "12", widthMetres: "1.2" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.heightMetres).toBe(5.7);
      expect(result.data.lengthMetres).toBe(12);
      expect(result.data.widthMetres).toBe(1.2);
    }
  });

  it("allows height/length/width to be omitted independently — 'where known'", () => {
    const result = scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, heightMetres: "", lengthMetres: "", widthMetres: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.heightMetres).toBeUndefined();
      expect(result.data.lengthMetres).toBeUndefined();
      expect(result.data.widthMetres).toBeUndefined();
    }
  });

  it("accepts every fixed scaffold type", () => {
    const types = ["independent", "birdcage", "mobile", "suspended", "cantilever", "access_tower", "loading_bay", "temporary_roof", "other"];
    for (const scaffoldType of types) {
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, scaffoldType }).success).toBe(true);
    }
  });

  it("rejects a scaffold type outside the fixed list", () => {
    expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, scaffoldType: "trestle" }).success).toBe(false);
  });

  it("requires erectedAt — V2 made it mandatory (was optional pre-V2)", () => {
    expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, erectedAt: "" }).success).toBe(false);
    expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, erectedAt: "08/10/2026" }).success).toBe(false);
  });

  it("Part 3: erectionTeamIds is now OPTIONAL (an audit trail of fast-fill import sources only) — an empty array is valid as long as participants has at least one person", () => {
    expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, erectionTeamIds: [ERECTION_TEAM_A] }).success).toBe(true);
    expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, erectionTeamIds: [] }).success).toBe(true);
  });

  it("rejects the same erection team selected more than once", () => {
    const result = scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, erectionTeamIds: [ERECTION_TEAM_A, ERECTION_TEAM_A] });
    expect(result.success).toBe(false);
  });

  it("rejects a forged non-UUID erection team id", () => {
    const result = scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, erectionTeamIds: ["not-a-uuid"] });
    expect(result.success).toBe(false);
  });

  describe("erection crew participants (Parts 3-5)", () => {
    it("rejects an empty crew — at least one participant is required", () => {
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, participants: [] }).success).toBe(false);
    });

    it("accepts a single manually-added participant with no team source", () => {
      const result = scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, participants: [{ employeeId: WORKER_A, source: "manual" }] });
      expect(result.success).toBe(true);
    });

    it("accepts a team-imported participant carrying its source team id", () => {
      const result = scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, participants: [{ employeeId: WORKER_A, source: "team_import", sourceDailyTeamId: ERECTION_TEAM_A }] });
      expect(result.success).toBe(true);
    });

    it("rejects the same employee listed twice — Part 4's 'do not duplicate participants'", () => {
      const result = scaffoldFormSchema.safeParse({
        ...VALID_SCAFFOLD_INPUT,
        participants: [
          { employeeId: WORKER_A, source: "manual" },
          { employeeId: WORKER_A, source: "team_import", sourceDailyTeamId: ERECTION_TEAM_A },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("rejects a forged non-UUID employee id", () => {
      const result = scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, participants: [{ employeeId: "not-a-uuid", source: "manual" }] });
      expect(result.success).toBe(false);
    });

    it("rejects an unrecognized source value", () => {
      const result = scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, participants: [{ employeeId: WORKER_A, source: "invented" }] });
      expect(result.success).toBe(false);
    });
  });

  describe("inspection frequency (Parts O-Q)", () => {
    it("accepts every fixed preset with its exact matching day count", () => {
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, inspectionIntervalType: "daily", inspectionIntervalDays: "1" }).success).toBe(true);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, inspectionIntervalType: "seven_days", inspectionIntervalDays: "7" }).success).toBe(true);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, inspectionIntervalType: "thirty_days", inspectionIntervalDays: "30" }).success).toBe(true);
    });

    it("rejects a fixed preset paired with a mismatched day count — the DB's own consistency CHECK, mirrored client-side", () => {
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, inspectionIntervalType: "daily", inspectionIntervalDays: "7" }).success).toBe(false);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, inspectionIntervalType: "seven_days", inspectionIntervalDays: "1" }).success).toBe(false);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, inspectionIntervalType: "thirty_days", inspectionIntervalDays: "31" }).success).toBe(false);
    });

    it("accepts a custom interval within [1, 365] days", () => {
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, inspectionIntervalType: "custom", inspectionIntervalDays: "14" }).success).toBe(true);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, inspectionIntervalType: "custom", inspectionIntervalDays: "1" }).success).toBe(true);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, inspectionIntervalType: "custom", inspectionIntervalDays: "365" }).success).toBe(true);
    });

    it("rejects a custom interval of zero, negative, non-integer, or beyond the max", () => {
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, inspectionIntervalType: "custom", inspectionIntervalDays: "0" }).success).toBe(false);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, inspectionIntervalType: "custom", inspectionIntervalDays: "-5" }).success).toBe(false);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, inspectionIntervalType: "custom", inspectionIntervalDays: "3.5" }).success).toBe(false);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, inspectionIntervalType: "custom", inspectionIntervalDays: "366" }).success).toBe(false);
    });

    it("rejects an unrecognized interval type", () => {
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, inspectionIntervalType: "weekly", inspectionIntervalDays: "7" }).success).toBe(false);
    });
  });

  describe("location (Parts U-V)", () => {
    it("accepts no location set at all (both blank)", () => {
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, latitude: "", longitude: "" }).success).toBe(true);
    });

    it("accepts a valid coordinate pair", () => {
      const result = scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, latitude: "59.334591", longitude: "18.063240" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.latitude).toBeCloseTo(59.334591);
        expect(result.data.longitude).toBeCloseTo(18.06324);
      }
    });

    it("rejects latitude/longitude set independently — both or neither", () => {
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, latitude: "59.33", longitude: "" }).success).toBe(false);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, latitude: "", longitude: "18.06" }).success).toBe(false);
    });

    it("rejects out-of-range coordinates", () => {
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, latitude: "91", longitude: "18" }).success).toBe(false);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, latitude: "59", longitude: "181" }).success).toBe(false);
      expect(scaffoldFormSchema.safeParse({ ...VALID_SCAFFOLD_INPUT, latitude: "-91", longitude: "18" }).success).toBe(false);
    });
  });
});

const VALID_INSPECTION_INPUT = {
  inspectionReason: "routine_inspection",
  previousInspectionId: "",
  inspectorId: "123e4567-e89b-42d3-a456-426614174002",
  inspectedAt: "2026-08-10T09:00",
  notes: "",
};

describe("inspectionFormSchema", () => {
  it("accepts a routine inspection with no previous inspection reference", () => {
    expect(inspectionFormSchema.safeParse(VALID_INSPECTION_INPUT).success).toBe(true);
  });

  it("requires previousInspectionId when the reason is reinspection_following_defects — 're-inspection must reference the earlier inspection'", () => {
    const result = inspectionFormSchema.safeParse({ ...VALID_INSPECTION_INPUT, inspectionReason: "reinspection_following_defects" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.previousInspectionId ?? result.error.issues.some((i) => i.path.includes("previousInspectionId"))).toBeTruthy();
    }
  });

  it("accepts reinspection_following_defects WITH a previous inspection reference", () => {
    expect(
      inspectionFormSchema.safeParse({
        ...VALID_INSPECTION_INPUT,
        inspectionReason: "reinspection_following_defects",
        previousInspectionId: "123e4567-e89b-42d3-a456-426614174003",
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed inspectedAt", () => {
    expect(inspectionFormSchema.safeParse({ ...VALID_INSPECTION_INPUT, inspectedAt: "2026-08-10" }).success).toBe(false);
  });
});

describe("inspectionItemsFormSchema", () => {
  function validRow(itemType: (typeof SCAFFOLD_INSPECTION_ITEM_TYPES)[number]) {
    return { itemType, result: "acceptable" as const, comment: "", requiredCorrectiveAction: "", severity: null };
  }

  it("accepts exactly 24 rows, one per SCAFFOLD_INSPECTION_ITEM_TYPES entry", () => {
    const rows = SCAFFOLD_INSPECTION_ITEM_TYPES.map((itemType) => validRow(itemType));
    expect(inspectionItemsFormSchema.safeParse(rows).success).toBe(true);
  });

  it("rejects fewer than 24 rows", () => {
    const rows = SCAFFOLD_INSPECTION_ITEM_TYPES.slice(0, 23).map((itemType) => validRow(itemType));
    expect(inspectionItemsFormSchema.safeParse(rows).success).toBe(false);
  });

  it("rejects more than 24 rows", () => {
    const rows = [...SCAFFOLD_INSPECTION_ITEM_TYPES, "standards"].map((itemType) => validRow(itemType as (typeof SCAFFOLD_INSPECTION_ITEM_TYPES)[number]));
    expect(inspectionItemsFormSchema.safeParse(rows).success).toBe(false);
  });

  it("rejects an oversized comment/requiredCorrectiveAction on any row (Phase 11 input-limit audit)", () => {
    const rows = SCAFFOLD_INSPECTION_ITEM_TYPES.map((itemType) => validRow(itemType));
    rows[0] = { ...rows[0], comment: "a".repeat(1001) };
    expect(inspectionItemsFormSchema.safeParse(rows).success).toBe(false);
  });
});

describe("finalizeInspectionFormSchema", () => {
  it("accepts safe_for_use with no restrictions", () => {
    expect(finalizeInspectionFormSchema.safeParse({ outcome: "safe_for_use", restrictionsNotes: "" }).success).toBe(true);
  });

  it("accepts safe_with_restrictions WITH restrictions recorded", () => {
    expect(finalizeInspectionFormSchema.safeParse({ outcome: "safe_with_restrictions", restrictionsNotes: "Maximum 2 persons on the top lift" }).success).toBe(true);
  });

  it("rejects safe_with_restrictions with blank restrictions — 'a safe-with-restrictions outcome must require the restrictions to be recorded'", () => {
    const result = finalizeInspectionFormSchema.safeParse({ outcome: "safe_with_restrictions", restrictionsNotes: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("restrictionsNotes"))).toBe(true);
    }
  });

  it("rejects safe_with_restrictions with whitespace-only restrictions", () => {
    expect(finalizeInspectionFormSchema.safeParse({ outcome: "safe_with_restrictions", restrictionsNotes: "   " }).success).toBe(false);
  });

  it("accepts every other outcome without requiring restrictions", () => {
    for (const outcome of ["unsafe_do_not_use", "awaiting_corrective_action", "closed_dismantled"]) {
      expect(finalizeInspectionFormSchema.safeParse({ outcome, restrictionsNotes: "" }).success).toBe(true);
    }
  });
});

describe("correctionReasonFormSchema", () => {
  it("accepts a populated reason", () => {
    expect(correctionReasonFormSchema.safeParse({ correctionReason: "Inspector recorded the wrong outcome by mistake" }).success).toBe(true);
  });

  it("rejects a blank or whitespace-only reason", () => {
    expect(correctionReasonFormSchema.safeParse({ correctionReason: "" }).success).toBe(false);
    expect(correctionReasonFormSchema.safeParse({ correctionReason: "   " }).success).toBe(false);
  });

  it("rejects an oversized reason (Phase 11 input-limit audit)", () => {
    expect(correctionReasonFormSchema.safeParse({ correctionReason: "a".repeat(2001) }).success).toBe(false);
  });
});

describe("voidInspectionFormSchema", () => {
  it("accepts a populated reason", () => {
    expect(voidInspectionFormSchema.safeParse({ voidReason: "Inspected the wrong scaffold by mistake" }).success).toBe(true);
  });

  it("rejects a blank or whitespace-only reason — void_scaffold_inspection() requires one too", () => {
    expect(voidInspectionFormSchema.safeParse({ voidReason: "" }).success).toBe(false);
    expect(voidInspectionFormSchema.safeParse({ voidReason: "   " }).success).toBe(false);
  });
});
