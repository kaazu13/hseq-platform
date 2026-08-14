"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, PackageX, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { markEquipmentDamaged, markEquipmentLost, recoverEquipment } from "@/modules/equipment/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type EquipmentStatusAction = "damage" | "lost" | "recover";

const ACTION_CONFIG: Record<EquipmentStatusAction, { label: string; icon: typeof AlertTriangle; title: string; description: string; noteRequired: boolean; noteLabel: string; confirmLabel: string; variant: "destructive" | "outline" }> = {
  damage: {
    label: "Mark Damaged",
    icon: AlertTriangle,
    title: "Mark equipment damaged",
    description: "The item is removed from available stock and flagged out of service until inspected/repaired.",
    noteRequired: true,
    noteLabel: "Reason",
    confirmLabel: "Mark damaged",
    variant: "destructive",
  },
  lost: {
    label: "Mark Lost",
    icon: PackageX,
    title: "Mark equipment lost",
    description: "The last holder and full history are preserved — this only changes the item's status and removes it from available stock.",
    noteRequired: true,
    noteLabel: "Reason",
    confirmLabel: "Mark lost",
    variant: "destructive",
  },
  recover: {
    label: "Recover",
    icon: RotateCcw,
    title: "Recover equipment",
    description: "Bring a lost or out-of-service item back into available stock, with a permanent audit note.",
    noteRequired: false,
    noteLabel: "Note",
    confirmLabel: "Recover",
    variant: "outline",
  },
};

type EquipmentStatusActionDialogProps = {
  companyId: string;
  projectId: string;
  itemId: string;
  itemName: string;
  action: EquipmentStatusAction;
  maxQuantity: number;
  trackingMode: "serialized" | "quantity";
};

/** Item 8 — Mark Damaged/Mark Lost, plus the deliberate audited Recover path back. One shared dialog since all three are "item + quantity + note" transitions with the same shape, just different endpoints/copy. */
export function EquipmentStatusActionDialog({ companyId, projectId, itemId, itemName, action, maxQuantity, trackingMode }: EquipmentStatusActionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(String(trackingMode === "serialized" ? 1 : maxQuantity));
  const [note, setNote] = useState("");

  const config = ACTION_CONFIG[action];
  const Icon = config.icon;

  function handleSubmit() {
    if (config.noteRequired && !note.trim()) {
      setError("A reason is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result =
        action === "damage"
          ? await markEquipmentDamaged(companyId, projectId, itemId, { quantity: Number(quantity), note })
          : action === "lost"
            ? await markEquipmentLost(companyId, projectId, itemId, { quantity: Number(quantity), note })
            : await recoverEquipment(companyId, projectId, itemId, { quantity: Number(quantity), note: note || undefined });

      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(`${itemName}: ${config.confirmLabel.toLowerCase()}.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Icon />
        {config.label}
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {trackingMode === "quantity" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status-action-quantity">Quantity (of {maxQuantity})</Label>
              <Input id="status-action-quantity" type="number" min={1} max={maxQuantity} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status-action-note">{config.noteLabel}</Label>
            <Textarea id="status-action-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} required={config.noteRequired} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" variant={config.variant} onClick={handleSubmit} disabled={isPending || (config.noteRequired && !note.trim())}>
            {isPending ? "Saving…" : config.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
