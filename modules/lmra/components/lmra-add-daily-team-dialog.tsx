"use client";

import { useEffect, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { listTodaysTeamsForLmra } from "@/modules/lmra/actions";
import type { DailyTeamWithMembers } from "@/modules/daily-workforce/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type LmraAddDailyTeamDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  projectId: string;
  /** The LMRA's OWN work date — Today's Teams for THAT date, not necessarily today's calendar date, so a backdated LMRA correctly resolves that day's historical roster (never re-resolved from a "current" team). */
  workDate: string;
  onAddTeam: (employeeIds: string[]) => void;
};

/**
 * "Add Today's Team" (Phase 3) — lists the Daily Workforce teams for the
 * LMRA's project/date (modules/daily-workforce/queries.ts's
 * listDailyTeamsForDate, already scoped by removed_at is null, so an
 * unavailable/absent worker who was removed from the team never appears
 * here). Selecting a team merges its foremen+workers into Workers Involved
 * — deduplication against already-selected workers happens in the caller
 * (modules/lmra/components/lmra-workers-section.tsx), since this dialog has
 * no opinion on what's already selected.
 */
export function LmraAddDailyTeamDialog({ open, onOpenChange, companyId, projectId, workDate, onAddTeam }: LmraAddDailyTeamDialogProps) {
  // `teams === null` (and no error) IS the loading state — deliberately no
  // separate `loading` boolean set synchronously inside the effect body
  // (react-hooks/set-state-in-effect flags that as a cascading-render risk;
  // projectId/workDate are stable for the lifetime of one create/edit
  // session, so there's no meaningful staleness window this would need to
  // guard against).
  const [teams, setTeams] = useState<DailyTeamWithMembers[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listTodaysTeamsForLmra(companyId, projectId, workDate)
      .then((result) => {
        if (!cancelled) setTeams(result);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load today's teams. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, companyId, projectId, workDate]);

  function handleSelect(team: DailyTeamWithMembers) {
    const employeeIds = [...team.foremen, ...team.workers].map((member) => member.employee.id);
    onAddTeam(employeeIds);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Today&apos;s Team</DialogTitle>
          <DialogDescription>Add every worker from one of that day&apos;s teams to Workers Involved.</DialogDescription>
        </DialogHeader>

        {teams === null && !error ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading teams…
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-destructive">{error}</p>
        ) : !teams || teams.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No Today&apos;s Teams exist for this project on this date.</p>
        ) : (
          <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
            {teams.map((team) => {
              const workerCount = team.foremen.length + team.workers.length;
              const foremanNames = team.foremen.map((member) => `${member.employee.first_name} ${member.employee.last_name}`).join(", ");
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => handleSelect(team)}
                  className="flex items-center justify-between gap-3 rounded-md p-2.5 text-left text-sm transition-colors hover:bg-muted/60"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">{team.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{foremanNames || "No foreman assigned"}</span>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3.5" />
                    {workerCount}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The trigger button — a thin wrapper pairing the dialog with its own open state, so callers don't each re-implement useState. */
export function LmraAddDailyTeamButton({ companyId, projectId, workDate, onAddTeam }: Omit<LmraAddDailyTeamDialogProps, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Users />
        Add Today&apos;s Team
      </Button>
      <LmraAddDailyTeamDialog open={open} onOpenChange={setOpen} companyId={companyId} projectId={projectId} workDate={workDate} onAddTeam={onAddTeam} />
    </>
  );
}
