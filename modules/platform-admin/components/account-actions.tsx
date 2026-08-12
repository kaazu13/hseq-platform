"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { suspendAccount, banAccount, restoreAccount, issuePlatformWarning, revokeUserSessions } from "@/modules/platform-admin/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

type Action = "suspend" | "ban" | "warn" | null;

/** Platform admin per-account controls (Phase 12-13) — every mutation is re-checked server-side by requirePlatformSuperAdmin() + the RPC's own is_platform_super_admin() gate; this component has no independent authority. */
export function AccountActions({ userId, accountStatus }: { userId: string; accountStatus: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<Action>(null);
  const [reason, setReason] = useState("");

  function restore() {
    startTransition(async () => {
      const result = await restoreAccount(userId, { reason: undefined });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Account restored.");
      router.refresh();
    });
  }

  function revokeSessions() {
    startTransition(async () => {
      const result = await revokeUserSessions(userId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Recorded — the account will lose access on its next request while suspended/banned.");
      router.refresh();
    });
  }

  function submitAction() {
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    startTransition(async () => {
      const result =
        activeAction === "ban"
          ? await banAccount(userId, { reason })
          : activeAction === "warn"
            ? await issuePlatformWarning(userId, { reason })
            : await suspendAccount(userId, { reason });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(activeAction === "ban" ? "Account banned." : activeAction === "warn" ? "Warning issued." : "Account suspended.");
      setActiveAction(null);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {accountStatus !== "active" && (
        <Button type="button" size="sm" onClick={restore} disabled={isPending}>
          Restore
        </Button>
      )}
      <Button type="button" size="sm" variant="outline" onClick={revokeSessions} disabled={isPending}>
        Revoke sessions
      </Button>
      <Dialog open={activeAction !== null} onOpenChange={(open) => !open && setActiveAction(null)}>
        <DialogTrigger render={<Button type="button" size="sm" variant="outline" onClick={() => setActiveAction("warn")} />}>Issue warning</DialogTrigger>
        {accountStatus !== "suspended" && <DialogTrigger render={<Button type="button" size="sm" variant="outline" onClick={() => setActiveAction("suspend")} />}>Suspend</DialogTrigger>}
        {accountStatus !== "banned" && <DialogTrigger render={<Button type="button" size="sm" variant="destructive" onClick={() => setActiveAction("ban")} />}>Ban</DialogTrigger>}
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeAction === "ban" ? "Ban account" : activeAction === "warn" ? "Issue platform warning" : "Suspend account"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-action-reason">Reason</Label>
            <Textarea id="account-action-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActiveAction(null)}>
              Cancel
            </Button>
            <Button type="button" variant={activeAction === "ban" ? "destructive" : "default"} onClick={submitAction} disabled={isPending}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
