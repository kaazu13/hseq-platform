"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitWorkedHours } from "@/modules/worked-hours/actions";
import { Button } from "@/components/ui/button";

type SubmitWorkedHoursButtonProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  draftCount: number;
};

/** Phase D's explicit "do not require hours to be submitted at the exact moment teams are locked" — a deliberate, separate action. */
export function SubmitWorkedHoursButton({ companyId, projectId, workDate, draftCount }: SubmitWorkedHoursButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (draftCount === 0) return null;

  function handleSubmit() {
    startTransition(async () => {
      const result = await submitWorkedHours(companyId, projectId, workDate);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Worked hours submitted.");
      router.refresh();
    });
  }

  return (
    <Button size="sm" disabled={isPending} onClick={handleSubmit}>
      {isPending ? "Submitting…" : `Submit ${draftCount} draft ${draftCount === 1 ? "entry" : "entries"}`}
    </Button>
  );
}
