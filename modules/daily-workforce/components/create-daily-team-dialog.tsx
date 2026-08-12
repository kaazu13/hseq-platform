"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createDailyTeam } from "@/modules/daily-workforce/actions";
import { DAILY_TEAM_SHIFTS, DAILY_TEAM_SHIFT_LABELS, type EmployeeDailyState, type DailyTeamShift } from "@/modules/daily-workforce/types";
import { WorkerPickerDialog } from "@/modules/daily-workforce/components/worker-picker-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CreateDailyTeamDialogProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  workforce: EmployeeDailyState[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Item 9: the ONLY way to create a NEW Today's Team. Team name, a
 * controlled shift, and a real, eligible foreman (via the SAME
 * foreman-only WorkerPickerDialog every other foreman assignment uses —
 * never a second, divergent picker) are all required before "Create
 * team" is enabled — create_daily_team_with_foreman() re-enforces every
 * one of these server-side regardless. A legacy team created before this
 * requirement existed may still have no foreman; it stays repairable via
 * the ordinary "Assign foreman" flow on its own card (DailyTeamFormDialog
 * + WorkerPickerDialog), which this dialog does not touch.
 */
export function CreateDailyTeamDialog({ companyId, projectId, workDate, workforce, open, onOpenChange }: CreateDailyTeamDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [shift, setShift] = useState<DailyTeamShift | "">("");
  const [foremanId, setForemanId] = useState<string | null>(null);
  const [foremanName, setForemanName] = useState<string | null>(null);
  const [foremanPickerOpen, setForemanPickerOpen] = useState(false);
  const [name, setName] = useState("");
  const [workArea, setWorkArea] = useState("");
  const [activity, setActivity] = useState("");

  function reset() {
    setName("");
    setShift("");
    setForemanId(null);
    setForemanName(null);
    setWorkArea("");
    setActivity("");
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

    startTransition(async () => {
      const result = await createDailyTeam(companyId, projectId, workDate, {
        name,
        shift: shift as DailyTeamShift,
        foremanEmployeeId: foremanId as string,
        workArea: workArea || undefined,
        activity: activity || undefined,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
        return;
      }
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  const canSubmit = name.trim().length > 0 && shift !== "" && foremanId !== null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          onOpenChange(next);
        }}
      >
        <DialogContent className="max-w-md">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>New team</DialogTitle>
              <DialogDescription>A team name, shift, and foreman are all required.</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-team-name">Team name *</Label>
              <Input id="create-team-name" required value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(fieldErrors.name)} />
              {fieldErrors.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-team-foreman">Foreman *</Label>
              <Button id="create-team-foreman" type="button" variant="outline" className="justify-start" onClick={() => setForemanPickerOpen(true)}>
                {foremanName ?? "Select foreman…"}
              </Button>
              {fieldErrors.foremanEmployeeId && <p className="text-sm text-destructive">{fieldErrors.foremanEmployeeId}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="create-team-shift">Shift *</Label>
                <Select value={shift} onValueChange={(value) => setShift(value as DailyTeamShift)}>
                  <SelectTrigger id="create-team-shift" className="w-full" aria-invalid={Boolean(fieldErrors.shift)}>
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
                <Label htmlFor="create-team-work-area">Work area (optional)</Label>
                <Input id="create-team-work-area" value={workArea} onChange={(event) => setWorkArea(event.target.value)} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-team-activity">Activity (optional)</Label>
              <Input id="create-team-activity" value={activity} onChange={(event) => setActivity(event.target.value)} placeholder="e.g. Scaffold Assembly" />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isPending || !canSubmit}>
                {isPending ? "Creating…" : "Create team"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <WorkerPickerDialog
        open={foremanPickerOpen}
        onOpenChange={setForemanPickerOpen}
        title="Select foreman"
        description="Only employees holding this project's Foreman role are shown."
        workforce={workforce}
        mode="foreman"
        currentTeamName={name || "this team"}
        onSelect={handleSelectForeman}
      />
    </>
  );
}
