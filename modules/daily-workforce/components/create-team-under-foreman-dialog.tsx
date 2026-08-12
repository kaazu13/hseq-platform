"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createDailyTeamForForeman } from "@/modules/daily-workforce/actions";
import { DAILY_TEAM_SHIFTS, DAILY_TEAM_SHIFT_LABELS, type DailyTeamShift } from "@/modules/daily-workforce/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CreateTeamUnderForemanDialogProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  foremanEmployeeId: string;
  foremanName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Item 5: creates a NEW Today's Team directly under an already-known
 * Foreman — no Foreman re-selection in this flow, unlike the old global
 * "Add team" dialog. Opened from that Foreman's own section on the Teams
 * page.
 */
export function CreateTeamUnderForemanDialog({ companyId, projectId, workDate, foremanEmployeeId, foremanName, open, onOpenChange }: CreateTeamUnderForemanDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [shift, setShift] = useState<DailyTeamShift | "">("");
  const [name, setName] = useState("");

  function reset() {
    setName("");
    setShift("");
    setFieldErrors({});
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createDailyTeamForForeman(companyId, projectId, workDate, {
        name,
        shift: shift as DailyTeamShift,
        foremanEmployeeId,
        workArea: String(formData.get("workArea") ?? ""),
        activity: String(formData.get("activity") ?? ""),
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

  const canSubmit = name.trim().length > 0 && shift !== "";

  return (
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
            <DialogDescription>Foreman: {foremanName}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-team-name">Team name *</Label>
            <Input id="new-team-name" required value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(fieldErrors.name)} />
            {fieldErrors.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-team-shift">Shift *</Label>
              <Select value={shift} onValueChange={(value) => setShift(value as DailyTeamShift)}>
                <SelectTrigger id="new-team-shift" className="w-full" aria-invalid={Boolean(fieldErrors.shift)}>
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
              <Label htmlFor="new-team-work-area">Work area (optional)</Label>
              <Input id="new-team-work-area" name="workArea" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-team-activity">Activity (optional)</Label>
            <Input id="new-team-activity" name="activity" placeholder="e.g. Scaffold Assembly" />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending || !canSubmit}>
              {isPending ? "Creating…" : "Create team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
