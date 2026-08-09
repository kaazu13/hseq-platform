"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { voidInspection } from "@/modules/scaffolds/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type InspectionVoidCardProps = {
  companyId: string;
  scaffoldId: string;
  projectId: string;
  inspectionId: string;
};

/**
 * Voids a mistaken/abandoned DRAFT inspection — this table's soft-delete
 * path (no DELETE grant exists; see void_scaffold_inspection() in the
 * migration). Only rendered by the draft workspace when the caller can
 * manage this inspection. Terminal and one-way, same as finalizing — a
 * voided draft stays visible in the scaffold's inspection history,
 * clearly marked, never removed.
 */
export function InspectionVoidCard({ companyId, scaffoldId, projectId, inspectionId }: InspectionVoidCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  function handleVoid() {
    setFormError(null);
    startTransition(async () => {
      const result = await voidInspection(companyId, inspectionId, scaffoldId, projectId, { voidReason });
      if (!result.ok) {
        setFormError(result.error.message);
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
      router.push(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}/inspections/${inspectionId}`);
    });
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Void this draft</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <p className="text-sm text-muted-foreground">
          For a mistaken or abandoned draft — a scaffold inspected under the wrong record, or a check that was started and no longer needed. This is terminal: a voided draft cannot be edited or finalized, and stays visible in the
          inspection history, clearly marked.
        </p>
        <div>
          <Button type="button" variant="outline" className="text-destructive hover:text-destructive" disabled={isPending} onClick={() => setConfirmOpen(true)}>
            Void this draft
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this draft inspection?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone — a reason is required and becomes part of the permanent record.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="voidReason" className="text-xs">
              Reason
            </Label>
            <Textarea id="voidReason" rows={3} required value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={isPending || !voidReason.trim()} onClick={handleVoid}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              {isPending ? "Voiding…" : "Confirm void"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
