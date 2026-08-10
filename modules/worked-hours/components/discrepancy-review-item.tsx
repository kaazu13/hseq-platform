"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resolveWorkedHoursDiscrepancy } from "@/modules/worked-hours/actions";
import type { WorkedHoursDiscrepancy, WorkedHours } from "@/modules/worked-hours/types";
import type { BasicEmployee } from "@/modules/daily-workforce/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type DiscrepancyReviewItemProps = {
  companyId: string;
  projectId: string;
  discrepancy: WorkedHoursDiscrepancy;
  employee: BasicEmployee;
  workedHours: WorkedHours;
};

/** One open discrepancy in the PM/Admin review queue — accept (optionally correcting hours) or reject, with a required resolution note. */
export function DiscrepancyReviewItem({ companyId, projectId, discrepancy, employee, workedHours }: DiscrepancyReviewItemProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resolutionNote, setResolutionNote] = useState("");
  const [resultingHours, setResultingHours] = useState(String(workedHours.hours));

  function resolve(status: "accepted" | "rejected") {
    startTransition(async () => {
      const result = await resolveWorkedHoursDiscrepancy(companyId, projectId, discrepancy.id, {
        status,
        resolutionNote,
        resultingHours: status === "accepted" ? resultingHours : undefined,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(status === "accepted" ? "Discrepancy accepted." : "Discrepancy rejected.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">
            {employee.first_name} {employee.last_name} — {workedHours.work_date}
          </span>
          <span className="text-sm text-muted-foreground">Currently {workedHours.hours}h</span>
        </div>
        <p className="text-sm">{discrepancy.comment}</p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`resultingHours-${discrepancy.id}`} className="text-xs">
              Corrected hours (if accepting)
            </Label>
            <Input id={`resultingHours-${discrepancy.id}`} type="number" step="0.5" min="0" max="24" value={resultingHours} onChange={(event) => setResultingHours(event.target.value)} className="w-28" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`resolutionNote-${discrepancy.id}`} className="text-xs">
            Resolution note (required)
          </Label>
          <Textarea id={`resolutionNote-${discrepancy.id}`} rows={2} value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} />
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" disabled={isPending || !resolutionNote.trim()} onClick={() => resolve("accepted")}>
            Accept
          </Button>
          <Button size="sm" variant="outline" disabled={isPending || !resolutionNote.trim()} onClick={() => resolve("rejected")}>
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
