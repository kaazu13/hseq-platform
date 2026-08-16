"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import { finalizeInspection } from "@/modules/scaffolds/actions";
import { SCAFFOLD_INSPECTION_OUTCOMES, SCAFFOLD_INSPECTION_OUTCOME_LABELS, type ScaffoldInspectionOutcome } from "@/modules/scaffolds/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type InspectionFinalizeCardProps = {
  companyId: string;
  inspectionId: string;
  scaffoldId: string;
  projectId: string;
  hasUnresolvedDefects: boolean;
};

/**
 * Review-and-finalize workflow — only rendered when the caller can manage
 * this inspection AND it's still a draft. Every finalization rule
 * (restrictions required, zero unresolved defects for safe_for_use,
 * expiry computation) lives in validate_scaffold_inspection_update() in
 * the migration, not here — this proactively disables the "safe for use"
 * option when defects are unresolved (same UX-convenience-not-authority
 * pattern as modules/observations/components/observation-review-close-card.tsx),
 * but the database is what actually enforces it.
 */
export function InspectionFinalizeCard({ companyId, inspectionId, scaffoldId, projectId, hasUnresolvedDefects }: InspectionFinalizeCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ScaffoldInspectionOutcome>("safe_for_use");
  const [restrictionsNotes, setRestrictionsNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleFinalize() {
    setFormError(null);
    startTransition(async () => {
      const result = await finalizeInspection(companyId, inspectionId, scaffoldId, projectId, { outcome, restrictionsNotes });
      if (!result.ok) {
        setFormError(result.error.message);
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
      // Completion pass, Part 2: return to the Scaffold Inspections list
      // (not stay on the just-finalized detail page) — a finalized
      // inspection is terminal, so there is nothing further to do here.
      const listPath = `/companies/${companyId}/projects/${projectId}/scaffold-inspections`;
      toast.success("Inspection finalized successfully.", {
        action: { label: "View inspection", onClick: () => router.push(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}/inspections/${inspectionId}`) },
      });
      router.push(listPath);
    });
  }

  const canPickSafeForUse = !hasUnresolvedDefects;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review and finalize</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="outcome">Outcome</Label>
          <Select value={outcome} onValueChange={(value) => setOutcome(value as ScaffoldInspectionOutcome)}>
            <SelectTrigger id="outcome" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCAFFOLD_INSPECTION_OUTCOMES.map((value) => (
                <SelectItem key={value} value={value} disabled={value === "safe_for_use" && !canPickSafeForUse}>
                  {SCAFFOLD_INSPECTION_OUTCOME_LABELS[value]}
                  {value === "safe_for_use" && !canPickSafeForUse ? " (blocked — unresolved defects)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasUnresolvedDefects && <p className="text-sm text-muted-foreground">This inspection has unresolved defects — it cannot be finalized as &quot;safe for use&quot; until they are closed or rejected.</p>}
        </div>

        {outcome === "safe_with_restrictions" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="restrictionsNotes">Restrictions</Label>
            <Textarea id="restrictionsNotes" rows={3} required value={restrictionsNotes} onChange={(event) => setRestrictionsNotes(event.target.value)} />
          </div>
        )}

        <div>
          <Button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={isPending || (outcome === "safe_for_use" && !canPickSafeForUse) || (outcome === "safe_with_restrictions" && !restrictionsNotes.trim())}
          >
            Review and finalize
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize this inspection?</AlertDialogTitle>
            <AlertDialogDescription>
              This is terminal — a finalized inspection cannot be edited again except through a correction that references it. Outcome: {SCAFFOLD_INSPECTION_OUTCOME_LABELS[outcome]}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={isPending} onClick={handleFinalize}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              {isPending ? "Finalizing…" : "Confirm finalize"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
