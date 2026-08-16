"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { issueEquipment } from "@/modules/equipment/actions";
import { EQUIPMENT_CONDITIONS, EQUIPMENT_CONDITION_LABELS, type EquipmentItem } from "@/modules/equipment/types";
import { EquipmentItemCombobox, toEquipmentItemOptions, type EquipmentItemOption } from "@/modules/equipment/components/equipment-item-combobox";
import { EmployeeCombobox } from "@/components/shared/employee-combobox";
import type { EmployeeOption } from "@/modules/employees/employee-options";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type IssueEquipmentDialogProps = {
  companyId: string;
  projectId: string;
  items: EquipmentItem[];
  employees: EmployeeOption[];
  /** Pre-fills the item/employee/quantity and, on success, marks this request 'fulfilled' — the "Issue" action from an approved request row. */
  fulfillRequest?: { id: string; equipmentItemId: string | null; employeeId: string; quantity: number };
  trigger?: React.ReactNode;
};

/**
 * Item 5 — Issue Equipment. Server-side validation (availability,
 * employee eligibility, single-active-holder for serialized items) is the
 * real gate; this form is convenience/UX only. When `fulfillRequest` is
 * set, the item/employee/quantity fields are pre-filled and locked (the
 * physical issuance must match what was actually approved) and the
 * request moves straight to "fulfilled" in the same atomic RPC call —
 * "Pending → Approved → Issue Equipment → Fulfilled" (item 11).
 */
export function IssueEquipmentDialog({ companyId, projectId, items, employees, fulfillRequest, trigger }: IssueEquipmentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const itemOptions = toEquipmentItemOptions(items);
  const [itemId, setItemId] = useState<string | null>(fulfillRequest?.equipmentItemId ?? null);
  const [employeeId, setEmployeeId] = useState<string | null>(fulfillRequest?.employeeId ?? null);
  const [quantity, setQuantity] = useState(String(fulfillRequest?.quantity ?? 1));
  const [condition, setCondition] = useState<string>("good");
  const [issuedAt, setIssuedAt] = useState(todayIso());
  const [expectedReturnAt, setExpectedReturnAt] = useState("");
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [useDefaultValidity, setUseDefaultValidity] = useState(true);

  const selectedItem: EquipmentItemOption | undefined = itemOptions.find((option) => option.value === itemId);
  const selectedFullItem = items.find((candidate) => candidate.id === itemId);
  const isLocked = Boolean(fulfillRequest);

  function handleSubmit() {
    if (!itemId || !employeeId) {
      setError("Select an item and an employee.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await issueEquipment(
        companyId,
        projectId,
        itemId,
        {
          employeeId,
          quantity: Number(quantity),
          conditionAtIssue: condition as EquipmentItem["condition"],
          issuedAt,
          expectedReturnAt: expectedReturnAt || undefined,
          note: note || undefined,
          expiresAt: expiresAt || undefined,
          useDefaultValidity,
        },
        fulfillRequest?.id,
      );

      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success("Equipment issued.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <span onClick={() => setOpen(true)} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && setOpen(true)}>
          {trigger}
        </span>
      ) : (
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <PackageCheck />
          Issue Equipment
        </Button>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Issue Equipment</DialogTitle>
          <DialogDescription>{fulfillRequest ? "Issuing to fulfill the approved request." : "Issue an item to an active employee."}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Item</Label>
            <EquipmentItemCombobox value={itemId} onValueChange={isLocked ? () => {} : setItemId} options={itemOptions} disabled={isLocked} />
            {selectedItem && <span className="text-xs text-muted-foreground">{selectedItem.availableQuantity} currently available</span>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Employee</Label>
            <EmployeeCombobox value={employeeId} onValueChange={isLocked ? () => {} : setEmployeeId} options={employees} disabled={isLocked} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-quantity">Quantity</Label>
              <Input id="issue-quantity" type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={isLocked} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Condition at issue</Label>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-date">Issue date</Label>
              <Input id="issue-date" type="date" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-return-date">Expected return (optional)</Label>
              <Input id="issue-return-date" type="date" value={expectedReturnAt} onChange={(event) => setExpectedReturnAt(event.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issue-note">Note</Label>
            <Textarea id="issue-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>

          <div className="flex flex-col gap-2 rounded-md border p-3">
            <Label>Validity / expiry</Label>
            {selectedFullItem?.default_validity_days ? (
              <div className="flex items-start gap-2">
                <Checkbox id="issue-use-default-validity" checked={useDefaultValidity} onCheckedChange={(checked) => setUseDefaultValidity(checked === true)} />
                <Label htmlFor="issue-use-default-validity" className="font-normal">
                  Use this item&apos;s default validity ({selectedFullItem.default_validity_days} days from the issue date)
                </Label>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">This item has no default validity — set an expiry below, or leave blank for none.</p>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-expires-at">{selectedFullItem?.default_validity_days && useDefaultValidity ? "Override expiry (optional)" : "Expiry date (optional)"}</Label>
              <Input id="issue-expires-at" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending || !itemId || !employeeId}>
            {isPending ? "Issuing…" : "Issue Equipment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
