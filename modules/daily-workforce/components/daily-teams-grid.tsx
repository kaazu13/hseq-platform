"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { reorderDailyTeams } from "@/modules/daily-workforce/actions";
import { DailyTeamCard } from "@/modules/daily-workforce/components/daily-team-card";
import type { DailyTeamWithMembers, EmployeeDailyState } from "@/modules/daily-workforce/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DailyTeamsGridProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  canManage: boolean;
  teams: DailyTeamWithMembers[];
  workforce: EmployeeDailyState[];
  /** Plain object, not a Map — Maps do not cross the Server/Client Component boundary. */
  lmraCountsByTeamId: Record<string, string[]>;
};

/**
 * Item 4: drag-and-drop DISPLAY ORDER for Today's Team cards. Native HTML5
 * drag-and-drop (desktop, mouse) — no new dependency — PLUS always-visible
 * Up/Down buttons on every card (works identically on desktop and touch,
 * satisfying "on mobile, do not rely on drag/drop as the only method").
 * Reordering calls reorder_daily_teams() (DISPLAY ORDER ONLY — see that
 * RPC's own comment); membership/shift/foreman/work_area/activity/
 * historical data are never touched by anything in this component.
 *
 * Renders DailyTeamCard directly (both are Client Components) rather than
 * accepting a server-supplied render-prop — a plain function cannot cross
 * the Server/Client Component boundary (confirmed live: an earlier
 * version passed `renderCard: (teamId) => ReactNode` from the Server
 * Component page, which silently failed to render any card content at
 * all — caught via an authenticated HTTP smoke test finding zero
 * manage-tier button text anywhere on the page despite canManage being
 * server-computed as true).
 */
export function DailyTeamsGrid({ companyId, projectId, workDate, canManage, teams, workforce, lmraCountsByTeamId }: DailyTeamsGridProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [order, setOrder] = useState(teams.map((team) => team.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const teamIds = teams.map((team) => team.id);
  if (!draggingId && !isPending && JSON.stringify(order) !== JSON.stringify(teamIds)) {
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
            draggable={canManage}
            onDragStart={() => canManage && setDraggingId(teamId)}
            onDragOver={(event) => canManage && event.preventDefault()}
            onDrop={() => canManage && handleDrop(teamId)}
            onDragEnd={() => setDraggingId(null)}
            className={cn("relative", draggingId === teamId && "opacity-50")}
          >
            {canManage && (
              <div className="absolute top-3 right-3 z-10 flex items-center gap-0.5">
                <Button type="button" variant="ghost" size="icon-sm" disabled={isPending || index === 0} onClick={() => moveBy(teamId, -1)} aria-label="Move card earlier" title="Move earlier">
                  <ChevronUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={isPending || index === order.length - 1}
                  onClick={() => moveBy(teamId, 1)}
                  aria-label="Move card later"
                  title="Move later"
                >
                  <ChevronDown className="size-3.5" />
                </Button>
                <span className="cursor-grab text-muted-foreground" title="Drag to reorder">
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
              lmraIds={lmraCountsByTeamId[teamId] ?? []}
            />
          </div>
        );
      })}
    </div>
  );
}
