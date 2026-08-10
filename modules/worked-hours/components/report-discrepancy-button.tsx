"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reportWorkedHoursDiscrepancy } from "@/modules/worked-hours/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type ReportDiscrepancyButtonProps = {
  companyId: string;
  workedHoursId: string;
};

/** Employee "[ Report discrepancy ]" — Phase E. Own-row only, enforced by RLS/report_worked_hours_discrepancy() regardless of what workedHoursId is passed here. */
export function ReportDiscrepancyButton({ companyId, workedHoursId }: ReportDiscrepancyButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      const result = await reportWorkedHoursDiscrepancy(companyId, workedHoursId, { comment });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Discrepancy reported.");
      setOpen(false);
      setComment("");
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Report discrepancy
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Report a discrepancy</DialogTitle>
            <DialogDescription>Explain what looks wrong with these hours — your Project Manager will review it.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="e.g. I worked 10 hours, not 8" />
          <DialogFooter>
            <Button type="button" disabled={isPending || !comment.trim()} onClick={handleSubmit}>
              {isPending ? "Sending…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
