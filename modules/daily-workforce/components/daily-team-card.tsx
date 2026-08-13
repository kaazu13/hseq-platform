"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Lock, Pencil, Plus, ShieldCheck, UserCog, X } from "lucide-react";
import { toast } from "sonner";
import { moveDailyTeamMember, removeDailyTeamMember, updateDailyTeam } from "@/modules/daily-workforce/actions";
import { DAILY_TEAM_SHIFT_LABELS, DAILY_TEAM_STATUS_LABELS, type DailyTeamWithMembers, type EmployeeDailyState } from "@/modules/daily-workforce/types";
import type { DailyTeamLmraSummary } from "@/modules/lmra/queries";
import { LMRA_STATUS_LABELS } from "@/modules/lmra/types";
import { DailyTeamFormDialog } from "@/modules/daily-workforce/components/daily-team-form-dialog";
import { WorkerPickerDialog } from "@/modules/daily-workforce/components/worker-picker-dialog";
import { ForemanPickerDialog } from "@/modules/daily-workforce/components/foreman-picker-dialog";
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
 * A single Today's Team card. Read-only once the team's own status is
 * locked (Phase C) — canManage alone doesn't gate the interactive
 * controls, since even a manage-tier user cannot edit a locked day without
 * first calling unlock (a day-level action, not per-team — see the page
 * header).
 *
 * Milestone G: a team has exactly ONE responsible Foreman
 * (team.foreman_employee_id, a direct column — never a
 * daily_team_members row), shown as plain text with a "Change Foreman"
 * action, not a removable list — a team is never left with zero Foremen
 * through this card (only Edit Team's Foreman field, or Change Foreman
 * here, ever changes it, both atomic). The new Foreman may already run
 * any number of other teams; that is normal and never blocked.
 *
 * Item 1: the pencil button is deliberately NOT inside the drag-handle
 * region (DailyTeamsGrid keeps dragging to a dedicated handle, never the
 * whole card) — explicit `type="button"` and a stopped pointerDown here
 * are extra, defensive insurance against any ancestor ever intercepting
 * the click again.
 */
export function DailyTeamCard({ companyId, projectId, workDate, team, workforce, canManage, lmraEntries = [] }: DailyTeamCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [workerPickerOpen, setWorkerPickerOpen] = useState(false);
  const [foremanPickerOpen, setForemanPickerOpen] = useState(false);

  const isLocked = team.status === "locked";
  const canEdit = canManage && !isLocked;
  const totalCount = (team.foreman ? 1 : 0) + team.workers.length;

  function handleAssignWorker(employeeId: string) {
    startTransition(async () => {
      const result = await moveDailyTeamMember(companyId, projectId, workDate, { employeeId, dailyTeamId: team.id, role: "member" });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setWorkerPickerOpen(false);
      router.refresh();
    });
  }

  function handleChangeForeman(employeeId: string) {
    startTransition(async () => {
      const result = await updateDailyTeam(companyId, projectId, workDate, team.id, {
        name: team.name,
        shift: team.shift ?? "day",
        foremanEmployeeId: employeeId,
        workArea: team.work_area ?? "",
        activity: team.activity ?? "",
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setForemanPickerOpen(false);
      router.refresh();
    });
  }

  function handleRemoveWorker(dailyTeamMemberId: string) {
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
                  {DAILY_TEAM_STATUS_LABELS.locked}
                </Badge>
              )}
            </div>
            {team.work_area && <span className="text-xs text-muted-foreground">Area: {team.work_area}</span>}
            {team.activity && <span className="text-xs text-muted-foreground">Activity: {team.activity}</span>}
          </div>
          {canEdit && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setEditOpen(true)}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label={`Edit ${team.name}`}
              title="Edit team"
            >
              <Pencil />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Foreman</span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">{team.foreman ? `${team.foreman.first_name} ${team.foreman.last_name}` : "No foreman assigned"}</span>
            {canEdit && (
              <Button type="button" variant="outline" size="sm" onClick={() => setForemanPickerOpen(true)}>
                <UserCog />
                Change Foreman
              </Button>
            )}
          </div>
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={isPending}
                      onClick={() => handleRemoveWorker(member.id)}
                      aria-label={`Remove ${member.employee.first_name} ${member.employee.last_name}`}
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <Button type="button" variant="outline" size="sm" onClick={() => setWorkerPickerOpen(true)} className="self-start">
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
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/observations/new?projectId=${projectId}&dailyTeamId=${team.id}`} />}>
            <Eye />
            Observation
          </Button>
        </div>
      </CardFooter>

      {canEdit && <DailyTeamFormDialog companyId={companyId} projectId={projectId} workDate={workDate} team={team} workforce={workforce} open={editOpen} onOpenChange={setEditOpen} />}
      {canEdit && (
        <WorkerPickerDialog
          open={workerPickerOpen}
          onOpenChange={setWorkerPickerOpen}
          title={`Add worker — ${team.name}`}
          workforce={workforce}
          currentTeamId={team.id}
          currentTeamName={team.name}
          onSelect={handleAssignWorker}
        />
      )}
      {canEdit && (
        <ForemanPickerDialog
          open={foremanPickerOpen}
          onOpenChange={setForemanPickerOpen}
          title={`Change foreman — ${team.name}`}
          description="Only employees holding this project's Foreman role are shown. They may already run other teams — that's expected."
          workforce={workforce}
          onSelect={handleChangeForeman}
        />
      )}
    </Card>
  );
}
