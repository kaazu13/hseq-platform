"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveDailyTeam } from "@/modules/daily-workforce/actions";
import { DAILY_TEAM_SHIFTS, DAILY_TEAM_SHIFT_LABELS, type DailyTeam, type DailyTeamShift } from "@/modules/daily-workforce/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DailyTeamFormDialogProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  team: DailyTeam;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * EDIT an EXISTING Today's Team's own fields — name/shift/work area/
 * activity. Membership (including the foreman) is managed separately, via
 * WorkerPickerDialog/DailyTeamCard's own controls. Item 9's "a NEW team
 * requires a foreman + shift" is enforced by CreateDailyTeamDialog, the
 * ONLY create path — this dialog is edit-only (never create), so a
 * historical, legacy no-foreman team stays freely renameable/repairable
 * without the new-team requirement retroactively blocking it.
 */
export function DailyTeamFormDialog({ companyId, projectId, workDate, team, open, onOpenChange }: DailyTeamFormDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [shift, setShift] = useState<DailyTeamShift | "">(team.shift ?? "");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    const formData = new FormData(event.currentTarget);
    const input = {
      name: String(formData.get("name") ?? ""),
      shift: shift || undefined,
      workArea: String(formData.get("workArea") ?? ""),
      activity: String(formData.get("activity") ?? ""),
    };

    startTransition(async () => {
      const result = await saveDailyTeam(companyId, projectId, workDate, team.id, input);
      if (!result.ok) {
        toast.error(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Edit {team.name}</DialogTitle>
            <DialogDescription>Update this team&apos;s details.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Team name</Label>
            <Input id="name" name="name" required defaultValue={team.name} aria-invalid={Boolean(fieldErrors.name)} />
            {fieldErrors.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shift">Shift</Label>
              <Select value={shift} onValueChange={(value) => setShift(value as DailyTeamShift)}>
                <SelectTrigger id="shift" className="w-full">
                  <SelectValue placeholder="Not set" />
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
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
