"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { approveLeaveRequest, denyLeaveRequest, returnLeaveRequest } from "@/modules/leave-requests/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

type Action = "deny" | "return" | null;

/** Manager Approve / Deny(reason required) / Return for Changes(comment required) — Phase 8-9. */
export function LeaveRequestDecisionControls({ companyId, projectId, leaveRequestId }: { companyId: string; projectId: string; leaveRequestId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<Action>(null);
  const [comment, setComment] = useState("");

  function approve() {
    startTransition(async () => {
      const result = await approveLeaveRequest(companyId, projectId, leaveRequestId, { comment: undefined });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Leave approved.");
      router.refresh();
    });
  }

  function submitAction() {
    if (!comment.trim()) {
      toast.error("A comment is required.");
      return;
    }
    startTransition(async () => {
      const result = activeAction === "deny" ? await denyLeaveRequest(companyId, projectId, leaveRequestId, { comment }) : await returnLeaveRequest(companyId, projectId, leaveRequestId, { comment });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(activeAction === "deny" ? "Leave denied." : "Returned for changes.");
      setActiveAction(null);
      setComment("");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" onClick={approve} disabled={isPending}>
        Approve
      </Button>
      <Dialog open={activeAction !== null} onOpenChange={(open) => !open && setActiveAction(null)}>
        <DialogTrigger render={<Button type="button" size="sm" variant="outline" onClick={() => setActiveAction("return")} />}>Return</DialogTrigger>
        <DialogTrigger render={<Button type="button" size="sm" variant="destructive" onClick={() => setActiveAction("deny")} />}>Deny</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeAction === "deny" ? "Deny leave request" : "Return for changes"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="decision-comment">Comment</Label>
            <Textarea id="decision-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActiveAction(null)}>
              Cancel
            </Button>
            <Button type="button" variant={activeAction === "deny" ? "destructive" : "default"} onClick={submitAction} disabled={isPending}>
              {activeAction === "deny" ? "Deny" : "Return"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
