"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setDailyAttendanceStatus } from "@/modules/daily-workforce/actions";
import { DAILY_ATTENDANCE_STATUSES, DAILY_ATTENDANCE_STATUS_LABELS, type DailyAttendanceStatus, type EmployeeDailyState } from "@/modules/daily-workforce/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type WorkforceStatusDialogProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  state: EmployeeDailyState | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Compact status-change dialog (item 11 — "do not display 100 giant
 * always-open <select> controls"). Also carries item 1's confirmation
 * flow: rather than pre-fetching every row's worked-hours total just to
 * decide whether to warn (expensive across 100+ employees), this simply
 * tries the change; if set_daily_attendance_status() rejects it because
 * zeroing already-submitted hours needs a reason (see that RPC's own
 * comment), the exact server message is shown and a reason field appears
 * for an immediate, informed retry — no wasted round trip, no unnecessary
 * per-row query.
 */
export function WorkforceStatusDialog({ companyId, projectId, workDate, state, onOpenChange }: WorkforceStatusDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<DailyAttendanceStatus>(state?.attendanceStatus ?? "not_set");
  const [note, setNote] = useState(state?.attendanceNote ?? "");
  const [reason, setReason] = useState("");
  const [needsReason, setNeedsReason] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  function submit() {
    if (!state) return;
    startTransition(async () => {
      const result = await setDailyAttendanceStatus(companyId, projectId, state.employee.id, workDate, { status, note: note || undefined, reason: reason || undefined });
      if (!result.ok) {
        if (result.error.message.toLowerCase().includes("reason is required")) {
          setNeedsReason(true);
          setServerMessage(result.error.message);
          return;
        }
        toast.error(result.error.message);
        return;
      }
      toast.success(result.data.removedFromTeamId ? "Status updated — removed from today's team." : "Status updated.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{state ? `${state.employee.first_name} ${state.employee.last_name}` : ""}</DialogTitle>
          <DialogDescription>Set today&apos;s attendance status.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workforce-status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as DailyAttendanceStatus)}>
              <SelectTrigger id="workforce-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAILY_ATTENDANCE_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {DAILY_ATTENDANCE_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workforce-note">Note (optional)</Label>
            <Textarea id="workforce-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          {needsReason && (
            <div className="flex flex-col gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{serverMessage}</p>
              <Label htmlFor="workforce-reason">Reason</Label>
              <Textarea id="workforce-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} aria-invalid={!reason.trim()} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={isPending || (needsReason && !reason.trim())} onClick={submit}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
