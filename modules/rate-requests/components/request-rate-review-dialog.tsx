"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitRateRequest } from "@/modules/rate-requests/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

/** Part 5 — supports BOTH "I want a specific rate" and "please just review my rate" (amount left blank) in the same form, per the task's own explicit recommendation. Never touches the actual rate — only ever creates a pending request row. */
export function RequestRateReviewDialog({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [requestedRate, setRequestedRate] = useState("");
  const [reason, setReason] = useState("");

  function submit() {
    const parsedRate = requestedRate.trim() ? Number(requestedRate) : undefined;
    if (parsedRate !== undefined && (!Number.isFinite(parsedRate) || parsedRate < 0)) {
      toast.error("Enter a valid, non-negative rate, or leave it blank.");
      return;
    }
    startTransition(async () => {
      const result = await submitRateRequest(companyId, { requestedRate: parsedRate, reason: reason.trim() || undefined });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Your rate review request has been sent.");
      setOpen(false);
      setRequestedRate("");
      setReason("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>Request rate review</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request rate review</DialogTitle>
          <DialogDescription>This does not change your rate — it sends a request for company_admin/planner to review.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="requested-rate">Requested rate per hour (optional)</Label>
            <Input id="requested-rate" type="number" step="0.01" min="0" placeholder="Leave blank to just request a review" value={requestedRate} onChange={(event) => setRequestedRate(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Reason / comment</Label>
            <Textarea id="reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={2000} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={isPending}>
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
