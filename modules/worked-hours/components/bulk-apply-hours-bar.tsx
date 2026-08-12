"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bulkApplyWorkedHours } from "@/modules/worked-hours/actions";
import { WORKED_HOURS_CATEGORIES, WORKED_HOURS_CATEGORY_LABELS, type WorkedHoursCategory } from "@/modules/worked-hours/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type BulkApplyHoursBarProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  employeeIds: string[];
};

/** Phase 2's "Apply [10.0] [Regular Hours] to all eligible workers" bulk action — creates/updates every listed employee's chosen category as DRAFT in one call; already-SUBMITTED rows and anyone the 24h/day cap would block are left untouched by the database itself. */
export function BulkApplyHoursBar({ companyId, projectId, workDate, employeeIds }: BulkApplyHoursBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState<WorkedHoursCategory>("regular");
  const [hours, setHours] = useState("8.0");

  function handleApply() {
    startTransition(async () => {
      const result = await bulkApplyWorkedHours(companyId, projectId, workDate, { category, hours, employeeIds });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Applied ${hours}h ${WORKED_HOURS_CATEGORY_LABELS[category]} to ${employeeIds.length} ${employeeIds.length === 1 ? "employee" : "employees"}.`);
      router.refresh();
    });
  }

  if (employeeIds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bulkCategory" className="text-xs">
          Category
        </Label>
        <Select value={category} onValueChange={(value) => setCategory(value as WorkedHoursCategory)}>
          <SelectTrigger id="bulkCategory" size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORKED_HOURS_CATEGORIES.map((value) => (
              <SelectItem key={value} value={value}>
                {WORKED_HOURS_CATEGORY_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bulkHours" className="text-xs">
          Apply to all ({employeeIds.length})
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
