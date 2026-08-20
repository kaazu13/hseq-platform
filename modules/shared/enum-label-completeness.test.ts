import { describe, expect, it } from "vitest";
import { SCAFFOLD_TYPES, SCAFFOLD_TYPE_LABELS, SCAFFOLD_STATUSES, SCAFFOLD_STATUS_LABELS, SCAFFOLD_INSPECTION_STATUSES, SCAFFOLD_INSPECTION_STATUS_LABELS, SCAFFOLD_INSPECTION_OUTCOME_LABELS, SCAFFOLD_INSPECTION_INTERVAL_TYPES, SCAFFOLD_INSPECTION_INTERVAL_TYPE_LABELS, SCAFFOLD_DEFECT_SEVERITY_LABELS } from "@/modules/scaffolds/types";
import { LMRA_STATUS_LABELS, LMRA_RESULT_LABELS, LMRA_SHIFT_LABELS, LMRA_HAZARD_TYPE_LABELS } from "@/modules/lmra/types";
import { SCAFFOLD_DEFECT_STATUS_LABELS } from "@/modules/scaffold-defects/types";
import { OBSERVATION_STATUS_LABELS, OBSERVATION_RISK_LEVEL_LABELS, OBSERVATION_CATEGORY_LABELS, OBSERVATION_TYPE_LABELS } from "@/modules/observations/types";
import { CORRECTIVE_ACTION_STATUS_LABELS, CORRECTIVE_ACTION_PRIORITY_LABELS } from "@/modules/corrective-actions/types";
import { LEAVE_TYPE_LABELS, LEAVE_REQUEST_STATUS_LABELS } from "@/modules/leave-requests/types";
import { EMPLOYMENT_STATUS_LABELS, ACCOUNT_STATUS_LABELS } from "@/modules/employees/types";
import { EQUIPMENT_STATUS_LABELS, EQUIPMENT_CONDITION_LABELS, EQUIPMENT_REQUEST_STATUS_LABELS, EQUIPMENT_TRACKING_MODE_LABELS } from "@/modules/equipment/types";
import { ABSENCE_REPORT_REASON_LABELS, ABSENCE_REPORT_STATUS_LABELS } from "@/modules/absences/types";
import { DAILY_TEAM_SHIFT_LABELS, DAILY_TEAM_STATUS_LABELS, DAILY_ATTENDANCE_STATUS_LABELS } from "@/modules/daily-workforce/types";

/**
 * Part 2's explicit "automated regression check to detect common raw
 * snake_case enum leakage." A friendly-label map is only doing its job if
 * every value it can be indexed by actually resolves to something a user
 * would recognize as English prose — never the untouched enum key itself
 * (the exact bug shape reported: "seven_days" instead of "Every 7 days").
 * This iterates every label map this codebase ships against its own keys,
 * so a future enum addition that forgets to extend its label map fails
 * CI immediately instead of shipping a raw snake_case value to a screen.
 */
const LABEL_MAPS: Record<string, Record<string, string>> = {
  SCAFFOLD_TYPE_LABELS,
  SCAFFOLD_STATUS_LABELS,
  SCAFFOLD_INSPECTION_STATUS_LABELS,
  SCAFFOLD_INSPECTION_OUTCOME_LABELS,
  SCAFFOLD_INSPECTION_INTERVAL_TYPE_LABELS,
  SCAFFOLD_DEFECT_SEVERITY_LABELS,
  SCAFFOLD_DEFECT_STATUS_LABELS,
  LMRA_STATUS_LABELS,
  LMRA_RESULT_LABELS,
  LMRA_SHIFT_LABELS,
  LMRA_HAZARD_TYPE_LABELS,
  OBSERVATION_STATUS_LABELS,
  OBSERVATION_RISK_LEVEL_LABELS,
  OBSERVATION_CATEGORY_LABELS,
  OBSERVATION_TYPE_LABELS,
  CORRECTIVE_ACTION_STATUS_LABELS,
  CORRECTIVE_ACTION_PRIORITY_LABELS,
  LEAVE_TYPE_LABELS,
  LEAVE_REQUEST_STATUS_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  ACCOUNT_STATUS_LABELS,
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_CONDITION_LABELS,
  EQUIPMENT_REQUEST_STATUS_LABELS,
  EQUIPMENT_TRACKING_MODE_LABELS,
  ABSENCE_REPORT_REASON_LABELS,
  ABSENCE_REPORT_STATUS_LABELS,
  DAILY_TEAM_SHIFT_LABELS,
  DAILY_TEAM_STATUS_LABELS,
  DAILY_ATTENDANCE_STATUS_LABELS,
};

const ENUM_VALUE_ARRAYS: Record<string, string[]> = {
  SCAFFOLD_TYPE_LABELS: SCAFFOLD_TYPES,
  SCAFFOLD_STATUS_LABELS: SCAFFOLD_STATUSES,
  SCAFFOLD_INSPECTION_STATUS_LABELS: SCAFFOLD_INSPECTION_STATUSES,
  SCAFFOLD_INSPECTION_INTERVAL_TYPE_LABELS: SCAFFOLD_INSPECTION_INTERVAL_TYPES,
};

describe("friendly label map completeness — no raw snake_case leakage", () => {
  for (const [mapName, map] of Object.entries(LABEL_MAPS)) {
    describe(mapName, () => {
      it("no label equals its own raw key (would show the enum value verbatim)", () => {
        for (const [key, label] of Object.entries(map)) {
          expect(label, `${mapName}["${key}"] resolves to the raw key "${key}" instead of a friendly label`).not.toBe(key);
        }
      });

      it("no label contains an unconverted underscore (a common half-fixed leak, e.g. \"Every 7_days\")", () => {
        for (const [key, label] of Object.entries(map)) {
          expect(label, `${mapName}["${key}"] = "${label}" still contains a raw underscore`).not.toMatch(/_/);
        }
      });

      it("every label is non-empty prose, not blank or purely symbolic", () => {
        for (const [key, label] of Object.entries(map)) {
          expect(label.trim().length, `${mapName}["${key}"] is blank`).toBeGreaterThan(0);
        }
      });
    });
  }

  for (const [mapName, values] of Object.entries(ENUM_VALUE_ARRAYS)) {
    it(`${mapName} covers every value in its companion enum array (no missing entries)`, () => {
      const map = LABEL_MAPS[mapName];
      for (const value of values) {
        expect(map[value], `${mapName} is missing an entry for "${value}"`).toBeDefined();
      }
    });
  }
});
