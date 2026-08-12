"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelLeaveRequest } from "@/modules/leave-requests/actions";
import { Button } from "@/components/ui/button";

/** Requesting employee (or a manager) cancels a pending/returned/still-upcoming approved request (Phase 8). */
export function CancelLeaveButton({ companyId, projectId, leaveRequestId }: { companyId: string; projectId: string; leaveRequestId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function cancel() {
    startTransition(async () => {
      const result = await cancelLeaveRequest(companyId, projectId, leaveRequestId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Leave request cancelled.");
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={isPending}>
      Cancel
    </Button>
  );
}
