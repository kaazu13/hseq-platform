import { z } from "zod";
import { optionalText } from "@/lib/validation";

const DAILY_ATTENDANCE_STATUS_VALUES = ["not_set", "present", "absent", "sick", "leave", "training", "off_site"] as const;

/** `setDailyAttendanceStatus` Server Function input. */
export const setDailyAttendanceStatusSchema = z.object({
  status: z.enum(DAILY_ATTENDANCE_STATUS_VALUES),
  note: optionalText,
});
export type SetDailyAttendanceStatusInput = z.infer<typeof setDailyAttendanceStatusSchema>;

/** Create/edit a Today's Team's own fields — General section only, mirrors modules/teams/validation.ts's teamFormSchema shape. */
export const dailyTeamFormSchema = z.object({
  name: z.string().trim().min(1, "Team name is required"),
  shift: optionalText,
  workArea: optionalText,
  activity: optionalText,
});
export type DailyTeamFormInput = z.infer<typeof dailyTeamFormSchema>;

const TEAM_MEMBER_ROLE_VALUES = ["member", "foreman"] as const;

/** `moveDailyTeamMember` Server Function input. */
export const moveDailyTeamMemberSchema = z.object({
  employeeId: z.string().uuid(),
  dailyTeamId: z.string().uuid(),
  role: z.enum(TEAM_MEMBER_ROLE_VALUES),
});
export type MoveDailyTeamMemberInput = z.infer<typeof moveDailyTeamMemberSchema>;

/** `unlockDailyTeams` Server Function input — a reason is required. */
export const unlockDailyTeamsSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required"),
});
export type UnlockDailyTeamsInput = z.infer<typeof unlockDailyTeamsSchema>;
