"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useWorkedHoursRow } from "@/modules/worked-hours/use-worked-hours-row";
import { WORKED_HOURS_CATEGORIES, WORKED_HOURS_CATEGORY_LABELS, WORKED_HOURS_MAX, type WorkedHoursWithEmployee } from "@/modules/worked-hours/types";
import type { BasicEmployee } from "@/modules/daily-workforce/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Row = { employee: BasicEmployee; workedHours: WorkedHoursWithEmployee | null; disabledReason?: string; correctionCount?: number };

/**
 * Item 2's mobile concept — "Karl Andersson  10.0h  Submitted" collapsed,
 * tap to expand the 5 category inputs + note + save. Never the full
 * table squeezed onto a phone. `md:hidden` — WorkedHoursTable is the
 * desktop equivalent.
 */
export function WorkedHoursMobileList({ companyId, projectId, workDate, rows, canManage }: { companyId: string; projectId: string; workDate: string; rows: Row[]; canManage: boolean }) {
  return (
    <div className="flex flex-col divide-y rounded-lg border md:hidden">
      {rows.map((row) => (
        <WorkedHoursMobileRow key={row.employee.id} companyId={companyId} projectId={projectId} workDate={workDate} row={row} canManage={canManage} />
      ))}
    </div>
  );
}

function WorkedHoursMobileRow({ companyId, projectId, workDate, row, canManage }: { companyId: string; projectId: string; workDate: string; row: Row; canManage: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const { values, setCategory, note, setNote, needsReason, reason, setReason, isSubmitted, total, overCap, isPending, save } = useWorkedHoursRow(
    companyId,
    projectId,
    workDate,
    row.employee.id,
    row.workedHours,
  );
  const disabled = Boolean(row.disabledReason);

  return (
    <div className="flex flex-col">
      <button type="button" onClick={() => setExpanded((prev) => !prev)} className="flex items-center justify-between gap-2 p-3 text-left">
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
          <span className="truncate text-sm font-medium">
            {row.employee.first_name} {row.employee.last_name}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn("text-sm font-semibold", overCap && "text-destructive")}>{total.toFixed(1)}h</span>
          {row.workedHours ? <Badge variant={isSubmitted ? "default" : "secondary"}>{isSubmitted ? "Submitted" : "Draft"}</Badge> : <Badge variant="outline">Missing</Badge>}
          {Boolean(row.correctionCount) && (
            <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
              Corrected{row.correctionCount! > 1 ? ` (${row.correctionCount})` : ""}
            </Badge>
          )}
        </div>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t bg-muted/20 p-3">
          {disabled ? (
            <p className="text-sm text-muted-foreground">{row.disabledReason}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {WORKED_HOURS_CATEGORIES.map((category) => (
                  <div key={category} className="flex flex-col gap-1">
                    <Label htmlFor={`${row.employee.id}-mobile-${category}`} className="text-xs text-muted-foreground">
                      {WORKED_HOURS_CATEGORY_LABELS[category]}
                    </Label>
                    <Input
                      id={`${row.employee.id}-mobile-${category}`}
                      type="number"
                      step="0.5"
                      min="0"
                      max="24"
                      value={values[category]}
                      onChange={(event) => setCategory(category, event.target.value)}
                      disabled={!canManage || isPending}
                    />
                  </div>
                ))}
              </div>
              <div className="text-sm font-semibold">
                TOTAL {total.toFixed(1)} / {WORKED_HOURS_MAX.toFixed(1)}h
              </div>
              {overCap && <p className="text-xs text-destructive">Total cannot exceed 24.0 hours.</p>}
              {canManage && (
                <>
                  <Input placeholder="Note (optional)" value={note} onChange={(event) => setNote(event.target.value)} />
                  {needsReason && <Input placeholder="Reason (required)" value={reason} onChange={(event) => setReason(event.target.value)} aria-invalid={!reason.trim()} />}
                  <Button size="sm" disabled={isPending || overCap || (needsReason && !reason.trim())} onClick={save}>
                    Save
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
