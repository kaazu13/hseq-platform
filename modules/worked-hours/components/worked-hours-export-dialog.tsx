"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { resolveWorkedHoursPeriod, formatWorkedHoursPeriodLabel, type WorkedHoursPeriodMode } from "@/modules/worked-hours/period";
import { WORKED_HOURS_EMPLOYEE_SCOPES, WORKED_HOURS_EMPLOYEE_SCOPE_LABELS, type WorkedHoursEmployeeScope } from "@/modules/worked-hours/types";
import type { EmployeeOption } from "@/modules/employees/employee-options";
import { EmployeeMultiSelect } from "@/components/shared/employee-multi-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PERIOD_MODE_LABELS: Record<WorkedHoursPeriodMode, string> = { day: "Day", week: "Week", month: "Month" };
const PERIOD_MODES: WorkedHoursPeriodMode[] = ["day", "week", "month"];

type WorkedHoursExportDialogProps = {
  companyId: string;
  projectId: string;
  defaultMode: WorkedHoursPeriodMode;
  /** Any date within the desired period — day: the exact date; week: any date in the target week; month: any date in the target month. */
  defaultDate: string;
  rosterCandidates: EmployeeOption[];
};

/**
 * "[ Export ]" — the single entry point for every Worked Hours Excel
 * export (Phases 5-8): period mode (Day/Week/Month), a live-resolved
 * period preview (so "any date in the week" visibly resolves to its actual
 * Monday-Sunday range before download), and employee scope (all project
 * workers / hours-only / a searchable selection). Builds a plain GET
 * download link — the export Route Handler re-validates and re-resolves
 * everything server-side regardless of what's sent here.
 */
export function WorkedHoursExportDialog({ companyId, projectId, defaultMode, defaultDate, rosterCandidates }: WorkedHoursExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WorkedHoursPeriodMode>(defaultMode);
  const [date, setDate] = useState(defaultMode === "month" ? defaultDate.slice(0, 7) : defaultDate);
  const [scope, setScope] = useState<WorkedHoursEmployeeScope>("hours_only");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const resolvedDate = mode === "month" ? `${date || defaultDate.slice(0, 7)}-01` : date || defaultDate;
  const period = useMemo(() => resolveWorkedHoursPeriod(mode, resolvedDate), [mode, resolvedDate]);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ mode, date: resolvedDate, scope });
    if (scope === "selected") params.set("employeeIds", selectedIds.join(","));
    return `/companies/${companyId}/projects/${projectId}/worked-hours/export?${params.toString()}`;
  }, [companyId, projectId, mode, resolvedDate, scope, selectedIds]);

  const canDownload = scope !== "selected" || selectedIds.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Download />
        Export
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Worked Hours</DialogTitle>
          <DialogDescription>Download a formatted spreadsheet for a day, week, or month.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="export-mode">Period</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as WorkedHoursPeriodMode)}>
                <SelectTrigger id="export-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_MODES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {PERIOD_MODE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="export-date">{mode === "month" ? "Month" : "Date"}</Label>
              <Input id="export-date" type={mode === "month" ? "month" : "date"} value={mode === "month" ? date || defaultDate.slice(0, 7) : date} onChange={(event) => setDate(event.target.value)} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">Period: {formatWorkedHoursPeriodLabel(period)}</p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="export-scope">Employees</Label>
            <Select value={scope} onValueChange={(value) => setScope(value as WorkedHoursEmployeeScope)}>
              <SelectTrigger id="export-scope" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKED_HOURS_EMPLOYEE_SCOPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {WORKED_HOURS_EMPLOYEE_SCOPE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {scope === "selected" && (
            <div className="flex flex-col gap-1.5">
              <Label>Employees to export</Label>
              <EmployeeMultiSelect options={rosterCandidates} selectedIds={selectedIds} onChange={setSelectedIds} placeholder="Search employee…" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            nativeButton={false}
            disabled={!canDownload}
            render={<a href={canDownload ? exportHref : undefined} onClick={() => setOpen(false)} />}
          >
            <Download />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
