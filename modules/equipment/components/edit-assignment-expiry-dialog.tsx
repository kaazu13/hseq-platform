"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { updateEquipmentAssignmentExpiry } from "@/modules/equipment/actions";
import type { EquipmentAssignment } from "@/modules/equipment/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type EditAssignmentExpiryDialogProps = {
  companyId: string;
  projectId: string;
  assignment: Pick<EquipmentAssignment, "id" | "expires_at">;
  itemName: string;
};

/**
 * Part 7 — adjust an already-issued assignment's effective expiry:
 * override it, or clear it (leave the date field blank) where allowed.
 * Never touches the item's default_validity_days, and never rewrites
 * expires_at on any OTHER assignment — this is scoped to exactly the one
 * issuance the manager opened it from.
 */
export function EditAssignmentExpiryDialog({ companyId, projectId, assignment, itemName }: EditAssignmentExpiryDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(assignment.expires_at ?? "");
  const [reason, setReason] = useState("");

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await updateEquipmentAssignmentExpiry(companyId, projectId, assignment.id, { expiresAt, reason: reason || undefined });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success("Expiry updated.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarClock />
        Expiry
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust expiry — {itemName}</DialogTitle>
          <DialogDescription>Leave the date blank to remove the expiry for this issuance. This only affects this one assignment.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assignment-expires-at">Expiry date</Label>
            <Input id="assignment-expires-at" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assignment-expiry-reason">Reason (optional)</Label>
            <Textarea id="assignment-expiry-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Re-certified after inspection" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving…" : "Save expiry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
