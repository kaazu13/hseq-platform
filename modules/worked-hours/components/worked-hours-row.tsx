"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { upsertWorkedHoursCategories } from "@/modules/worked-hours/actions";
import { WORKED_HOURS_CATEGORIES, WORKED_HOURS_CATEGORY_LABELS, WORKED_HOURS_MAX, type WorkedHoursWithEmployee, type WorkedHoursCategory } from "@/modules/worked-hours/types";
import type { BasicEmployee } from "@/modules/daily-workforce/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type WorkedHoursRowProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  employee: BasicEmployee;
  workedHours: WorkedHoursWithEmployee | null;
  canManage: boolean;
};

const EMPTY_BREAKDOWN: Record<WorkedHoursCategory, number> = { regular: 0, overtime: 0, night: 0, travel: 0, other: 0 };

/**
 * One employee's category hour-entry row for a day (Worked Hours V2,
 * Phase 2) — a field per controlled category, saved together in one
 * atomic call. If the day is already SUBMITTED and any category's value
 * differs from what's stored, a reason field appears and is required
 * before Save is enabled (validated server-side too, inside
 * upsert_worked_hours_categories()) — "Do not silently overwrite
 * submitted hours." The running total is shown live against the 24h cap,
 * matching Phase 1's UI-side usability requirement (the database trigger
 * is the real, always-enforced backstop regardless of this).
 */
export function WorkedHoursRow({ companyId, projectId, workDate, employee, workedHours, canManage }: WorkedHoursRowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initialBreakdown = workedHours?.breakdown ?? EMPTY_BREAKDOWN;
  const [values, setValues] = useState<Record<WorkedHoursCategory, string>>(
    Object.fromEntries(WORKED_HOURS_CATEGORIES.map((category) => [category, String(initialBreakdown[category])])) as Record<WorkedHoursCategory, string>,
  );
  const [note, setNote] = useState(workedHours?.note ?? "");
  const [reason, setReason] = useState("");

  const isSubmitted = workedHours?.status === "submitted";
  const total = useMemo(() => WORKED_HOURS_CATEGORIES.reduce((sum, category) => sum + (Number(values[category]) || 0), 0), [values]);
  const overCap = total > WORKED_HOURS_MAX;
  const hasChanged = WORKED_HOURS_CATEGORIES.some((category) => Number(values[category] || 0) !== initialBreakdown[category]);
  const needsReason = isSubmitted && hasChanged;

  function handleSave() {
    startTransition(async () => {
      const result = await upsertWorkedHoursCategories(companyId, projectId, employee.id, workDate, {
        categories: { regular: values.regular, overtime: values.overtime, night: values.night, travel: values.travel, other: values.other },
        note: note || undefined,
        reason: needsReason ? reason : undefined,
      });
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {WORKED_HOURS_CATEGORIES.map((category) => (
          <div key={category} className="flex flex-col gap-1">
            <Label htmlFor={`${employee.id}-${category}`} className="text-xs text-muted-foreground">
              {WORKED_HOURS_CATEGORY_LABELS[category]}
            </Label>
            <Input
              id={`${employee.id}-${category}`}
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={values[category]}
              onChange={(event) => setValues((prev) => ({ ...prev, [category]: event.target.value }))}
              disabled={!canManage || isPending}
              className="w-full"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t pt-2">
        <span className={cn("text-sm font-semibold", overCap && "text-destructive")}>
          TOTAL {total.toFixed(1)} / {WORKED_HOURS_MAX.toFixed(1)} h
        </span>
        {canManage && (
          <Button size="sm" variant="outline" disabled={isPending || overCap || (needsReason && !reason.trim())} onClick={handleSave}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
      {overCap && <p className="text-xs text-destructive">Total cannot exceed 24.0 hours.</p>}

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
