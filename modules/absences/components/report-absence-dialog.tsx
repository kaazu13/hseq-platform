"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff } from "lucide-react";
import { toast } from "sonner";
import { reportAbsence } from "@/modules/absences/actions";
import { ABSENCE_REPORT_REASONS, ABSENCE_REPORT_REASON_LABELS, type AbsenceReportReason } from "@/modules/absences/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Employee "[ Report Absence ]" (Phase 7/11) — self-service, own record only. Advisory until a manager reviews it (see report_absence()'s own header comment). */
export function ReportAbsenceDialog({ companyId, projectId }: { companyId: string; projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [workDate, setWorkDate] = useState(todayIsoDate());
  const [reason, setReason] = useState<AbsenceReportReason>("sick");
  const [comment, setComment] = useState("");

  function submit() {
    startTransition(async () => {
      const result = await reportAbsence(companyId, projectId, { workDate, reason, comment: comment || undefined });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Absence reported — your project management team has been notified.");
      setOpen(false);
      setComment("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-auto flex-col gap-1.5 py-4" />}>
        <CalendarOff className="size-5" />
        <span className="text-sm">Report Absence</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report absence</DialogTitle>
          <DialogDescription>Your project management team will review this.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-absence-date">Date</Label>
            <Input id="report-absence-date" type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-absence-reason">Reason</Label>
            <Select value={reason} onValueChange={(value) => setReason(value as AbsenceReportReason)}>
              <SelectTrigger id="report-absence-reason" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ABSENCE_REPORT_REASONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ABSENCE_REPORT_REASON_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-absence-comment">Comment (optional)</Label>
            <Textarea id="report-absence-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={isPending}>
            Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
