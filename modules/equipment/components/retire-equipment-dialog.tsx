"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { toast } from "sonner";
import { retireEquipmentItem } from "@/modules/equipment/actions";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Item 4 — retire/archive instead of hard delete. Refused server-side while an active assignment exists. */
export function RetireEquipmentDialog({ companyId, projectId, itemId, itemName }: { companyId: string; projectId: string; itemId: string; itemName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await retireEquipmentItem(companyId, projectId, itemId, { note: note || undefined });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(`${itemName} retired.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Archive />
        Retire
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retire {itemName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This archives the item — it stays visible in history but can no longer be issued. Refused while it still has an active assignment; return it first.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="retire-note" className="text-xs">
            Note (optional)
          </Label>
          <Textarea id="retire-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={isPending} onClick={handleConfirm}>
            {isPending ? "Retiring…" : "Retire"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
