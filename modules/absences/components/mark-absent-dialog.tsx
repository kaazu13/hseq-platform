"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { correctAbsenceStatus } from "@/modules/absences/actions";
import { DAILY_ATTENDANCE_STATUSES, DAILY_ATTENDANCE_STATUS_LABELS, type DailyAttendanceStatus } from "@/modules/daily-workforce/types";
import type { EmployeeOption } from "@/modules/employees/employee-options";
import { EmployeeCombobox } from "@/components/shared/employee-combobox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

const UNAVAILABLE_STATUSES = DAILY_ATTENDANCE_STATUSES.filter((status) => status !== "not_set" && status !== "present");

type MarkAbsentDialogProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  isClosed: boolean;
  rosterOptions: EmployeeOption[];
};

/** Manager "[ Mark Absent ]" (Phase 4) — search any project roster employee, pick an unavailable status, save. Reuses set_daily_attendance_status via correctAbsenceStatus, same write path as Today's Teams. */
export function MarkAbsentDialog({ companyId, projectId, workDate, isClosed, rosterOptions }: MarkAbsentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [status, setStatus] = useState<DailyAttendanceStatus>("absent");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [needsReason, setNeedsReason] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  function submit() {
    if (!employeeId) {
      toast.error("Pick an employee.");
      return;
    }
    if (isClosed && !reason.trim()) {
      toast.error("A reason is required — this day is closed.");
      return;
    }
    startTransition(async () => {
      const result = await correctAbsenceStatus(companyId, projectId, employeeId, workDate, { status, note: note || undefined, reason: reason || undefined });
      if (!result.ok) {
        // Item 1: marking someone absent/unavailable can require a reason
        // because it will zero out already-submitted worked hours — the
        // server is the source of truth for when that applies; retry
        // in place with the reason field revealed instead of a second
        // round trip to pre-check.
        if (result.error.message.toLowerCase().includes("reason is required")) {
          setNeedsReason(true);
          setServerMessage(result.error.message);
          return;
        }
        toast.error(result.error.message);
        return;
      }
      toast.success("Marked absent.");
      setOpen(false);
      setEmployeeId(null);
      setNote("");
      setReason("");
      setNeedsReason(false);
      setServerMessage(null);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Mark Absent</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark employee absent</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mark-absent-employee">Employee</Label>
            <EmployeeCombobox id="mark-absent-employee" value={employeeId} onValueChange={setEmployeeId} options={rosterOptions} placeholder="Search roster…" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mark-absent-status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as DailyAttendanceStatus)}>
              <SelectTrigger id="mark-absent-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNAVAILABLE_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {DAILY_ATTENDANCE_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mark-absent-note">Note (optional)</Label>
            <Input id="mark-absent-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
          </div>
          {isClosed && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mark-absent-reason">Reason (required — this day is closed)</Label>
              <Input id="mark-absent-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} />
            </div>
          )}
          {!isClosed && needsReason && (
            <div className="flex flex-col gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              {serverMessage && <p className="text-sm text-destructive">{serverMessage}</p>}
              <Label htmlFor="mark-absent-hours-reason">Reason</Label>
              <Input id="mark-absent-hours-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} aria-invalid={!reason.trim()} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={isPending}>
            Mark absent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
