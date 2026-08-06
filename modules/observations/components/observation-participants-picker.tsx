"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { updateObservationParticipants } from "@/modules/observations/actions";
import type { BasicEmployee } from "@/modules/observations/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type ObservationParticipantsPickerProps = {
  companyId: string;
  observationId: string;
  projectId: string;
  createdBy: string | null;
  candidates: BasicEmployee[];
  currentParticipantIds: string[];
  readOnly: boolean;
};

/** People involved, optional ("where appropriate") — checkbox picker over the project roster, same convention as modules/lmra/components/lmra-participants-picker.tsx. */
export function ObservationParticipantsPicker({
  companyId,
  observationId,
  projectId,
  createdBy,
  candidates,
  currentParticipantIds,
  readOnly,
}: ObservationParticipantsPickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentParticipantIds));

  function toggle(employeeId: string, checked: boolean) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(employeeId);
      else next.delete(employeeId);
      return next;
    });
  }

  function handleSave() {
    setFormError(null);
    startTransition(async () => {
      const result = await updateObservationParticipants(companyId, observationId, projectId, createdBy, [...selectedIds]);
      if (!result.ok) {
        setFormError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  if (candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">No one is currently rostered onto this project.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {candidates.map((candidate) => (
          <div key={candidate.id} className="flex items-center gap-2">
            <Checkbox
              id={`observation-participant-${candidate.id}`}
              checked={selectedIds.has(candidate.id)}
              disabled={readOnly}
              onCheckedChange={(checked) => toggle(candidate.id, checked === true)}
            />
            <Label htmlFor={`observation-participant-${candidate.id}`} className="font-normal">
              {candidate.first_name} {candidate.last_name}
              {candidate.position_title ? <span className="text-muted-foreground"> — {candidate.position_title}</span> : null}
            </Label>
          </div>
        ))}
      </div>

      {!readOnly && (
        <div>
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : null}
            {isPending ? "Saving…" : "Save people involved"}
          </Button>
        </div>
      )}
    </div>
  );
}
