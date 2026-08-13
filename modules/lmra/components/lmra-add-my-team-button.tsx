"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Loader2, UserCheck } from "lucide-react";
import { getMyTodaysTeamForLmra } from "@/modules/lmra/actions";
import { Button } from "@/components/ui/button";

type LmraAddMyTeamButtonProps = {
  companyId: string;
  projectId: string;
  /** The LMRA's OWN work date — the caller's ACTUAL historical team roster for that exact date, never a "current" team re-resolved later. */
  workDate: string;
  /** Bug fix: also carries the resolved daily_team_id — this button used to ONLY add participants, which is exactly why Today's Teams' LMRA indicator never turned green for LMRAs created this way (create_lmra_assessment's daily_team_id stayed null). */
  onAddTeam: (employeeIds: string[], dailyTeamId: string) => void;
};

/**
 * Item 2: "Add My Today's Team" — the everyday employee-facing shortcut.
 * One click resolves the LOGGED-IN employee's own Today's Team for this
 * LMRA's (company, project, work_date) and adds its Foreman, every current
 * worker, and the employee themselves to Workers Involved — deduplicated
 * by the caller (LmraWorkersSection) — AND links this LMRA to that exact
 * team (daily_team_id), which is what actually makes Today's Teams'
 * completion indicator turn green for it. No team list/picker: unlike
 * "Select Today's Team" (elevated roles only), this never exposes every
 * project team to an ordinary employee.
 */
export function LmraAddMyTeamButton({ companyId, projectId, workDate, onAddTeam }: LmraAddMyTeamButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await getMyTodaysTeamForLmra(companyId, projectId, workDate);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onAddTeam(result.data.employeeIds, result.data.dailyTeamId);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
        {isPending ? <Loader2 className="animate-spin" /> : <UserCheck />}
        Add My Today&apos;s Team
      </Button>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
