"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock, LockOpen, Plus } from "lucide-react";
import { toast } from "sonner";
import { lockDailyTeams, unlockDailyTeams } from "@/modules/daily-workforce/actions";
import { CreateDailyTeamDialog } from "@/modules/daily-workforce/components/create-daily-team-dialog";
import type { EmployeeDailyState } from "@/modules/daily-workforce/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  workforce: EmployeeDailyState[];
};

function shiftDate(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Today's Teams' date navigation + [ Lock Today's Teams ] / unlock lifecycle controls — see this milestone's Phase C example UX. */
export function DailyTeamsHeader({ companyId, projectId, basePath, workDate, todayDate, hasOpenTeams, hasLockedTeams, canManage, workforce }: DailyTeamsHeaderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const isToday = workDate === todayDate;

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
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`${basePath}?date=${shiftDate(workDate, -1)}`} />} aria-label="Previous day">
            <ChevronLeft />
          </Button>
          <Input
            type="date"
            value={workDate}
            onChange={(event) => router.push(`${basePath}?date=${event.target.value}`)}
            className="w-auto"
            aria-label="Select date"
          />
          <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`${basePath}?date=${shiftDate(workDate, 1)}`} />} aria-label="Next day">
            <ChevronRight />
          </Button>
          {!isToday && (
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={basePath} />}>
              Today
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasLockedTeams && !hasOpenTeams && (
            <Badge variant="secondary" className="gap-1">
              <Lock className="size-3" />
              Locked
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
          {canManage && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus />
              Add team
            </Button>
          )}
        </div>
      </div>

      {canManage && <CreateDailyTeamDialog companyId={companyId} projectId={projectId} workDate={workDate} workforce={workforce} open={createOpen} onOpenChange={setCreateOpen} />}

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
