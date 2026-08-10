"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { upsertWorkedHours } from "@/modules/worked-hours/actions";
import type { WorkedHours } from "@/modules/worked-hours/types";
import type { BasicEmployee } from "@/modules/daily-workforce/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type WorkedHoursRowProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  employee: BasicEmployee;
  workedHours: WorkedHours | null;
  canManage: boolean;
};

/**
 * One employee's hours-entry row for a day — a plain number input, saved
 * individually. If the existing row is already SUBMITTED and the entered
 * value differs, a reason field appears and is required before Save is
 * enabled (validate server-side too, inside upsert_worked_hours()) —
 * "Do not silently overwrite submitted hours."
 */
export function WorkedHoursRow({ companyId, projectId, workDate, employee, workedHours, canManage }: WorkedHoursRowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hours, setHours] = useState(workedHours ? String(workedHours.hours) : "");
  const [note, setNote] = useState(workedHours?.note ?? "");
  const [reason, setReason] = useState("");

  const isSubmitted = workedHours?.status === "submitted";
  const hasChanged = hours !== (workedHours ? String(workedHours.hours) : "");
  const needsReason = isSubmitted && hasChanged;

  function handleSave() {
    startTransition(async () => {
      const result = await upsertWorkedHours(companyId, projectId, employee.id, workDate, { hours, note: note || undefined, reason: needsReason ? reason : undefined });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Hours saved.");
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {employee.first_name} {employee.last_name}
        </span>
        {workedHours && <Badge variant={isSubmitted ? "default" : "secondary"}>{isSubmitted ? "Submitted" : "Draft"}</Badge>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          step="0.5"
          min="0"
          max="24"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          disabled={!canManage || isPending}
          className="w-24"
          aria-label={`Hours for ${employee.first_name} ${employee.last_name}`}
        />
        <span className="text-sm text-muted-foreground">h</span>
        {canManage && (
          <Button size="sm" variant="outline" disabled={isPending || !hours || (needsReason && !reason.trim())} onClick={handleSave}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>

      {canManage && (
        <Input placeholder="Note (optional)" value={note} onChange={(event) => setNote(event.target.value)} disabled={isPending} className="text-sm" />
      )}

      {needsReason && (
        <div className="flex flex-col gap-1">
          <Textarea
            placeholder="Reason for correcting already-submitted hours (required)"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={!reason.trim()}
          />
        </div>
      )}
    </div>
  );
}
