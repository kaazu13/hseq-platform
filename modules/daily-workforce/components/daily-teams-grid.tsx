"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { reorderDailyTeams } from "@/modules/daily-workforce/actions";
import { DailyTeamCard } from "@/modules/daily-workforce/components/daily-team-card";
import type { DailyTeamWithMembers, EmployeeDailyState } from "@/modules/daily-workforce/types";
import type { DailyTeamLmraSummary } from "@/modules/lmra/queries";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type DailyTeamsGridProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  canManage: boolean;
  teams: DailyTeamWithMembers[];
  workforce: EmployeeDailyState[];
  /** Plain object, not a Map — Maps do not cross the Server/Client Component boundary. */
  lmraCountsByTeamId: Record<string, DailyTeamLmraSummary[]>;
};

/**
 * Item 9: drag-and-drop DISPLAY ORDER for Today's Team cards WITHIN one
 * Foreman's section (the page renders one DailyTeamsGrid per Foreman
 * group — see the Teams page). Reordering calls reorder_daily_teams()
 * (DISPLAY ORDER ONLY); membership/shift/foreman/work_area/activity/
 * historical data are never touched by anything in this component.
 * Cross-Foreman drag is deliberately NOT implemented — moving a team to a
 * different Foreman only ever happens through Change Foreman (item 6's
 * atomic mutation), never a client-side visual reparent.
 *
 * Item 1/8: dragging is scoped to a dedicated small grip handle — never
 * the whole card — specifically because a full-card draggable region
 * previously sat as an absolutely-positioned overlay directly on top of
 * the card's own top-right pencil button, silently swallowing clicks
 * meant for it (the reported "pencil does nothing" bug). The handle row
 * sits in normal flow ABOVE the card now — zero overlap with anything the
 * card itself renders. The permanent on-card Up/Down arrows are gone too
 * (item 8's "reduce desktop clutter"); the same moves are still reachable
 * via this row's overflow menu, so keyboard/screen-reader users lose
 * nothing.
 *
 * Renders DailyTeamCard directly (both are Client Components) rather than
 * accepting a server-supplied render-prop — a plain function cannot cross
 * the Server/Client Component boundary (confirmed live in an earlier
 * milestone).
 */
export function DailyTeamsGrid({ companyId, projectId, workDate, canManage, teams, workforce, lmraCountsByTeamId }: DailyTeamsGridProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [order, setOrder] = useState(teams.map((team) => team.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const teamIds = teams.map((team) => team.id);
  const teamIdsKey = teamIds.join(",");
  // Comparing against STATE holding the last order we actually synced (the
  // React-sanctioned "adjust state during render" pattern) rather than
  // `isPending` — router.refresh() is fire-and-forget, so `isPending` can
  // flip false before the refreshed `teams` prop actually arrives, which
  // used to race this sync back to the stale pre-reorder order.
  const [lastSyncedTeamIdsKey, setLastSyncedTeamIdsKey] = useState(teamIdsKey);
  if (!draggingId && teamIdsKey !== lastSyncedTeamIdsKey) {
    setLastSyncedTeamIdsKey(teamIdsKey);
    setOrder(teamIds);
  }

  const teamById = new Map(teams.map((team) => [team.id, team]));

  function persist(nextOrder: string[]) {
    setOrder(nextOrder);
    startTransition(async () => {
      const result = await reorderDailyTeams(companyId, projectId, workDate, { orderedTeamIds: nextOrder });
      if (!result.ok) {
        toast.error(result.error.message);
        setOrder(teamIds);
        return;
      }
      router.refresh();
    });
  }

  function moveBy(teamId: string, delta: number) {
    const index = order.indexOf(teamId);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  }

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    const next = [...order];
    const fromIndex = next.indexOf(draggingId);
    const toIndex = next.indexOf(targetId);
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, draggingId);
    setDraggingId(null);
    persist(next);
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {order.map((teamId, index) => {
        const team = teamById.get(teamId);
        if (!team) return null;
        return (
          <div
            key={teamId}
            onDragOver={(event) => canManage && event.preventDefault()}
            onDrop={() => canManage && handleDrop(teamId)}
            className={cn("flex flex-col gap-1", draggingId === teamId && "opacity-50")}
          >
            {canManage && (
              <div className="flex items-center justify-end gap-0.5">
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`More actions for ${team.name}`} />}>
                    <MoreVertical className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled={isPending || index === 0} onClick={() => moveBy(teamId, -1)}>
                      Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={isPending || index === order.length - 1} onClick={() => moveBy(teamId, 1)}>
                      Move down
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <span
                  draggable
                  onDragStart={() => setDraggingId(teamId)}
                  onDragEnd={() => setDraggingId(null)}
                  className="cursor-grab p-1 text-muted-foreground"
                  title="Drag to reorder"
                  aria-hidden="true"
                >
                  <GripVertical className="size-3.5" />
                </span>
              </div>
            )}
            <DailyTeamCard
              companyId={companyId}
              projectId={projectId}
              workDate={workDate}
              team={team}
              workforce={workforce}
              canManage={canManage}
              lmraEntries={lmraCountsByTeamId[teamId] ?? []}
            />
          </div>
        );
      })}
    </div>
  );
}
