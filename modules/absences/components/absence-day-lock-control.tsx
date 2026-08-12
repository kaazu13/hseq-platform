"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { closeAbsenceDay, reopenAbsenceDay } from "@/modules/absences/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

type AbsenceDayLockControlProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  isClosed: boolean;
};

/** "[ Close Absence Day ]" / reopen-with-reason (Phase 5) — mirrors Today's Teams' own lock/unlock control, but as its own separate evidence for the absence record. */
export function AbsenceDayLockControl({ companyId, projectId, workDate, isClosed }: AbsenceDayLockControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState("");

  function close() {
    startTransition(async () => {
      const result = await closeAbsenceDay(companyId, projectId, workDate);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Absence day closed.");
      router.refresh();
    });
  }

  function reopen() {
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    startTransition(async () => {
      const result = await reopenAbsenceDay(companyId, projectId, workDate, { reason });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Absence day reopened.");
      setReopenOpen(false);
      setReason("");
      router.refresh();
    });
  }

  if (isClosed) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <Lock className="size-3" />
          Closed
        </Badge>
        <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
          <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>Reopen</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reopen this absence day</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reopen-reason">Reason</Label>
              <Textarea id="reopen-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReopenOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={reopen} disabled={isPending}>
                Reopen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={close} disabled={isPending} className="gap-1.5">
      <LockOpen className="size-3.5" />
      Close Absence Day
    </Button>
  );
}
