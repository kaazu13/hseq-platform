"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { lockDailyTeams, unlockDailyTeams } from "@/modules/daily-workforce/actions";
import { DAILY_TEAM_STATUS_LABELS } from "@/modules/daily-workforce/types";
import { DateNav } from "@/modules/daily-workforce/components/date-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type DailyTeamsHeaderProps = {
  companyId: string;
  projectId: string;
  basePath: string;
  workDate: string;
  todayDate: string;
  hasOpenTeams: boolean;
  hasLockedTeams: boolean;
  canManage: boolean;
};

/**
 * Today's Teams' date navigation + [ Lock Today's Teams ] / unlock
 * lifecycle controls. Milestone G: the global "Add team" button is
 * retired — teams are now created per-Foreman-section on the page itself
 * (each already-added Foreman gets its own "+ Add Team"), and a project-
 * wide "+ Add Foreman" button lives at the bottom of the Foreman list —
 * both rendered by the page, not here.
 */
export function DailyTeamsHeader({ companyId, projectId, basePath, workDate, todayDate, hasOpenTeams, hasLockedTeams, canManage }: DailyTeamsHeaderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");

  function handleLock() {
    startTransition(async () => {
      const result = await lockDailyTeams(companyId, projectId, workDate);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Today's Teams locked.");
      router.refresh();
    });
  }

  function handleUnlock() {
    startTransition(async () => {
      const result = await unlockDailyTeams(companyId, projectId, workDate, { reason: unlockReason });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Today's Teams unlocked for corrections.");
      setUnlockOpen(false);
      setUnlockReason("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateNav basePath={basePath} workDate={workDate} todayDate={todayDate} />

        <div className="flex items-center gap-2">
          {hasLockedTeams && !hasOpenTeams && (
            <Badge variant="secondary" className="gap-1">
              <Lock className="size-3" />
              {DAILY_TEAM_STATUS_LABELS.locked}
            </Badge>
          )}
          {canManage && hasOpenTeams && (
            <Button size="sm" variant="outline" disabled={isPending} onClick={handleLock}>
              <Lock />
              Lock Today&apos;s Teams
            </Button>
          )}
          {canManage && hasLockedTeams && !hasOpenTeams && (
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setUnlockOpen(true)}>
              <LockOpen />
              Unlock
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock Today&apos;s Teams for this day?</AlertDialogTitle>
            <AlertDialogDescription>
              This reopens the day&apos;s teams for correction. A reason is required and becomes part of the permanent audit trail alongside who originally locked it and who unlocks it now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unlockReason" className="text-xs">
              Reason
            </Label>
            <Textarea id="unlockReason" rows={3} required value={unlockReason} onChange={(event) => setUnlockReason(event.target.value)} />
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setUnlockOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={isPending || !unlockReason.trim()} onClick={handleUnlock}>
              {isPending ? "Unlocking…" : "Confirm unlock"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
