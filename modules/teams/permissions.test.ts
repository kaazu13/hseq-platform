import { describe, it, expect } from "vitest";
import { canManageTeams } from "./permissions";
import { canManageProject } from "@/modules/projects/permissions";

describe("canManageTeams", () => {
  it("mirrors canManageProject exactly (identical RLS gate — see permissions.ts's header comment)", () => {
    const cases: [string[], string[]][] = [
      [["company_admin"], []],
      [["operations_manager"], []],
      [["employee"], ["project_manager"]],
      [["hseq_manager"], []],
      [["employee"], []],
      [["employee"], ["member"]],
    ];
    for (const [roles, projectRoles] of cases) {
      expect(canManageTeams(roles as never, projectRoles)).toBe(canManageProject(roles as never, projectRoles));
    }
  });
});
