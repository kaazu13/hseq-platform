"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Pencil } from "lucide-react";
import { closeScaffoldDefect, rejectScaffoldDefect, reopenScaffoldDefect, updateScaffoldDefectProgress } from "@/modules/scaffold-defects/actions";
import { canCloseScaffoldDefect, canUpdateScaffoldDefectProgress } from "@/modules/scaffold-defects/permissions";
import { SCAFFOLD_DEFECT_STATUS_LABELS, type ScaffoldDefectDetail } from "@/modules/scaffold-defects/types";
import type { EmployeeOption } from "@/components/shared/employee-combobox";
import type { RoleName } from "@/modules/organizations/types";
import { ScaffoldDefectStatusBadge } from "@/modules/scaffold-defects/components/scaffold-defect-status-badge";
import { ScaffoldDefectSeverityBadge } from "@/modules/scaffold-defects/components/scaffold-defect-severity-badge";
import { ScaffoldDefectFormDialog } from "@/modules/scaffold-defects/components/scaffold-defect-form-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const PROGRESS_STATUSES = ["open", "in_progress", "awaiting_verification"] as const;
type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

type ScaffoldDefectItemProps = {
  organizationId: string;
  inspectionId: string;
  scaffoldId: string;
  projectId: string;
  defect: ScaffoldDefectDetail;
  candidates: EmployeeOption[];
  canManageDetails: boolean;
  roleNames: RoleName[];
  hasProjectAccess: boolean;
  currentUserProfileId: string;
};

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** One scaffold defect's card — mirrors modules/corrective-actions/components/corrective-action-item.tsx exactly, with this domain's field names (immediate_control, verification_notes, verified_by/verified_at). */
export function ScaffoldDefectItem({ organizationId, inspectionId, scaffoldId, projectId, defect, candidates, canManageDetails, roleNames, hasProjectAccess, currentUserProfileId }: ScaffoldDefectItemProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [progressStatus, setProgressStatus] = useState<ProgressStatus>(PROGRESS_STATUSES.includes(defect.status as ProgressStatus) ? (defect.status as ProgressStatus) : "open");
  const [completionNotes, setCompletionNotes] = useState(defect.completion_notes ?? "");
  const [verificationNotes, setVerificationNotes] = useState("");
  const [reasonDialog, setReasonDialog] = useState<"reject" | "reopen" | null>(null);
  const [reason, setReason] = useState("");
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const isAssignee = defect.responsiblePerson?.profile_id === currentUserProfileId;
  const isOwnEntry = defect.created_by === currentUserProfileId || isAssignee;
  const canUpdateProgress = canUpdateScaffoldDefectProgress(roleNames, hasProjectAccess, isAssignee);
  const canClose = canCloseScaffoldDefect(roleNames, hasProjectAccess, isOwnEntry);
  const isTerminal = defect.status === "closed" || defect.status === "rejected";

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
    runAction(() => updateScaffoldDefectProgress(organizationId, defect.id, inspectionId, scaffoldId, projectId, defect.responsible_person_id, { status: progressStatus, completionNotes }));
  }

  function handleClose() {
    runAction(
      () => closeScaffoldDefect(organizationId, defect.id, inspectionId, scaffoldId, projectId, defect.created_by, defect.responsible_person_id, { verificationNotes }),
      () => setCloseConfirmOpen(false),
    );
  }

  function handleReasonSubmit() {
    const kind = reasonDialog;
    runAction(
      () =>
        kind === "reject"
          ? rejectScaffoldDefect(organizationId, defect.id, inspectionId, scaffoldId, projectId, defect.created_by, defect.responsible_person_id, { reason })
          : reopenScaffoldDefect(organizationId, defect.id, inspectionId, scaffoldId, projectId, defect.created_by, defect.responsible_person_id, { reason }),
      () => {
        setReasonDialog(null);
        setReason("");
      },
    );
  }

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
          <p className="text-sm">{defect.description}</p>
          {canManageDetails && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditOpen(true)} className="print:hidden">
              <Pencil />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <ScaffoldDefectStatusBadge dueDate={defect.due_date} status={defect.status} />
          <ScaffoldDefectSeverityBadge severity={defect.severity} />
          <span>Due {formatDate(defect.due_date)}</span>
          <span>· {defect.responsiblePerson ? `${defect.responsiblePerson.first_name} ${defect.responsiblePerson.last_name}` : "Unassigned"}</span>
        </div>

        {defect.immediate_control && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Immediate control: </span>
            {defect.immediate_control}
          </p>
        )}
        {defect.completion_notes && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Completion notes: </span>
            {defect.completion_notes}
          </p>
        )}
        {defect.verification_notes && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Verification notes: </span>
            {defect.verification_notes}
          </p>
        )}
        {defect.reopen_reason && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{defect.status === "rejected" ? "Rejection reason: " : "Reopen reason: "}</span>
            {defect.reopen_reason}
          </p>
        )}

        {canUpdateProgress && !isTerminal && (
          <div className="flex flex-wrap items-end gap-2 border-t pt-3 print:hidden">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`progress-${defect.id}`} className="text-xs">
                Status
              </Label>
              <Select value={progressStatus} onValueChange={(value) => setProgressStatus(value as ProgressStatus)}>
                <SelectTrigger id={`progress-${defect.id}`} size="sm" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROGRESS_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {SCAFFOLD_DEFECT_STATUS_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor={`notes-${defect.id}`} className="text-xs">
                Completion notes
              </Label>
              <Textarea id={`notes-${defect.id}`} rows={1} value={completionNotes} onChange={(event) => setCompletionNotes(event.target.value)} />
            </div>
            <Button type="button" size="sm" disabled={isPending} onClick={handleUpdateProgress}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              Update
            </Button>
          </div>
        )}

        {canClose && defect.status === "awaiting_verification" && (
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
        <ScaffoldDefectFormDialog organizationId={organizationId} inspectionId={inspectionId} scaffoldId={scaffoldId} projectId={projectId} candidates={candidates} defect={defect} open={editOpen} onOpenChange={setEditOpen} />
      )}

      <AlertDialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this defect?</AlertDialogTitle>
            <AlertDialogDescription>Confirms the completed work has been verified.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`verification-${defect.id}`} className="text-xs">
              Verification notes (optional)
            </Label>
            <Textarea id={`verification-${defect.id}`} rows={2} value={verificationNotes} onChange={(event) => setVerificationNotes(event.target.value)} />
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
            <AlertDialogTitle>{reasonDialog === "reject" ? "Reject this defect?" : "Reopen this defect?"}</AlertDialogTitle>
            <AlertDialogDescription>A reason is required.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`reason-${defect.id}`} className="text-xs">
              Reason
            </Label>
            <Textarea id={`reason-${defect.id}`} rows={2} required value={reason} onChange={(event) => setReason(event.target.value)} />
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
