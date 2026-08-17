"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { acceptAttendanceReview, rejectAttendanceReview } from "@/modules/attendance-review/actions";
import { DAILY_ATTENDANCE_STATUS_LABELS, DAILY_ATTENDANCE_STATUSES } from "@/modules/daily-workforce/types";
import type { AttendanceReviewRequestWithEmployee } from "@/modules/attendance-review/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function formatDisplayDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

type ReviewQueueProps = {
  companyId: string;
  projectId: string;
  requests: AttendanceReviewRequestWithEmployee[];
};

/** Reviewer-facing pending-request queue — Task 3 Part 19. Only ever rendered by the page for an authorized reviewer (project_manager/operations_manager/company_admin/platform_super_admin); requests are already RLS-scoped to what this caller may see regardless. */
export function ReviewQueue({ companyId, projectId, requests }: ReviewQueueProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [acceptTargetId, setAcceptTargetId] = useState<string | null>(null);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [correctedStatus, setCorrectedStatus] = useState<string>("present");
  const [reviewNote, setReviewNote] = useState("");
  const [reason, setReason] = useState("");
  const [needsReason, setNeedsReason] = useState(false);

  function accept() {
    if (!acceptTargetId) return;
    startTransition(async () => {
      const result = await acceptAttendanceReview(companyId, projectId, acceptTargetId, { correctedStatus, reviewNote, reason: reason || undefined });
      if (!result.ok) {
        if (result.error.message.toLowerCase().includes("reason is required")) {
          setNeedsReason(true);
          toast.error(result.error.message);
          return;
        }
        toast.error(result.error.message);
        return;
      }
      toast.success("Review accepted — attendance corrected.");
      setAcceptTargetId(null);
      setReviewNote("");
      setReason("");
      setNeedsReason(false);
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
      const result = await rejectAttendanceReview(companyId, projectId, rejectTargetId, { reviewNote });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Review rejected.");
      setRejectTargetId(null);
      setReviewNote("");
      router.refresh();
    });
  }

  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending review requests.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {requests.map((request) => (
        <Card key={request.id}>
          <CardContent className="flex flex-wrap items-start justify-between gap-3 pt-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">
                {request.employee.first_name} {request.employee.last_name} — {formatDisplayDate(request.work_date)}
              </span>
              <span className="text-sm text-muted-foreground">{request.explanation}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" size="sm" onClick={() => setAcceptTargetId(request.id)} disabled={isPending}>
                Accept
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setRejectTargetId(request.id)} disabled={isPending}>
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog
        open={acceptTargetId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAcceptTargetId(null);
            setNeedsReason(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept review — correct the record</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="corrected-status">Corrected status</Label>
              <Select value={correctedStatus} onValueChange={(value) => setCorrectedStatus(value ?? "present")}>
                <SelectTrigger id="corrected-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAILY_ATTENDANCE_STATUSES.filter((status) => status !== "not_set").map((status) => (
                    <SelectItem key={status} value={status}>
                      {DAILY_ATTENDANCE_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accept-note">Review note</Label>
              <Textarea id="accept-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={3} maxLength={2000} />
            </div>
            {needsReason && (
              <div className="flex flex-col gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <Label htmlFor="accept-reason">Reason (this will zero out already-submitted worked hours)</Label>
                <Textarea id="accept-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={2000} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAcceptTargetId(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={isPending || !reviewNote.trim() || (needsReason && !reason.trim())} onClick={accept}>
              Accept & correct
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectTargetId !== null} onOpenChange={(open) => !open && setRejectTargetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject review request</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reject-note">Review note</Label>
            <Textarea id="reject-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={3} maxLength={2000} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectTargetId(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={isPending || !reviewNote.trim()} onClick={reject}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
