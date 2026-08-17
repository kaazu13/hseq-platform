"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requestAttendanceReview } from "@/modules/attendance-review/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type RequestReviewButtonProps = {
  companyId: string;
  projectId: string;
  workDate: string;
};

/** Employee "[ Request review ]" on My Hours' Absences tab — Task 3 Part 19. Only rendered when there's no already-pending request for this day (the page itself decides that). */
export function RequestReviewButton({ companyId, projectId, workDate }: RequestReviewButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await requestAttendanceReview(companyId, projectId, workDate, { explanation });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success("Review request submitted.");
      setOpen(false);
      setExplanation("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Request review</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a review</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="review-explanation">Why is this record wrong?</Label>
          <Textarea id="review-explanation" value={explanation} onChange={(event) => setExplanation(event.target.value)} rows={4} maxLength={2000} aria-invalid={Boolean(error)} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={isPending || !explanation.trim()} onClick={submit}>
            {isPending ? "Submitting…" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
