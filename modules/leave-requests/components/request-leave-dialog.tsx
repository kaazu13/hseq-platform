"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { requestLeave, resubmitLeaveRequest } from "@/modules/leave-requests/actions";
import { LEAVE_TYPES, LEAVE_TYPE_LABELS, type LeaveType, type LeaveRequest } from "@/modules/leave-requests/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type RequestLeaveDialogProps = {
  companyId: string;
  projectId: string;
  /** When set, this dialog resubmits an existing RETURNED request instead of creating a new one. */
  resubmitTarget?: LeaveRequest;
  trigger?: React.ReactNode;
};

/** Employee "[ Request Holiday / Leave ]" (Phase 8/11) — also handles amend-and-resubmit for a RETURNED request when `resubmitTarget` is set. */
export function RequestLeaveDialog({ companyId, projectId, resubmitTarget, trigger }: RequestLeaveDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [leaveType, setLeaveType] = useState<LeaveType>(resubmitTarget?.leave_type ?? "other");
  // Resubmitting a request that was originally a legacy type (annual/
  // unpaid/compassionate — no longer offered for new requests, see
  // modules/leave-requests/types.ts) still needs a matching SelectItem so
  // the current value renders with its correct label instead of going
  // blank — added only for this one dialog instance, never offered when
  // creating a brand-new request.
  const availableLeaveTypes = resubmitTarget && !LEAVE_TYPES.includes(resubmitTarget.leave_type) ? [resubmitTarget.leave_type, ...LEAVE_TYPES] : LEAVE_TYPES;
  const [startDate, setStartDate] = useState(resubmitTarget?.start_date ?? "");
  const [endDate, setEndDate] = useState(resubmitTarget?.end_date ?? "");
  const [comment, setComment] = useState(resubmitTarget?.employee_comment ?? "");

  function submit() {
    if (!startDate || !endDate) {
      toast.error("Pick both a start and end date.");
      return;
    }
    if (endDate < startDate) {
      toast.error("End date cannot be before the start date.");
      return;
    }
    startTransition(async () => {
      const input = { leaveType, startDate, endDate, comment: comment || undefined };
      const result = resubmitTarget ? await resubmitLeaveRequest(companyId, projectId, resubmitTarget.id, input) : await requestLeave(companyId, projectId, input);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(resubmitTarget ? "Request resubmitted." : "Leave request submitted.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          (trigger as React.ReactElement) ?? (
            <Button variant="outline" className="h-auto flex-col gap-1.5 py-4">
              <CalendarPlus className="size-5" />
              <span className="text-sm">Request Holiday</span>
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{resubmitTarget ? "Amend and resubmit" : "Request holiday / leave"}</DialogTitle>
          <DialogDescription>Your project management team will review this.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="leave-type">Leave type</Label>
            <Select value={leaveType} onValueChange={(value) => setLeaveType(value as LeaveType)}>
              <SelectTrigger id="leave-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableLeaveTypes.map((value) => (
                  <SelectItem key={value} value={value}>
                    {LEAVE_TYPE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="leave-start">Start date</Label>
              <Input id="leave-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="leave-end">End date</Label>
              <Input id="leave-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="leave-comment">Comment (optional)</Label>
            <Textarea id="leave-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={isPending}>
            {resubmitTarget ? "Resubmit" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
