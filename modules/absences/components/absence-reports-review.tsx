"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { confirmAbsenceReport, rejectAbsenceReport } from "@/modules/absences/actions";
import { ABSENCE_REPORT_REASON_LABELS, ABSENCE_REPORT_STATUS_LABELS, type AbsenceReportWithEmployee } from "@/modules/absences/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

function statusBadgeVariant(status: AbsenceReportWithEmployee["status"]): "secondary" | "outline" | "destructive" {
  if (status === "confirmed") return "secondary";
  if (status === "rejected") return "destructive";
  return "outline";
}

type AbsenceReportsReviewProps = {
  companyId: string;
  projectId: string;
  reports: AbsenceReportWithEmployee[];
  canManage: boolean;
};

/** Self-reported absences for one date, distinguishing "Reported by employee" from any later management confirm/reject (Phase 7). */
export function AbsenceReportsReview({ companyId, projectId, reports, canManage }: AbsenceReportsReviewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [confirmReasonTargetId, setConfirmReasonTargetId] = useState<string | null>(null);
  const [confirmReason, setConfirmReason] = useState("");
  const [confirmServerMessage, setConfirmServerMessage] = useState<string | null>(null);

  function confirm(reportId: string, reason?: string) {
    startTransition(async () => {
      const result = await confirmAbsenceReport(companyId, projectId, reportId, reason);
      if (!result.ok) {
        // Rare case: this date already has SUBMITTED worked hours for the
        // employee, and confirming would zero them out — the server is the
        // source of truth for when that applies. Same "retry in place with
        // the reason field revealed" pattern as Mark Absent.
        if (result.error.message.toLowerCase().includes("reason is required")) {
          setConfirmReasonTargetId(reportId);
          setConfirmServerMessage(result.error.message);
          return;
        }
        toast.error(result.error.message);
        return;
      }
      toast.success("Report confirmed — attendance updated.");
      setConfirmReasonTargetId(null);
      setConfirmReason("");
      setConfirmServerMessage(null);
      router.refresh();
    });
  }

  function reject() {
    if (!rejectTargetId) return;
    if (!reviewNote.trim()) {
      toast.error("A review note is required.");
      return;
    }
    startTransition(async () => {
      const result = await rejectAbsenceReport(companyId, projectId, rejectTargetId, { reviewNote });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Report rejected.");
      setRejectTargetId(null);
      setReviewNote("");
      router.refresh();
    });
  }

  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground">No self-reported absences for this day.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {reports.map((report) => (
        <Card key={report.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">
                {report.employee.first_name} {report.employee.last_name} — {ABSENCE_REPORT_REASON_LABELS[report.reason]}
              </span>
              <span className="text-xs text-muted-foreground">Reported by employee{report.comment ? ` — “${report.comment}”` : ""}</span>
              {report.status !== "pending" && report.review_note && <span className="text-xs text-muted-foreground">Management: {report.review_note}</span>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusBadgeVariant(report.status)}>{ABSENCE_REPORT_STATUS_LABELS[report.status]}</Badge>
              {canManage && report.status === "pending" && (
                <>
                  <Button type="button" size="sm" onClick={() => confirm(report.id)} disabled={isPending}>
                    Confirm
                  </Button>
                  <Dialog
                    open={confirmReasonTargetId === report.id}
                    onOpenChange={(open) => {
                      if (!open) {
                        setConfirmReasonTargetId(null);
                        setConfirmReason("");
                        setConfirmServerMessage(null);
                      }
                    }}
                  >
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Reason required</DialogTitle>
                      </DialogHeader>
                      <div className="flex flex-col gap-1.5">
                        {confirmServerMessage && <p className="text-sm text-destructive">{confirmServerMessage}</p>}
                        <Label htmlFor="confirm-reason">Reason</Label>
                        <Input id="confirm-reason" value={confirmReason} onChange={(event) => setConfirmReason(event.target.value)} maxLength={2000} aria-invalid={!confirmReason.trim()} />
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setConfirmReasonTargetId(null)}>
                          Cancel
                        </Button>
                        <Button type="button" disabled={isPending || !confirmReason.trim()} onClick={() => confirm(report.id, confirmReason)}>
                          Confirm
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={rejectTargetId === report.id} onOpenChange={(open) => (open ? setRejectTargetId(report.id) : setRejectTargetId(null))}>
                    <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>Reject</DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Reject absence report</DialogTitle>
                      </DialogHeader>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="reject-note">Review note</Label>
                        <Textarea id="reject-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} rows={3} />
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setRejectTargetId(null)}>
                          Cancel
                        </Button>
                        <Button type="button" variant="destructive" onClick={reject} disabled={isPending}>
                          Reject
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
