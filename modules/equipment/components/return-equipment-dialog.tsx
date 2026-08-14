"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { returnEquipment } from "@/modules/equipment/actions";
import { EQUIPMENT_CONDITIONS, EQUIPMENT_CONDITION_LABELS, type EquipmentAssignment, type EquipmentItem } from "@/modules/equipment/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type ReturnEquipmentDialogProps = {
  companyId: string;
  projectId: string;
  assignment: Pick<EquipmentAssignment, "id" | "quantity" | "tracking_mode">;
  itemName: string;
};

/** Item 7 — Return Equipment. Supports partial return for quantity items; a damaged/requires-inspection return never silently restocks (return_equipment() enforces this server-side, this form just surfaces the choice). */
export function ReturnEquipmentDialog({ companyId, projectId, assignment, itemName }: ReturnEquipmentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [returnedQuantity, setReturnedQuantity] = useState(String(assignment.quantity));
  const [condition, setCondition] = useState<string>("good");
  const [returnedAt, setReturnedAt] = useState(todayIso());
  const [note, setNote] = useState("");

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await returnEquipment(companyId, projectId, assignment.id, {
        returnedQuantity: Number(returnedQuantity),
        conditionAtReturn: condition as EquipmentItem["condition"],
        returnedAt,
        note: note || undefined,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success("Equipment returned.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Undo2 />
        Return
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Return {itemName}</DialogTitle>
          <DialogDescription>Record the return — a damaged or inspection-required condition is never added straight back to available stock.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {assignment.tracking_mode === "quantity" && assignment.quantity > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="return-quantity">Returned quantity (of {assignment.quantity})</Label>
              <Input id="return-quantity" type="number" min={1} max={assignment.quantity} value={returnedQuantity} onChange={(event) => setReturnedQuantity(event.target.value)} />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Condition on return</Label>
            <Select value={condition} onValueChange={(value) => setCondition(value ?? "good")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EQUIPMENT_CONDITIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {EQUIPMENT_CONDITION_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="return-date">Returned date</Label>
            <Input id="return-date" type="date" value={returnedAt} onChange={(event) => setReturnedAt(event.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="return-note">Note</Label>
            <Textarea id="return-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Processing…" : "Confirm return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
