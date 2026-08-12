"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { resolveWorkedHoursPeriod, formatWorkedHoursPeriodLabel, type WorkedHoursPeriodMode } from "@/modules/worked-hours/period";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PERIOD_MODE_LABELS: Record<WorkedHoursPeriodMode, string> = { day: "Day", week: "Week", month: "Month" };
const PERIOD_MODES: WorkedHoursPeriodMode[] = ["day", "week", "month"];

/** "[ Export ]" for Absences (Phase 6) — same Day/Week(Mon-Sun)/Month period picker as Worked Hours, reusing the same generic period resolver. */
export function AbsenceExportDialog({ companyId, projectId, defaultDate }: { companyId: string; projectId: string; defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WorkedHoursPeriodMode>("day");
  const [date, setDate] = useState(defaultDate);

  const resolvedDate = mode === "month" ? `${date.slice(0, 7) || defaultDate.slice(0, 7)}-01` : date || defaultDate;
  const period = useMemo(() => resolveWorkedHoursPeriod(mode, resolvedDate), [mode, resolvedDate]);
  const exportHref = `/companies/${companyId}/projects/${projectId}/absences/export?mode=${mode}&date=${resolvedDate}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Download />
        Export
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Absences</DialogTitle>
          <DialogDescription>Download a formatted spreadsheet for a day, week, or month.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="absence-export-mode">Period</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as WorkedHoursPeriodMode)}>
              <SelectTrigger id="absence-export-mode" className="w-full">
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
            <Label htmlFor="absence-export-date">{mode === "month" ? "Month" : "Date"}</Label>
            <Input id="absence-export-date" type={mode === "month" ? "month" : "date"} value={mode === "month" ? date.slice(0, 7) : date} onChange={(event) => setDate(event.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Period: {formatWorkedHoursPeriodLabel(period)}</p>
        <DialogFooter>
          <Button nativeButton={false} render={<a href={exportHref} onClick={() => setOpen(false)} />}>
            <Download />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
