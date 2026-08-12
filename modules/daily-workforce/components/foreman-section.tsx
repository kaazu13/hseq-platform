"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { removeDailyTeamForeman } from "@/modules/daily-workforce/actions";
import { CreateTeamUnderForemanDialog } from "@/modules/daily-workforce/components/create-team-under-foreman-dialog";
import { DailyTeamsGrid } from "@/modules/daily-workforce/components/daily-teams-grid";
import type { DailyTeamWithMembers, EmployeeDailyState } from "@/modules/daily-workforce/types";
import type { DailyTeamLmraSummary } from "@/modules/lmra/queries";
import { SectionHeader } from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";

type ForemanSectionProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  canManage: boolean;
  foremanId: string | null;
  foremanName: string;
  teams: DailyTeamWithMembers[];
  workforce: EmployeeDailyState[];
  lmraCountsByTeamId: Record<string, DailyTeamLmraSummary[]>;
};

/**
 * Item 3/5/6: one Foreman's section on Today's Teams — heading, that
 * Foreman's own "+ Add Team" (skips Foreman re-selection entirely, item
 * 5), and its team grid. Renders even with zero teams (a Foreman may
 * exist on today's roster with none yet). The "No Foreman Assigned"
 * legacy fallback group (foremanId === null) never gets an Add Team
 * button or a Remove control — it is historical/repair-only, per item 3's
 * original requirement; use Change Foreman on one of its cards to repair.
 */
export function ForemanSection({ companyId, projectId, workDate, canManage, foremanId, foremanName, teams, workforce, lmraCountsByTeamId }: ForemanSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);

  function handleRemoveForeman() {
    if (!foremanId) return;
    startTransition(async () => {
      const result = await removeDailyTeamForeman(companyId, projectId, workDate, foremanId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeader title={foremanName} />
        {canManage && foremanId && (
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus />
              Add Team
            </Button>
            {teams.length === 0 && (
              <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={handleRemoveForeman} title="Remove this foreman from today's roster">
                <UserMinus />
                Remove
              </Button>
            )}
          </div>
        )}
      </div>

      {teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">No teams yet for this foreman today.</p>
      ) : (
        <DailyTeamsGrid
          companyId={companyId}
          projectId={projectId}
          workDate={workDate}
          canManage={canManage}
          teams={teams}
          workforce={workforce}
          lmraCountsByTeamId={lmraCountsByTeamId}
        />
      )}

      {canManage && foremanId && (
        <CreateTeamUnderForemanDialog
          companyId={companyId}
          projectId={projectId}
          workDate={workDate}
          foremanEmployeeId={foremanId}
          foremanName={foremanName}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}
    </div>
  );
}
