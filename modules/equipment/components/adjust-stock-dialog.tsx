"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { adjustEquipmentStock } from "@/modules/equipment/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const REASON_PRESETS = ["New delivery", "Damaged stock", "Inventory correction", "Returned to supplier", "Other"] as const;

type AdjustStockDialogProps = {
  companyId: string;
  projectId: string;
  itemId: string;
  itemName: string;
  currentQuantity: number;
  currentAvailable: number;
};

/** Part 26 — the missing manual stock-adjustment UI: signed +/- amount, a REQUIRED reason (preset or free text), and a preview of the resulting total. adjust_equipment_stock() itself refuses a negative result — this dialog just surfaces that clearly before submitting. */
export function AdjustStockDialog({ companyId, projectId, itemId, itemName, currentQuantity, currentAvailable }: AdjustStockDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [amount, setAmount] = useState("1");
  const [reasonPreset, setReasonPreset] = useState<string>(REASON_PRESETS[0]);
  const [reasonNote, setReasonNote] = useState("");

  const parsedAmount = Math.abs(Number(amount) || 0);
  const signedDelta = direction === "increase" ? parsedAmount : -parsedAmount;
  const resultingQuantity = currentQuantity + signedDelta;
  const resultingAvailable = currentAvailable + signedDelta;
  const wouldGoNegative = resultingQuantity < 0 || resultingAvailable < 0;
  const reason = reasonPreset === "Other" ? reasonNote.trim() : reasonPreset;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await adjustEquipmentStock(companyId, projectId, itemId, { delta: signedDelta, reason });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success("Stock adjusted.");
      setOpen(false);
      setAmount("1");
      setReasonNote("");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <PackagePlus />
        Adjust stock
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock — {itemName}</DialogTitle>
          <DialogDescription>Currently {currentQuantity} total, {currentAvailable} available. Record a manual correction — never overwrites the count directly.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(value) => setDirection((value as "increase" | "decrease") ?? "increase")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase">Increase (+)</SelectItem>
                  <SelectItem value="decrease">Decrease (-)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adjust-amount">Amount</Label>
              <Input id="adjust-amount" type="number" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Reason</Label>
            <Select value={reasonPreset} onValueChange={(value) => setReasonPreset(value ?? REASON_PRESETS[0])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_PRESETS.map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {preset}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reasonPreset === "Other" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adjust-reason-note">Describe the reason</Label>
              <Textarea id="adjust-reason-note" rows={2} value={reasonNote} onChange={(event) => setReasonNote(event.target.value)} />
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Resulting total: <span className="font-medium text-foreground">{resultingQuantity}</span> · Resulting available: <span className="font-medium text-foreground">{resultingAvailable}</span>
          </p>
          {wouldGoNegative && <p className="text-sm text-destructive">This would result in negative stock — reduce the amount.</p>}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending || wouldGoNegative || parsedAmount <= 0 || !reason}>
            {isPending ? "Saving…" : "Adjust stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
