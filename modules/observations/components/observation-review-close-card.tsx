"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { closeObservation, reviewObservation } from "@/modules/observations/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ObservationReviewCloseCardProps = {
  companyId: string;
  observationId: string;
  reviewedAt: string | null;
  /** From modules/corrective-actions/types.ts's hasUnresolvedCorrectiveActions() — proactively disables Close and explains why, rather than only surfacing the database's rejection after the fact. The database (validate_safety_observation_update()) remains the actual authority; this is UX only. */
  hasUnresolvedActions: boolean;
};

/**
 * HSE-Manager-only review/close — only rendered by the detail page when
 * canReviewOrCloseObservation() is true. Closing is blocked by
 * validate_safety_observation_update() while any corrective action is
 * unresolved; that raised exception's message is still shown directly in
 * the error alert if it somehow gets past the proactive `hasUnresolvedActions`
 * disable (e.g. a concurrent action was raised after this page loaded).
 */
export function ObservationReviewCloseCard({ companyId, observationId, reviewedAt, hasUnresolvedActions }: ObservationReviewCloseCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleReview() {
    setFormError(null);
    startTransition(async () => {
      const result = await reviewObservation(companyId, observationId);
      if (!result.ok) {
        setFormError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function handleClose() {
    setFormError(null);
    startTransition(async () => {
      const result = await closeObservation(companyId, observationId);
      if (!result.ok) {
        setFormError(result.error.message);
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review and close</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" disabled={isPending || Boolean(reviewedAt)} onClick={handleReview}>
            {isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {reviewedAt ? "Reviewed" : "Mark reviewed"}
          </Button>
          <Button type="button" disabled={isPending || hasUnresolvedActions} onClick={() => setConfirmOpen(true)}>
            Close observation
          </Button>
        </div>
        {hasUnresolvedActions && (
          <p className="text-sm text-muted-foreground">Closing is blocked while a corrective action is still open, in progress, or awaiting verification.</p>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this observation?</AlertDialogTitle>
            <AlertDialogDescription>
              This is terminal — a closed observation cannot be edited again. Closing is blocked if any corrective action raised from it is still
              open, in progress, or awaiting verification.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={isPending} onClick={handleClose}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              {isPending ? "Closing…" : "Confirm close"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
