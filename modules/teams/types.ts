import type { Database, Enums } from "@/types/database";

/**
 * Teams — a crew within a project. See docs/DATABASE_SCHEMA.md's `teams`/
 * `team_assignments` sections and
 * supabase/migrations/20260728090000_projects_and_teams.sql.
 */
export type Team = Database["public"]["Tables"]["teams"]["Row"];
export type TeamAssignment = Database["public"]["Tables"]["team_assignments"]["Row"];

export type TeamColor = Enums<"team_color">;
export type TeamStatus = Enums<"team_status">;
export type TeamAssignmentRole = Enums<"team_assignment_role">;

export const TEAM_STATUSES: TeamStatus[] = ["active", "archived"];

export const TEAM_STATUS_LABELS: Record<TeamStatus, string> = {
  active: "Active",
  archived: "Archived",
};

/**
 * Fixed, Google-Calendar-style palette — the UI never offers a free color
 * picker, only this list. Order here is the order swatches render in.
 */
export const TEAM_COLORS: TeamColor[] = ["blue", "green", "yellow", "orange", "red", "purple", "cyan", "brown", "gray"];

export const TEAM_COLOR_LABELS: Record<TeamColor, string> = {
  gray: "Gray",
  blue: "Blue",
  green: "Green",
  yellow: "Yellow",
  orange: "Orange",
  red: "Red",
  purple: "Purple",
  cyan: "Cyan",
  brown: "Brown",
};

/** Solid swatch background — the color picker's own dots, and the small color indicator used elsewhere. */
export const TEAM_COLOR_SWATCH_CLASSES: Record<TeamColor, string> = {
  gray: "bg-gray-400",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  yellow: "bg-yellow-400",
  orange: "bg-orange-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  cyan: "bg-cyan-500",
  brown: "bg-amber-800",
};

/** Team Card header background/text — same light/dark contrast approach as modules/employees/components/status-badges.tsx's TONE_CLASSES (soft tint + solid text, never color-alone). */
export const TEAM_COLOR_HEADER_CLASSES: Record<TeamColor, string> = {
  gray: "bg-gray-500/15 text-gray-800 dark:bg-gray-500/20 dark:text-gray-200",
  blue: "bg-blue-500/15 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
  green: "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  yellow: "bg-yellow-400/20 text-yellow-800 dark:bg-yellow-400/20 dark:text-yellow-300",
  orange: "bg-orange-500/15 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300",
  red: "bg-red-500/15 text-red-800 dark:bg-red-500/20 dark:text-red-300",
  purple: "bg-purple-500/15 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300",
  cyan: "bg-cyan-500/15 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300",
  brown: "bg-amber-800/15 text-amber-900 dark:bg-amber-800/25 dark:text-amber-400",
};

/**
 * The narrow, approved column set `get_basic_employee_info()` returns —
 * the ONLY channel that resolves a project/team-mate's display info; there
 * is deliberately no RLS policy granting teammates raw `employees` row
 * access (see supabase/migrations/20260728090000_projects_and_teams.sql
 * §15). Derived from the RPC's own return shape, not a `Pick` over the
 * full `employees` Row.
 */
export type BasicEmployee = Database["public"]["Functions"]["get_basic_employee_info"]["Returns"][number];

/** A team_assignments row joined with the assignee's basic employee info — never a PostgREST embed, see modules/employees/queries.ts's header comment for why. */
export type TeamAssignmentWithEmployee = TeamAssignment & {
  employee: BasicEmployee;
};

/**
 * A team plus its current (active-only) assignments, split into foreman(s)
 * and members for direct Team Card rendering — history is never included
 * here (docs/DATABASE_SCHEMA.md: "the Team Cards UI ... only ever reads
 * rows where end_at is null"). Team Card totals count foremen AND members
 * together (see modules/teams/components/team-card.tsx) — a Foreman is
 * still a team_assignments row like any other, never duplicated as a
 * separate "member" row.
 */
export type TeamWithAssignments = Team & {
  foremen: TeamAssignmentWithEmployee[];
  members: TeamAssignmentWithEmployee[];
};

/**
 * Where a project roster employee currently stands with respect to ONE
 * team being edited — feeds the Team dialog's assignment picker. `null`
 * role/teamId means "not currently on any team in this project."
 * `currentTeamName` is populated only when the employee's current team is a
 * DIFFERENT one than the team being edited, so the picker can show "(in
 * Scaffold Team B)" and make clear that selecting them here will move them.
 */
export type ProjectRosterCandidate = {
  employee: BasicEmployee;
  currentTeamId: string | null;
  currentTeamName: string | null;
  currentRole: TeamAssignmentRole | null;
};
