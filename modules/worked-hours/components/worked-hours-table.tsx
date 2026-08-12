"use client";

import { useWorkedHoursRow } from "@/modules/worked-hours/use-worked-hours-row";
import { WORKED_HOURS_CATEGORIES, WORKED_HOURS_CATEGORY_SHORT_LABELS, WORKED_HOURS_MAX, type WorkedHoursWithEmployee } from "@/modules/worked-hours/types";
import type { BasicEmployee } from "@/modules/daily-workforce/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Row = { employee: BasicEmployee; workedHours: WorkedHoursWithEmployee | null; disabledReason?: string };

/**
 * Item 2's desktop concept: a compact, directly-editable table (Employee |
 * Regular | OT | Night | Travel | Other | Total | Status), replacing the
 * previous one-big-card-per-employee grid that became unusable past ~30
 * employees. Hidden below `md` — WorkedHoursMobileRow is the phone
 * equivalent, sharing the same useWorkedHoursRow() save logic.
 */
export function WorkedHoursTable({ companyId, projectId, workDate, rows, canManage }: { companyId: string; projectId: string; workDate: string; rows: Row[]; canManage: boolean }) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border md:block">
      <table className="w-full min-w-max text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="p-2 text-left font-medium">Employee</th>
            {WORKED_HOURS_CATEGORIES.map((category) => (
              <th key={category} className="p-2 text-right font-medium">
                {WORKED_HOURS_CATEGORY_SHORT_LABELS[category]}
              </th>
            ))}
            <th className="p-2 text-right font-medium">Total</th>
            <th className="p-2 text-left font-medium">Status</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <WorkedHoursTableRow key={row.employee.id} companyId={companyId} projectId={projectId} workDate={workDate} row={row} canManage={canManage} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkedHoursTableRow({ companyId, projectId, workDate, row, canManage }: { companyId: string; projectId: string; workDate: string; row: Row; canManage: boolean }) {
  const { values, setCategory, needsReason, reason, setReason, isSubmitted, total, overCap, isPending, save } = useWorkedHoursRow(companyId, projectId, workDate, row.employee.id, row.workedHours);
  const disabled = Boolean(row.disabledReason);

  return (
    <tr className="border-t">
      <td className="p-2">
        <div className="flex flex-col">
          <span className="font-medium">
            {row.employee.first_name} {row.employee.last_name}
          </span>
          {disabled && <span className="text-xs text-muted-foreground">{row.disabledReason}</span>}
        </div>
      </td>
      {WORKED_HOURS_CATEGORIES.map((category) => (
        <td key={category} className="p-2">
          <Input
            type="number"
            step="0.5"
            min="0"
            max="24"
            value={values[category]}
            onChange={(event) => setCategory(category, event.target.value)}
            disabled={!canManage || isPending || disabled}
            className="w-16 text-right"
            aria-label={`${WORKED_HOURS_CATEGORY_SHORT_LABELS[category]} hours for ${row.employee.first_name} ${row.employee.last_name}`}
          />
        </td>
      ))}
      <td className={cn("p-2 text-right font-semibold", overCap && "text-destructive")}>
        {total.toFixed(1)} / {WORKED_HOURS_MAX.toFixed(1)}
      </td>
      <td className="p-2">
        {row.workedHours ? <Badge variant={isSubmitted ? "default" : "secondary"}>{isSubmitted ? "Submitted" : "Draft"}</Badge> : <Badge variant="outline">Missing</Badge>}
      </td>
      <td className="p-2">
        {canManage && !disabled && (
          <div className="flex flex-col items-end gap-1">
            {needsReason && (
              <Input placeholder="Reason (required)" value={reason} onChange={(event) => setReason(event.target.value)} className="w-40" aria-invalid={!reason.trim()} />
            )}
            <Button size="sm" variant="outline" disabled={isPending || overCap || (needsReason && !reason.trim())} onClick={save}>
              Save
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}
