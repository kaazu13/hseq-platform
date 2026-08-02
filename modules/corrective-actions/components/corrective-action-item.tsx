"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Pencil } from "lucide-react";
import { closeCorrectiveAction, rejectCorrectiveAction, reopenCorrectiveAction, updateCorrectiveActionProgress } from "@/modules/corrective-actions/actions";
import { canCloseCorrectiveAction, canUpdateCorrectiveActionProgress } from "@/modules/corrective-actions/permissions";
import { CORRECTIVE_ACTION_STATUS_LABELS, type CorrectiveActionDetail, type BasicEmployee } from "@/modules/corrective-actions/types";
import type { RoleName } from "@/modules/organizations/types";
import { CorrectiveActionStatusBadge } from "@/modules/corrective-actions/components/corrective-action-status-badge";
import { CorrectiveActionPriorityBadge } from "@/modules/corrective-actions/components/corrective-action-priority-badge";
import { CorrectiveActionFormDialog } from "@/modules/corrective-actions/components/corrective-action-form-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PROGRESS_STATUSES = ["open", "in_progress", "awaiting_verification"] as const;
type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

type CorrectiveActionItemProps = {
  organizationId: string;
  observationId: string;
  projectId: string;
  action: CorrectiveActionDetail;
  candidates: BasicEmployee[];
  canManageDetails: boolean;
  /** Raw context this item computes its OWN canUpdateProgress/canClose from — those two depend on whether THIS action is assigned to/authored by the current user, which varies per action and can't be precomputed once for the whole list (see modules/corrective-actions/permissions.ts). */
  roleNames: RoleName[];
  isProjectManager: boolean;
  hasProjectAccess: boolean;
  currentUserProfileId: string;
};

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** One corrective action's card — description, responsible person, badges, and every control this milestone requires: progress advance, close, reject, reopen. Every write goes through the exact Server Function the database's validate_corrective_action_update()/can_close_corrective_action() were designed to back — see modules/corrective-actions/permissions.ts's header comment. */
export function CorrectiveActionItem({
  organizationId,
  observationId,
  projectId,
  action,
  candidates,
  canManageDetails,
  roleNames,
  isProjectManager,
  hasProjectAccess,
  currentUserProfileId,
}: CorrectiveActionItemProps) {
  const router = useRouter();
  const isAssignee = action.responsiblePerson?.profile_id === currentUserProfileId;
  const isOwnEntry = action.created_by === currentUserProfileId || isAssignee;
  const canUpdateProgress = canUpdateCorrectiveActionProgress(roleNames, isProjectManager, hasProjectAccess, isAssignee);
  const canClose = canCloseCorrectiveAction(roleNames, isProjectManager, isOwnEntry);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [progressStatus, setProgressStatus] = useState<ProgressStatus>(
    PROGRESS_STATUSES.includes(action.status as ProgressStatus) ? (action.status as ProgressStatus) : "open",
  );
  const [completionNotes, setCompletionNotes] = useState(action.completion_notes ?? "");
  const [closureEvidence, setClosureEvidence] = useState("");
  const [reasonDialog, setReasonDialog] = useState<"reject" | "reopen" | null>(null);
  const [reason, setReason] = useState("");
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  function runAction(fn: () => Promise<{ ok: boolean; error?: { message: string } }>, onDone?: () => void) {
    setFormError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setFormError(result.error?.message ?? "Something went wrong.");
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  function handleUpdateProgress() {
    runAction(() =>
      updateCorrectiveActionProgress(organizationId, action.id, observationId, projectId, action.responsible_person_id, {
        status: progressStatus,
        completionNotes,
      }),
    );
  }

  function handleClose() {
    runAction(
      () => closeCorrectiveAction(organizationId, action.id, observationId, projectId, action.created_by, action.responsible_person_id, { closureEvidence }),
      () => setCloseConfirmOpen(false),
    );
  }

  function handleReasonSubmit() {
    const kind = reasonDialog;
    runAction(
      () =>
        kind === "reject"
          ? rejectCorrectiveAction(organizationId, action.id, observationId, projectId, action.created_by, action.responsible_person_id, { reason })
          : reopenCorrectiveAction(organizationId, action.id, observationId, projectId, action.created_by, action.responsible_person_id, { reason }),
      () => {
        setReasonDialog(null);
        setReason("");
      },
    );
  }

  const isTerminal = action.status === "closed" || action.status === "rejected";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4">
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-start justify-between gap-3">
          <p className="text-sm">{action.description}</p>
          {canManageDetails && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditOpen(true)} className="print:hidden">
              <Pencil />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <CorrectiveActionStatusBadge dueDate={action.due_date} status={action.status} />
          <CorrectiveActionPriorityBadge priority={action.priority} />
          <span>Due {formatDate(action.due_date)}</span>
          <span>· {action.responsiblePerson ? `${action.responsiblePerson.first_name} ${action.responsiblePerson.last_name}` : "Unassigned"}</span>
        </div>

        {action.completion_notes && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Completion notes: </span>
            {action.completion_notes}
          </p>
        )}
        {action.closure_evidence && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Closure evidence: </span>
            {action.closure_evidence}
          </p>
        )}
        {action.reopen_reason && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{action.status === "rejected" ? "Rejection reason: " : "Reopen reason: "}</span>
            {action.reopen_reason}
          </p>
        )}

        {canUpdateProgress && !isTerminal && (
          <div className="flex flex-wrap items-end gap-2 border-t pt-3 print:hidden">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`progress-${action.id}`} className="text-xs">
                Status
              </Label>
              <Select value={progressStatus} onValueChange={(value) => setProgressStatus(value as ProgressStatus)}>
                <SelectTrigger id={`progress-${action.id}`} size="sm" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROGRESS_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CORRECTIVE_ACTION_STATUS_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor={`notes-${action.id}`} className="text-xs">
                Completion notes
              </Label>
              <Textarea id={`notes-${action.id}`} rows={1} value={completionNotes} onChange={(event) => setCompletionNotes(event.target.value)} />
            </div>
            <Button type="button" size="sm" disabled={isPending} onClick={handleUpdateProgress}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              Update
            </Button>
          </div>
        )}

        {canClose && action.status === "awaiting_verification" && (
          <div className="flex items-center gap-2 border-t pt-3 print:hidden">
            <Button type="button" size="sm" disabled={isPending} onClick={() => setCloseConfirmOpen(true)}>
              Close (verified)
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setReasonDialog("reject")}>
              Reject
            </Button>
          </div>
        )}

        {canClose && isTerminal && (
          <div className="border-t pt-3 print:hidden">
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setReasonDialog("reopen")}>
              Reopen
            </Button>
          </div>
        )}
      </CardContent>

      {canManageDetails && (
        <CorrectiveActionFormDialog
          organizationId={organizationId}
          observationId={observationId}
          projectId={projectId}
          candidates={candidates}
          action={action}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      <AlertDialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this action?</AlertDialogTitle>
            <AlertDialogDescription>Confirms the completed work has been verified.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`evidence-${action.id}`} className="text-xs">
              Closure evidence (optional)
            </Label>
            <Textarea id={`evidence-${action.id}`} rows={2} value={closureEvidence} onChange={(event) => setClosureEvidence(event.target.value)} />
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setCloseConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={isPending} onClick={handleClose}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              Confirm close
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reasonDialog !== null} onOpenChange={(open) => !open && setReasonDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{reasonDialog === "reject" ? "Reject this action?" : "Reopen this action?"}</AlertDialogTitle>
            <AlertDialogDescription>A reason is required.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`reason-${action.id}`} className="text-xs">
              Reason
            </Label>
            <Textarea id={`reason-${action.id}`} rows={2} required value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setReasonDialog(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={isPending || !reason.trim()} onClick={handleReasonSubmit}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              {reasonDialog === "reject" ? "Confirm reject" : "Confirm reopen"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
