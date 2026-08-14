"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { approveEquipmentRequest, denyEquipmentRequest, returnEquipmentRequestForChanges } from "@/modules/equipment/actions";
import type { EquipmentRequestWithDetail, EquipmentItem } from "@/modules/equipment/types";
import { EQUIPMENT_REQUEST_STATUS_LABELS, equipmentRequestStatusTone } from "@/modules/equipment/types";
import type { EmployeeOption } from "@/modules/employees/employee-options";
import { IssueEquipmentDialog } from "@/modules/equipment/components/issue-equipment-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function DecisionCommentDialog({ title, description, confirmLabel, onConfirm }: { title: string; description: string; confirmLabel: string; onConfirm: (comment: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    if (!comment.trim()) {
      setError("A comment is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      await onConfirm(comment);
      setOpen(false);
      setComment("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {title}
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="decision-comment">Comment</Label>
          <Textarea id="decision-comment" rows={3} value={comment} onChange={(event) => setComment(event.target.value)} required />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isPending || !comment.trim()}>
            {isPending ? "Saving…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type EquipmentRequestsReviewProps = {
  companyId: string;
  projectId: string;
  requests: EquipmentRequestWithDetail[];
  candidateItems: EquipmentItem[];
  employees: EmployeeOption[];
};

/** Item 11 — Management request review: employee, item, size/spec, quantity, reason, status, with Approve/Deny/Return actions. Approving does NOT physically issue anything — a separate explicit "Issue" step (which fulfills the request atomically) keeps the states explicit and auditable, per the task's preferred flow. */
export function EquipmentRequestsReview({ companyId, projectId, requests, candidateItems, employees }: EquipmentRequestsReviewProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleApprove(requestId: string) {
    startTransition(async () => {
      const result = await approveEquipmentRequest(companyId, projectId, requestId, { comment: undefined });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Request approved.");
      router.refresh();
    });
  }

  if (requests.length === 0) {
    return <EmptyState icon={ClipboardList} title="No equipment requests" description="Employee equipment requests for this project will appear here." className="flex-1" />;
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((request) => (
        <Card key={request.id}>
          <CardContent className="flex flex-col gap-3 pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold">
                  {request.item_description}
                  {request.specification ? ` — ${request.specification}` : ""}
                </span>
                <span className="text-sm text-muted-foreground">
                  {request.employee.first_name} {request.employee.last_name} · Qty {request.quantity} · {formatDateTime(request.created_at)}
                </span>
                <span className="text-sm">{request.reason}</span>
                {request.decision_comment && <span className="text-xs text-muted-foreground">Comment: {request.decision_comment}</span>}
              </div>
              <StatusBadge tone={equipmentRequestStatusTone(request.status)}>{EQUIPMENT_REQUEST_STATUS_LABELS[request.status]}</StatusBadge>
            </div>

            {request.status === "pending" && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Button type="button" size="sm" onClick={() => handleApprove(request.id)}>
                  <Check />
                  Approve
                </Button>
                <DecisionCommentDialog
                  title="Deny request"
                  description="A reason is required and will be shown to the employee."
                  confirmLabel="Deny"
                  onConfirm={async (comment) => {
                    const result = await denyEquipmentRequest(companyId, projectId, request.id, { comment });
                    if (!result.ok) toast.error(result.error.message);
                    else {
                      toast.success("Request denied.");
                      router.refresh();
                    }
                  }}
                />
                <DecisionCommentDialog
                  title="Return for changes"
                  description="Let the employee know what to change — they'll see this comment."
                  confirmLabel="Return for changes"
                  onConfirm={async (comment) => {
                    const result = await returnEquipmentRequestForChanges(companyId, projectId, request.id, { comment });
                    if (!result.ok) toast.error(result.error.message);
                    else {
                      toast.success("Request returned for changes.");
                      router.refresh();
                    }
                  }}
                />
              </div>
            )}

            {request.status === "approved" && (
              <div className="flex items-center gap-2 border-t pt-3">
                <IssueEquipmentDialog
                  companyId={companyId}
                  projectId={projectId}
                  items={candidateItems}
                  employees={employees}
                  fulfillRequest={{ id: request.id, equipmentItemId: request.equipment_item_id, employeeId: request.employee_id, quantity: request.quantity }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
