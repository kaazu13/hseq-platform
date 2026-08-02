"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { startInspectionCorrection } from "@/modules/scaffolds/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type InspectionCorrectionCardProps = {
  organizationId: string;
  scaffoldId: string;
  projectId: string;
  inspectionId: string;
};

/**
 * Starts a correction to a finalized, not-yet-superseded inspection —
 * only rendered by the detail page when the caller can manage this
 * inspection and it hasn't already been superseded. The original is
 * NEVER edited (docs' "correction of a finalized record is a new linked
 * record, not an edit" principle) — this creates a new draft inspection
 * referencing it; finalizing THAT is what actually links the two records
 * together (see finalize_scaffold_inspection() in the migration).
 */
export function InspectionCorrectionCard({ organizationId, scaffoldId, projectId, inspectionId }: InspectionCorrectionCardProps) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");

  function handleStart() {
    setFormError(null);
    startTransition(async () => {
      const result = await startInspectionCorrection(organizationId, scaffoldId, projectId, inspectionId, { correctionReason });
      if (!result.ok) {
        setFormError(result.error.message);
        setConfirmOpen(false);
      }
      // On success this redirects to the new correction's edit page — no
      // further action needed here.
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Correct this inspection</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <p className="text-sm text-muted-foreground">
          This finalized inspection is immutable — it cannot be edited directly. A correction creates a new linked inspection; this original stays fully intact and visible, marked as superseded once the correction is
          finalized.
        </p>
        <div>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => setConfirmOpen(true)}>
            Start a correction
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a correction?</AlertDialogTitle>
            <AlertDialogDescription>A reason is required — it becomes part of the permanent record alongside both the original and the correction.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="correctionReason" className="text-xs">
              Reason
            </Label>
            <Textarea id="correctionReason" rows={3} required value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} />
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={isPending || !correctionReason.trim()} onClick={handleStart}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              {isPending ? "Starting…" : "Start correction"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
