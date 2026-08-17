import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { EmployeeTodayCard } from "@/modules/daily-workforce/queries";
import { DAILY_TEAM_SHIFT_LABELS } from "@/modules/daily-workforce/types";
import type { DailyTeamLmraSummary } from "@/modules/lmra/queries";
import { LMRA_STATUS_LABELS } from "@/modules/lmra/types";
import { TeamRoster } from "@/modules/daily-workforce/components/team-roster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type EmployeeDailyTeamCardProps = {
  workDate: string;
  team: NonNullable<EmployeeTodayCard["team"]>;
  lmraEntries?: DailyTeamLmraSummary[];
  phoneByEmployeeId?: Record<string, string | null>;
};

function formatLmraTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Part 3 (second Employee correction pass): a plain employee's OWN Today's
 * Team, read-only — no edit/foreman-change/worker-add-remove controls
 * (those are `DailyTeamCard`, the manager-facing card, never rendered for
 * a plain employee) and deliberately no "Observation" action (employees no
 * longer create observations — reversed in the first correction pass).
 * "LMRA" is kept: `getEmployeeTodayCard` only ever resolves the caller's
 * OWN team (queried by `employee_id = employeeId`, never trusted from a
 * client param), and `daily_teams_select`/`daily_team_members_select` RLS
 * independently restricts a plain-employee caller to rows they're actually
 * a member of — so this card, and the LMRA link it renders, can only ever
 * refer to the employee's own team by construction.
 */
export function EmployeeDailyTeamCard({ workDate, team, lmraEntries = [], phoneByEmployeeId }: EmployeeDailyTeamCardProps) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="gap-2 rounded-t-xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{team.name}</span>
          {team.shift && (
            <Badge variant="outline" className="text-xs">
              {DAILY_TEAM_SHIFT_LABELS[team.shift]}
            </Badge>
          )}
        </div>
        {(team.work_area || team.activity) && (
          <span className="text-xs text-muted-foreground">{[team.work_area, team.activity].filter(Boolean).join(" · ")}</span>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-1.5 p-4">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your team</span>
        <TeamRoster foreman={team.foreman} colleagues={team.colleagues} phoneByEmployeeId={phoneByEmployeeId} />
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-end gap-2 text-sm text-muted-foreground">
        {lmraEntries.length === 0 ? (
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/lmra/new?dailyTeamId=${team.id}&workDate=${workDate}`} />}>
            <ShieldCheck />
            LMRA
          </Button>
        ) : lmraEntries.length === 1 ? (
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={`/lmra/${lmraEntries[0].id}`} />}
            className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            <ShieldCheck />
            LMRA
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="sm" className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300" />}
            >
              <ShieldCheck />
              LMRA ({lmraEntries.length})
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {team.name} — {lmraEntries.length} LMRAs today
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {lmraEntries.map((entry) => (
                <DropdownMenuItem key={entry.id} render={<Link href={`/lmra/${entry.id}`} />}>
                  {formatLmraTimestamp(entry.createdAt)} · {LMRA_STATUS_LABELS[entry.status]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardFooter>
    </Card>
  );
}
