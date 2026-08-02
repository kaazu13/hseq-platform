"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { submitLmra } from "@/modules/lmra/actions";
import type { LmraResult } from "@/modules/lmra/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type LmraSubmitCardProps = {
  organizationId: string;
  lmraId: string;
  projectId: string;
};

/**
 * The go/no-go call plus stop-work reason — the last step before a draft
 * becomes "submitted" (docs' explicit requirement: "Require confirmation
 * before submission"). Two-step: pick a result inline, then confirm in a
 * dialog that restates the decision — the actual write only happens from
 * the dialog's Confirm button, never the inline pick alone.
 */
export function LmraSubmitCard({ organizationId, lmraId, projectId }: LmraSubmitCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<LmraResult>("go");
  const [stopWorkReason, setStopWorkReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleConfirm() {
    setFormError(null);
    startTransition(async () => {
      const submitResult = await submitLmra(organizationId, lmraId, projectId, { result, stopWorkReason });
      if (!submitResult.ok) {
        setFormError(submitResult.error.message);
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
        <CardTitle>Submit for review</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>Go / no-go decision</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setResult("go")}
              aria-pressed={result === "go"}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors",
                result === "go" ? "border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "hover:bg-muted/50",
              )}
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              Go
            </button>
            <button
              type="button"
              onClick={() => setResult("no_go")}
              aria-pressed={result === "no_go"}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors",
                result === "no_go" ? "border-destructive bg-destructive/10 text-destructive" : "hover:bg-muted/50",
              )}
            >
              <ShieldX className="size-4" aria-hidden="true" />
              No-go — stop work
            </button>
          </div>
        </div>

        {result === "no_go" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stopWorkReason">Reason for stopping work</Label>
            <Textarea id="stopWorkReason" rows={3} required value={stopWorkReason} onChange={(event) => setStopWorkReason(event.target.value)} />
          </div>
        )}

        <div>
          <Button type="button" onClick={() => setConfirmOpen(true)} disabled={isPending || (result === "no_go" && !stopWorkReason.trim())}>
            Review and submit
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm submission</AlertDialogTitle>
            <AlertDialogDescription>
              {result === "go"
                ? "This LMRA will be submitted with a Go decision and sent for review."
                : "This LMRA will be submitted with a No-go decision and work will be recorded as stopped. It will be sent for review."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={isPending} onClick={handleConfirm}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              {isPending ? "Submitting…" : "Confirm submit"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
