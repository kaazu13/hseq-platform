"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bulkApplyWorkedHours } from "@/modules/worked-hours/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BulkApplyHoursBarProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  employeeIds: string[];
};

/** Phase D's "Apply [10.0] hours to all" bulk action — creates/updates every listed employee's hours as DRAFT in one call; already-SUBMITTED rows are left untouched by the database itself. Individual exceptions are then a normal per-row edit below. */
export function BulkApplyHoursBar({ companyId, projectId, workDate, employeeIds }: BulkApplyHoursBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hours, setHours] = useState("8.0");

  function handleApply() {
    startTransition(async () => {
      const result = await bulkApplyWorkedHours(companyId, projectId, workDate, { hours, employeeIds });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Applied ${hours}h to ${employeeIds.length} ${employeeIds.length === 1 ? "employee" : "employees"}.`);
      router.refresh();
    });
  }

  if (employeeIds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bulkHours" className="text-xs">
          Apply hours to all ({employeeIds.length})
        </Label>
        <Input id="bulkHours" type="number" step="0.5" min="0" max="24" value={hours} onChange={(event) => setHours(event.target.value)} className="w-24" />
      </div>
      <Button size="sm" disabled={isPending} onClick={handleApply}>
        {isPending ? "Applying…" : "Apply to all"}
      </Button>
      <p className="text-xs text-muted-foreground">Then adjust individual exceptions below.</p>
    </div>
  );
}
