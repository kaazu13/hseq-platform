"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { approveRateRequest, rejectRateRequest } from "@/modules/rate-requests/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

type Action = "approve" | "reject" | null;

/** Part 7 — the approval modal shows the RESULTING rate (pre-filled from the requested rate, but editable — a reviewer may approve a different amount than what was asked), an effective-from date, and an optional decision note. Rejection requires a reason. */
export function RateRequestDecisionControls({ companyId, requestId, requestedRate, currency, todayDate }: { companyId: string; requestId: string; requestedRate: number | null; currency: string; todayDate: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<Action>(null);
  const [approvedRate, setApprovedRate] = useState(requestedRate != null ? String(requestedRate) : "");
  const [effectiveFrom, setEffectiveFrom] = useState(todayDate);
  const [decisionReason, setDecisionReason] = useState("");

  function submitApprove() {
    const rate = Number(approvedRate);
    if (!Number.isFinite(rate) || rate < 0) {
      toast.error("Enter a valid rate.");
      return;
    }
    startTransition(async () => {
      const result = await approveRateRequest(companyId, requestId, { approvedRate: rate, effectiveFrom, decisionReason: decisionReason.trim() || undefined });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Rate request approved.");
      setActiveAction(null);
      router.refresh();
    });
  }

  function submitReject() {
    if (!decisionReason.trim()) {
      toast.error("A decision reason is required.");
      return;
    }
    startTransition(async () => {
      const result = await rejectRateRequest(companyId, requestId, decisionReason);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Rate request rejected.");
      setActiveAction(null);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Dialog open={activeAction !== null} onOpenChange={(open) => !open && setActiveAction(null)}>
        <DialogTrigger render={<Button type="button" size="sm" onClick={() => setActiveAction("approve")} />}>Approve</DialogTrigger>
        <DialogTrigger render={<Button type="button" size="sm" variant="destructive" onClick={() => setActiveAction("reject")} />}>Reject</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeAction === "approve" ? "Approve rate request" : "Reject rate request"}</DialogTitle>
          </DialogHeader>
          {activeAction === "approve" ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="approved-rate">Resulting hourly rate ({currency})</Label>
                <Input id="approved-rate" type="number" step="0.01" min="0" value={approvedRate} onChange={(event) => setApprovedRate(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="effective-from">Effective from</Label>
                <Input id="effective-from" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="decision-note">Decision note (optional)</Label>
                <Textarea id="decision-note" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} rows={2} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reject-reason">Decision reason (required)</Label>
              <Textarea id="reject-reason" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} rows={3} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActiveAction(null)}>
              Cancel
            </Button>
            <Button type="button" variant={activeAction === "reject" ? "destructive" : "default"} onClick={activeAction === "approve" ? submitApprove : submitReject} disabled={isPending}>
              {activeAction === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
