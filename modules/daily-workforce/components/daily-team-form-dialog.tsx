"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateDailyTeam } from "@/modules/daily-workforce/actions";
import { DAILY_TEAM_SHIFTS, DAILY_TEAM_SHIFT_LABELS, type DailyTeamWithMembers, type DailyTeamShift, type EmployeeDailyState } from "@/modules/daily-workforce/types";
import { ForemanPickerDialog } from "@/modules/daily-workforce/components/foreman-picker-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DailyTeamFormDialogProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  team: DailyTeamWithMembers;
  workforce: EmployeeDailyState[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Item 1: the ONE Edit Team dialog — name, Foreman, shift, work area, and
 * activity all save together via update_daily_team_with_foreman(), atomic
 * and all-or-nothing. A shift change that would conflict with another
 * team's current member is rejected server-side with a specific message
 * (surfaced as a toast) and nothing is partially applied. The embedded
 * Foreman picker (ForemanPickerDialog) shows every eligible Foreman —
 * unlike the old WorkerPickerDialog(mode="foreman"), it never disables or
 * requires "Move to…" for a Foreman who already runs another team; that is
 * completely normal now. Picking one only stages the choice locally until
 * Save.
 */
export function DailyTeamFormDialog({ companyId, projectId, workDate, team, workforce, open, onOpenChange }: DailyTeamFormDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [shift, setShift] = useState<DailyTeamShift | "">(team.shift ?? "");
  const currentForeman = team.foreman;
  const [foremanId, setForemanId] = useState<string | null>(currentForeman?.id ?? null);
  const [foremanName, setForemanName] = useState<string | null>(currentForeman ? `${currentForeman.first_name} ${currentForeman.last_name}` : null);
  const [foremanPickerOpen, setForemanPickerOpen] = useState(false);
  const [name, setName] = useState(team.name);

  function resetToTeam() {
    setName(team.name);
    setShift(team.shift ?? "");
    setForemanId(currentForeman?.id ?? null);
    setForemanName(currentForeman ? `${currentForeman.first_name} ${currentForeman.last_name}` : null);
    setFieldErrors({});
  }

  function handleSelectForeman(employeeId: string) {
    const state = workforce.find((candidate) => candidate.employee.id === employeeId);
    setForemanId(employeeId);
    setForemanName(state ? `${state.employee.first_name} ${state.employee.last_name}` : null);
    setForemanPickerOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    const formData = new FormData(event.currentTarget);
    const input = {
      name: String(formData.get("name") ?? ""),
      shift: shift as DailyTeamShift,
      foremanEmployeeId: foremanId !== currentForeman?.id ? foremanId : null,
      workArea: String(formData.get("workArea") ?? ""),
      activity: String(formData.get("activity") ?? ""),
    };

    startTransition(async () => {
      const result = await updateDailyTeam(companyId, projectId, workDate, team.id, input);
      if (!result.ok) {
        toast.error(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  const canSubmit = name.trim().length > 0 && shift !== "";

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) resetToTeam();
          onOpenChange(next);
        }}
      >
        <DialogContent className="max-w-md">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Edit team</DialogTitle>
              <DialogDescription>Update this team&apos;s details. Changes save together, or not at all.</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Team name</Label>
              <Input id="name" name="name" required value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(fieldErrors.name)} />
              {fieldErrors.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-team-foreman">Foreman</Label>
              <Button id="edit-team-foreman" type="button" variant="outline" className="justify-start" onClick={() => setForemanPickerOpen(true)}>
                {foremanName ?? "No foreman assigned — select one"}
              </Button>
              {fieldErrors.foremanEmployeeId && <p className="text-sm text-destructive">{fieldErrors.foremanEmployeeId}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="shift">Shift</Label>
                <Select value={shift} onValueChange={(value) => setShift(value as DailyTeamShift)}>
                  <SelectTrigger id="shift" className="w-full" aria-invalid={Boolean(fieldErrors.shift)}>
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent>
                    {DAILY_TEAM_SHIFTS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {DAILY_TEAM_SHIFT_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="workArea">Work area (optional)</Label>
                <Input id="workArea" name="workArea" defaultValue={team.work_area ?? ""} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="activity">Activity (optional)</Label>
              <Input id="activity" name="activity" defaultValue={team.activity ?? ""} placeholder="e.g. Scaffold Assembly" />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isPending || !canSubmit}>
                {isPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ForemanPickerDialog
        open={foremanPickerOpen}
        onOpenChange={setForemanPickerOpen}
        title="Select foreman"
        description="Only employees holding this project's Foreman role are shown. They may already run other teams — that's expected."
        workforce={workforce}
        onSelect={handleSelectForeman}
      />
    </>
  );
}
