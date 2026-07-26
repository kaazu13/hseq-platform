import { z } from "zod";
import { optionalText } from "@/lib/validation";

const TEAM_COLOR_VALUES = ["gray", "blue", "green", "yellow", "orange", "red", "purple", "cyan", "brown"] as const;
const TEAM_STATUS_VALUES = ["active", "archived"] as const;

/** Create/edit — General section only. Assignments (Foreman(s)/Members) are a separate, per-employee action (see setTeamAssignmentSchema below), not one big form field. */
export const teamFormSchema = z.object({
  name: z.string().trim().min(1, "Team name is required"),
  code: optionalText,
  color: z.enum(TEAM_COLOR_VALUES),
  description: optionalText,
  status: z.enum(TEAM_STATUS_VALUES),
});
export type TeamFormInput = z.infer<typeof teamFormSchema>;

const TEAM_ASSIGNMENT_ROLE_VALUES = ["member", "foreman"] as const;

/** `setTeamAssignment` Server Function — one employee's role on one team; also how a move between teams is initiated (see move_employee_to_team() in the migration). */
export const setTeamAssignmentSchema = z.object({
  employeeId: z.string().uuid(),
  role: z.enum(TEAM_ASSIGNMENT_ROLE_VALUES),
});
export type SetTeamAssignmentInput = z.infer<typeof setTeamAssignmentSchema>;
