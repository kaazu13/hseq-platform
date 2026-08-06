"use client";

import { useTransition } from "react";
import { ChevronDown, ChevronUp, Pencil, Users } from "lucide-react";
import { toast } from "sonner";
import { reorderTeams } from "@/modules/teams/actions";
import { TEAM_COLOR_HEADER_CLASSES, TEAM_COLOR_SWATCH_CLASSES, formatTeamScheduleSummary, type TeamWithAssignments } from "@/modules/teams/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

type TeamCardProps = {
  companyId: string;
  projectId: string;
  team: TeamWithAssignments;
  canManage: boolean;
  orderedTeamIds: string[];
  onEdit: () => void;
};

/**
 * A future Attendance module attaches a per-member status badge (Absent/
 * Sick/Holiday/Training) here — deliberately an isolated, optional slot so
 * that integration never has to restructure this row. Always undefined
 * this milestone; the Team module has no Attendance dependency.
 */
function TeamMemberRow({
  name,
  position,
  attendanceStatus,
}: {
  name: string;
  position: string | null;
  attendanceStatus?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col">
        <span className="text-sm">{name}</span>
        {position ? <span className="text-xs text-muted-foreground">{position}</span> : null}
      </div>
      {attendanceStatus}
    </div>
  );
}

/**
 * The Team Cards grid's single card — see docs/PRODUCT_REQUIREMENTS.md's
 * Teams section. Renders purely from `team` (a TeamWithAssignments —
 * modules/teams/queries.ts's `listTeamsWithAssignments`), which already
 * excludes closed/historical assignments — this component never has to
 * reason about history itself.
 */
export function TeamCard({ companyId, projectId, team, canManage, orderedTeamIds, onEdit }: TeamCardProps) {
  const [isPending, startTransition] = useTransition();
  const totalCount = team.foremen.length + team.members.length;
  const isEmpty = totalCount === 0;
  const index = orderedTeamIds.indexOf(team.id);
  const isFirst = index <= 0;
  const isLast = index === -1 || index === orderedTeamIds.length - 1;

  function move(direction: "up" | "down") {
    const next = [...orderedTeamIds];
    const from = next.indexOf(team.id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to], next[from]];

    startTransition(async () => {
      const result = await reorderTeams(companyId, projectId, next);
      if (!result.ok) toast.error(result.error.message);
    });
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className={`gap-2 rounded-t-xl px-4 py-3 ${TEAM_COLOR_HEADER_CLASSES[team.color]}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`size-2.5 shrink-0 rounded-full ${TEAM_COLOR_SWATCH_CLASSES[team.color]}`} aria-hidden="true" />
              <span className="font-semibold">{team.name}</span>
              {team.code ? (
                <span className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-xs">{team.code}</span>
              ) : null}
              {team.status === "archived" ? (
                <Badge variant="secondary" className="text-xs">
                  Archived
                </Badge>
              ) : null}
            </div>
            {formatTeamScheduleSummary(team) ? <p className="text-xs opacity-90">{formatTeamScheduleSummary(team)}</p> : null}
            {team.description ? <p className="text-xs opacity-90">{team.description}</p> : null}
          </div>
          {canManage && (
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon-sm" disabled={isFirst || isPending} onClick={() => move("up")} aria-label="Move team up">
                <ChevronUp />
              </Button>
              <Button variant="ghost" size="icon-sm" disabled={isLast || isPending} onClick={() => move("down")} aria-label="Move team down">
                <ChevronDown />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${team.name}`}>
                <Pencil />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 p-4">
        {isEmpty ? (
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <p>No Foreman assigned</p>
            <p>No Members assigned</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {team.foremen.length === 1 ? "Foreman" : "Foremen"}
              </span>
              {team.foremen.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Foreman assigned</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {team.foremen.map((assignment) => (
                    <TeamMemberRow
                      key={assignment.id}
                      name={`${assignment.employee.first_name} ${assignment.employee.last_name}`}
                      position={assignment.employee.position_title}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Members</span>
              {team.members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Members assigned</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {team.members.map((assignment) => (
                    <TeamMemberRow
                      key={assignment.id}
                      name={`${assignment.employee.first_name} ${assignment.employee.last_name}`}
                      position={assignment.employee.position_title}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>

      {!isEmpty && (
        <CardFooter className="gap-1.5 text-sm text-muted-foreground">
          <Users className="size-4" />
          {totalCount} {totalCount === 1 ? "Member" : "Members"}
        </CardFooter>
      )}
    </Card>
  );
}
