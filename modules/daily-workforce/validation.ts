import { z } from "zod";
import { optionalText } from "@/lib/validation";
import { DAILY_TEAM_SHIFTS } from "./types";

const DAILY_ATTENDANCE_STATUS_VALUES = ["not_set", "present", "absent", "sick", "leave", "training", "off_site"] as const;

/** `setDailyAttendanceStatus` Server Function input. */
export const setDailyAttendanceStatusSchema = z.object({
  status: z.enum(DAILY_ATTENDANCE_STATUS_VALUES),
  note: optionalText,
  /** Only actually enforced server-side when required (a closed absence day, or zeroing already-submitted worked hours — item 1) — kept optional here, same "reason is only enforced server-side" convention as modules/worked-hours/validation.ts. */
  reason: optionalText,
});
export type SetDailyAttendanceStatusInput = z.infer<typeof setDailyAttendanceStatusSchema>;

const dailyTeamShiftSchema = z.enum(DAILY_TEAM_SHIFTS as [string, ...string[]]);

/** Edit an EXISTING Today's Team's own fields — General section only, mirrors modules/teams/validation.ts's teamFormSchema shape. Shift stays optional here (a legacy team may have none); item 9's create path uses createDailyTeamSchema below instead. */
export const dailyTeamFormSchema = z.object({
  name: z.string().trim().min(1, "Team name is required").max(100, "Keep it under 100 characters"),
  shift: dailyTeamShiftSchema.optional(),
  workArea: optionalText,
  activity: optionalText,
});
export type DailyTeamFormInput = z.infer<typeof dailyTeamFormSchema>;

/** Milestone G, item 4: adding an eligible Foreman to today's roster — this alone creates no team. */
export const addDailyTeamForemanSchema = z.object({
  foremanEmployeeId: z.string().uuid("Pick a foreman"),
});
export type AddDailyTeamForemanInput = z.infer<typeof addDailyTeamForemanSchema>;

/** Milestone G, item 5: creating a NEW Today's Team under an already-known, already-rostered Foreman — no Foreman re-selection. */
export const createDailyTeamForForemanSchema = z.object({
  name: z.string().trim().min(1, "Team name is required").max(100, "Keep it under 100 characters"),
  shift: dailyTeamShiftSchema,
  foremanEmployeeId: z.string().uuid("A foreman is required"),
  workArea: optionalText,
  activity: optionalText,
});
export type CreateDailyTeamForForemanInput = z.infer<typeof createDailyTeamForForemanSchema>;

/**
 * Item 1/9: the ONE atomic edit path for an EXISTING Today's Team — name,
 * shift, work area, activity, and an optional Foreman change (null means
 * "leave foreman assignment as-is," the legacy/repair-safe case). Unlike
 * dailyTeamFormSchema above, shift is required here — the edit dialog
 * always shows a pre-filled Select, so there is no "no shift chosen"
 * state to represent once the update RPC (which requires a shift) is the
 * only thing this schema feeds.
 */
export const updateDailyTeamSchema = z.object({
  name: z.string().trim().min(1, "Team name is required").max(100, "Keep it under 100 characters"),
  shift: dailyTeamShiftSchema,
  foremanEmployeeId: z.string().uuid().nullable(),
  workArea: optionalText,
  activity: optionalText,
});
export type UpdateDailyTeamInput = z.infer<typeof updateDailyTeamSchema>;

/** Item 4: persists drag-reordered card positions — the ordered list of every team id for that (project, work_date). */
export const reorderDailyTeamsSchema = z.object({
  orderedTeamIds: z.array(z.string().uuid()).min(1),
});
export type ReorderDailyTeamsInput = z.infer<typeof reorderDailyTeamsSchema>;

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
  reason: z.string().trim().min(1, "A reason is required").max(2000, "Keep it under 2000 characters"),
});
export type UnlockDailyTeamsInput = z.infer<typeof unlockDailyTeamsSchema>;
