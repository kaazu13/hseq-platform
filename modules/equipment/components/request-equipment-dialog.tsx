"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { submitEquipmentRequest } from "@/modules/equipment/actions";
import { EquipmentItemCombobox, toEquipmentItemOptions, type EquipmentItemOption } from "@/modules/equipment/components/equipment-item-combobox";
import type { EquipmentItem } from "@/modules/equipment/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type RequestEquipmentDialogProps = {
  companyId: string;
  projectId: string;
  candidateItems: EquipmentItem[];
  trigger?: React.ReactNode;
};

/**
 * Item 9 — "Request Equipment" quick action. Deliberately simple: pick
 * from the catalog (or describe something not yet in it), size/spec,
 * quantity, reason. Always submits for the CALLER'S OWN employee record
 * (resolved server-side by submitEquipmentRequest — this form never sends
 * an employee id at all) and always in the caller's active project
 * context, never a picker.
 */
export function RequestEquipmentDialog({ companyId, projectId, candidateItems, trigger }: RequestEquipmentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const itemOptions = toEquipmentItemOptions(candidateItems);
  const [itemId, setItemId] = useState<string | null>(null);
  const [customDescription, setCustomDescription] = useState("");
  const [specification, setSpecification] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");

  const selectedItem: EquipmentItemOption | undefined = itemOptions.find((option) => option.value === itemId);

  function handleSubmit() {
    const itemDescription = selectedItem?.label ?? customDescription.trim();
    if (!itemDescription) {
      setError("Select an item or describe what you need.");
      return;
    }
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitEquipmentRequest(companyId, projectId, {
        equipmentItemId: itemId ?? undefined,
        itemDescription,
        specification: specification || undefined,
        quantity: Number(quantity),
        reason,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success("Equipment request submitted.");
      setOpen(false);
      setItemId(null);
      setCustomDescription("");
      setSpecification("");
      setQuantity("1");
      setReason("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          (trigger as React.ReactElement) ?? (
            <Button variant="outline" className="h-auto flex-col gap-1.5 py-4">
              <PackagePlus className="size-5" />
              <span className="text-sm">Request Equipment</span>
            </Button>
          )
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Equipment</DialogTitle>
          <DialogDescription>Your project management team will review this request.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Equipment / Item</Label>
            <EquipmentItemCombobox value={itemId} onValueChange={setItemId} options={itemOptions} placeholder="Search the catalog…" />
          </div>

          {!itemId && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="request-custom-item">Or describe what you need</Label>
              <Input id="request-custom-item" value={customDescription} onChange={(event) => setCustomDescription(event.target.value)} placeholder="Not in the catalog above" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="request-spec">Size / specification</Label>
              <Input id="request-spec" value={specification} onChange={(event) => setSpecification(event.target.value)} placeholder="e.g. Size 9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="request-quantity">Quantity</Label>
              <Input id="request-quantity" type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="request-reason">Reason</Label>
            <Textarea id="request-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Existing pair worn out" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Submitting…" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
