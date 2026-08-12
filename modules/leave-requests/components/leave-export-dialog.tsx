"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthIsoDate(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

/** "[ Export ]" for Holiday/Leave (Phase 10) — a plain date-range export, not Day/Week/Month (leave spans arbitrary ranges by nature). */
export function LeaveExportDialog({ companyId, projectId }: { companyId: string; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState(firstOfMonthIsoDate());
  const [toDate, setToDate] = useState(todayIsoDate());

  const exportHref = `/companies/${companyId}/projects/${projectId}/leave/export?from=${fromDate}&to=${toDate}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Download />
        Export
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Holiday / Leave</DialogTitle>
          <DialogDescription>Choose a date range.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="leave-export-from">From</Label>
            <Input id="leave-export-from" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="leave-export-to">To</Label>
            <Input id="leave-export-to" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button nativeButton={false} disabled={toDate < fromDate} render={<a href={exportHref} onClick={() => setOpen(false)} />}>
            <Download />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
