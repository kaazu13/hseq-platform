"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarRange, CheckCircle2, Copy, UserX } from "lucide-react";
import { copyDailyTeams } from "@/modules/daily-workforce/actions";
import type { CopyDailyTeamsResult } from "@/modules/daily-workforce/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function shiftDate(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  // 31 is copyDailyTeamsSchema's own max — this loop can never run away.
  for (let i = 0; i < 31 && cursor <= to; i++) {
    dates.push(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return dates;
}

type CopyTeamsDialogProps = {
  companyId: string;
  projectId: string;
  /** The currently-viewed (empty) date — pre-fills both "copy to" ends, since that's why this dialog was opened. */
  destinationWorkDate: string;
};

/**
 * "Copy Teams" / "Use Previous Teams" (items 6-10) — only ever offered
 * when the currently-viewed date has zero teams (see the page's own empty
 * state). Source defaults to the previous calendar day (the common "just
 * repeat yesterday" case); destination defaults to a single day (the
 * viewed date) but can be widened into a range. Every destination date is
 * independently re-validated server-side (copy_daily_teams_to_date) — this
 * dialog never assumes availability, it only reports what the server
 * actually did.
 */
export function CopyTeamsDialog({ companyId, projectId, destinationWorkDate }: CopyTeamsDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [sourceDate, setSourceDate] = useState(shiftDate(destinationWorkDate, -1));
  const [destinationFrom, setDestinationFrom] = useState(destinationWorkDate);
  const [destinationTo, setDestinationTo] = useState(destinationWorkDate);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CopyDailyTeamsResult[] | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setError(null);
      setResults(null);
    }
  }

  function handleCopy() {
    setError(null);
    const destinationWorkDates = dateRange(destinationFrom, destinationTo);
    startTransition(async () => {
      const result = await copyDailyTeams(companyId, projectId, { sourceWorkDate: sourceDate, destinationWorkDates });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setResults(result.data);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Copy />
        Copy Teams
      </Button>
      <DialogContent className="max-w-lg">
        {results ? (
          <>
            <DialogHeader>
              <DialogTitle>Teams copied</DialogTitle>
              <DialogDescription>From {formatDate(sourceDate)}.</DialogDescription>
            </DialogHeader>
            <div className="flex max-h-96 flex-col gap-4 overflow-y-auto">
              {results.map((result) => (
                <div key={result.destinationWorkDate} className="flex flex-col gap-2 rounded-lg border p-3">
                  <span className="text-sm font-semibold">{formatDate(result.destinationWorkDate)}</span>
                  {result.skippedExisting ? (
                    <span className="text-sm text-muted-foreground">Already has teams — skipped, nothing was changed.</span>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                          {result.teamsCreated} {result.teamsCreated === 1 ? "team" : "teams"} created
                        </span>
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                          {result.workersAssigned} {result.workersAssigned === 1 ? "worker" : "workers"} assigned
                        </span>
                      </div>
                      {(result.workersSkippedUnavailable > 0 || result.workersSkippedAlreadyAssigned > 0) && (
                        <div className="flex flex-col gap-1 text-sm text-amber-700 dark:text-amber-400">
                          {result.workersSkippedUnavailable > 0 && (
                            <span className="flex items-center gap-1.5">
                              <UserX className="size-3.5" />
                              {result.workersSkippedUnavailable} {result.workersSkippedUnavailable === 1 ? "worker" : "workers"} skipped — unavailable
                            </span>
                          )}
                          {result.workersSkippedAlreadyAssigned > 0 && (
                            <span className="flex items-center gap-1.5">
                              <UserX className="size-3.5" />
                              {result.workersSkippedAlreadyAssigned} {result.workersSkippedAlreadyAssigned === 1 ? "worker" : "workers"} skipped — already assigned
                            </span>
                          )}
                          <ul className="ml-5 list-disc text-xs text-muted-foreground">
                            {result.skippedWorkerDetails.map((worker, index) => (
                              <li key={`${worker.employeeId}-${index}`}>
                                {worker.name} ({worker.teamName}) — {worker.reason === "unavailable" ? `unavailable${worker.attendanceStatus ? ` (${worker.attendanceStatus})` : ""}` : worker.reason === "already_assigned" ? "already assigned" : worker.detail || "skipped"}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.teamsRequiringAttention > 0 && (
                        <div className="flex flex-col gap-1 text-sm text-red-700 dark:text-red-400">
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle className="size-3.5" />
                            {result.teamsRequiringAttention} {result.teamsRequiringAttention === 1 ? "team requires" : "teams require"} attention — Foreman unavailable
                          </span>
                          <ul className="ml-5 list-disc text-xs text-muted-foreground">
                            {result.attentionTeamDetails.map((team, index) => (
                              <li key={`${team.foremanEmployeeId}-${index}`}>
                                {team.sourceTeamName} — {team.foremanName} is unavailable on this date
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Copy Teams</DialogTitle>
              <DialogDescription>Copy a day&apos;s Foreman/team/worker structure onto one or more new dates. Every worker is re-validated against the destination date — unavailable people are skipped, never assigned blindly.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <CalendarRange className="size-4 text-muted-foreground" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="copyTeamsSource" className="text-xs">
                    Copy from
                  </Label>
                  <Input id="copyTeamsSource" type="date" value={sourceDate} onChange={(event) => setSourceDate(event.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="copyTeamsTo" className="text-xs">
                    Copy to
                  </Label>
                  <Input
                    id="copyTeamsTo"
                    type="date"
                    value={destinationFrom}
                    onChange={(event) => {
                      setDestinationFrom(event.target.value);
                      if (event.target.value > destinationTo) setDestinationTo(event.target.value);
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="copyTeamsToEnd" className="text-xs">
                    Through (optional range)
                  </Label>
                  <Input id="copyTeamsToEnd" type="date" min={destinationFrom} value={destinationTo} onChange={(event) => setDestinationTo(event.target.value)} />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="button" onClick={handleCopy} disabled={isPending || !sourceDate || !destinationFrom || !destinationTo || sourceDate === destinationFrom}>
                {isPending ? "Copying…" : "Copy Teams"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
