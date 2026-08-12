"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Lock, Pencil, Plus, ShieldCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { moveDailyTeamMember, removeDailyTeamMember } from "@/modules/daily-workforce/actions";
import { DAILY_TEAM_SHIFT_LABELS, type DailyTeamWithMembers, type EmployeeDailyState } from "@/modules/daily-workforce/types";
import type { DailyTeamLmraSummary } from "@/modules/lmra/queries";
import { LMRA_STATUS_LABELS } from "@/modules/lmra/types";
import { DailyTeamFormDialog } from "@/modules/daily-workforce/components/daily-team-form-dialog";
import { WorkerPickerDialog } from "@/modules/daily-workforce/components/worker-picker-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type DailyTeamCardProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  team: DailyTeamWithMembers;
  workforce: EmployeeDailyState[];
  canManage: boolean;
  /** Item 3: every valid (non-archived) LMRA already created for this EXACT (company, project, daily_team_id, work_date), newest first. Zero = neutral "LMRA"; one = green "✓ LMRA" linking straight to it; more than one = green "✓ LMRA (N)" opening a list of all of them. */
  lmraEntries?: DailyTeamLmraSummary[];
};

function formatLmraTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * A single Today's Team card — see this milestone's example UI ("Team
 * A200 / Foreman: Karl Andersson / Area: A200 / Activity: Scaffold
 * Assembly / 8 workers"). Read-only once the team's own status is locked
 * (Phase C) — canManage alone doesn't gate the interactive controls, since
 * even a manage-tier user cannot edit a locked day without first calling
 * unlock (a day-level action, not per-team — see the page header).
 */
export function DailyTeamCard({ companyId, projectId, workDate, team, workforce, canManage, lmraEntries = [] }: DailyTeamCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"member" | "foreman" | null>(null);

  const isLocked = team.status === "locked";
  const canEdit = canManage && !isLocked;
  const totalCount = team.foremen.length + team.workers.length;

  function handleAssign(employeeId: string) {
    startTransition(async () => {
      const result = await moveDailyTeamMember(companyId, projectId, workDate, { employeeId, dailyTeamId: team.id, role: pickerMode === "foreman" ? "foreman" : "member" });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setPickerMode(null);
      router.refresh();
    });
  }

  function handleRemove(dailyTeamMemberId: string) {
    startTransition(async () => {
      const result = await removeDailyTeamMember(companyId, projectId, workDate, dailyTeamMemberId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="gap-2 rounded-t-xl px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{team.name}</span>
              {team.shift && (
                <Badge variant="outline" className="text-xs">
                  {DAILY_TEAM_SHIFT_LABELS[team.shift]}
                </Badge>
              )}
              {isLocked && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Lock className="size-3" />
                  Locked
                </Badge>
              )}
            </div>
            {team.work_area && <span className="text-xs text-muted-foreground">Area: {team.work_area}</span>}
            {team.activity && <span className="text-xs text-muted-foreground">Activity: {team.activity}</span>}
          </div>
          {canEdit && (
            <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)} aria-label={`Edit ${team.name}`} title="Edit team">
              <Pencil />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{team.foremen.length === 1 ? "Foreman" : "Foremen"}</span>
          {team.foremen.length === 0 ? (
            <p className="text-sm text-muted-foreground">No foreman assigned</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {team.foremen.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm">
                    {member.employee.first_name} {member.employee.last_name}
                  </span>
                  {canEdit && (
                    <Button variant="ghost" size="icon-sm" disabled={isPending} onClick={() => handleRemove(member.id)} aria-label={`Remove ${member.employee.first_name} ${member.employee.last_name}`}>
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setPickerMode("foreman")} className="self-start">
              <UserPlus />
              {team.foremen.length === 0 ? "Assign foreman" : "Change foreman"}
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Workers</span>
          {team.workers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No workers assigned</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {team.workers.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm">
                    {member.employee.first_name} {member.employee.last_name}
                  </span>
                  {canEdit && (
                    <Button variant="ghost" size="icon-sm" disabled={isPending} onClick={() => handleRemove(member.id)} aria-label={`Remove ${member.employee.first_name} ${member.employee.last_name}`}>
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setPickerMode("member")} className="self-start">
              <Plus />
              Add worker
            </Button>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {totalCount} {totalCount === 1 ? "worker" : "workers"}
        </span>
        <div className="flex items-center gap-1">
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
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                  />
                }
              >
                <ShieldCheck />
                LMRA ({lmraEntries.length})
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs text-muted-foreground">{team.name} — {lmraEntries.length} LMRAs today</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {lmraEntries.map((entry) => (
                  <DropdownMenuItem key={entry.id} render={<Link href={`/lmra/${entry.id}`} />}>
                    {formatLmraTimestamp(entry.createdAt)} · {LMRA_STATUS_LABELS[entry.status]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/observations/new?projectId=${projectId}&dailyTeamId=${team.id}`} />}>
            <Eye />
            Observation
          </Button>
        </div>
      </CardFooter>

      {canEdit && <DailyTeamFormDialog companyId={companyId} projectId={projectId} workDate={workDate} team={team} workforce={workforce} open={editOpen} onOpenChange={setEditOpen} />}
      {canEdit && (
        <WorkerPickerDialog
          open={pickerMode !== null}
          onOpenChange={(open) => !open && setPickerMode(null)}
          title={pickerMode === "foreman" ? `Assign foreman — ${team.name}` : `Add worker — ${team.name}`}
          workforce={workforce}
          mode={pickerMode === "foreman" ? "foreman" : "worker"}
          currentTeamId={team.id}
          currentTeamName={team.name}
          onSelect={handleAssign}
        />
      )}
    </Card>
  );
}
