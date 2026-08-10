"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveDailyTeam } from "@/modules/daily-workforce/actions";
import type { DailyTeam } from "@/modules/daily-workforce/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DailyTeamFormDialogProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  /** Undefined = create mode. */
  team?: DailyTeam;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Create/edit a Today's Team's own fields — name/shift/work area/activity. Membership is managed separately, per-worker, via WorkerPickerDialog/DailyTeamCard's own controls — this dialog is deliberately small and fast. */
export function DailyTeamFormDialog({ companyId, projectId, workDate, team, open, onOpenChange }: DailyTeamFormDialogProps) {
  const router = useRouter();
  const mode = team ? "edit" : "create";
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    const formData = new FormData(event.currentTarget);
    const input = {
      name: String(formData.get("name") ?? ""),
      shift: String(formData.get("shift") ?? ""),
      workArea: String(formData.get("workArea") ?? ""),
      activity: String(formData.get("activity") ?? ""),
    };

    startTransition(async () => {
      const result = await saveDailyTeam(companyId, projectId, workDate, team?.id ?? null, input);
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
            <DialogTitle>{mode === "create" ? "New team" : `Edit ${team!.name}`}</DialogTitle>
            <DialogDescription>{mode === "create" ? "Add a team for today's workforce." : "Update this team's details."}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Team name</Label>
            <Input id="name" name="name" required defaultValue={team?.name} aria-invalid={Boolean(fieldErrors.name)} />
            {fieldErrors.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shift">Shift (optional)</Label>
              <Input id="shift" name="shift" defaultValue={team?.shift ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="workArea">Work area (optional)</Label>
              <Input id="workArea" name="workArea" defaultValue={team?.work_area ?? ""} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="activity">Activity (optional)</Label>
            <Input id="activity" name="activity" defaultValue={team?.activity ?? ""} placeholder="e.g. Scaffold Assembly" />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : mode === "create" ? "Create team" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
