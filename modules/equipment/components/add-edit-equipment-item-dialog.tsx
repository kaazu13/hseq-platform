"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { createEquipmentItem, updateEquipmentItem } from "@/modules/equipment/actions";
import { EQUIPMENT_TRACKING_MODES, EQUIPMENT_TRACKING_MODE_LABELS, EQUIPMENT_CONDITIONS, EQUIPMENT_CONDITION_LABELS, EQUIPMENT_CATEGORY_SUGGESTIONS, type EquipmentItem } from "@/modules/equipment/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type AddEditEquipmentItemDialogProps = {
  companyId: string;
  projectId: string;
  /** When set, this is a company-wide-visible project name label used only for the "allocate to project" toggle description — the item itself may belong to a DIFFERENT project than the one currently being viewed. */
  projectName: string;
  /** Present only when editing an existing item. */
  item?: EquipmentItem;
  /**
   * Part 25 — present only for "Add serialized item from catalog": a
   * source item whose catalog-level fields (name/category/description/
   * manufacturer/model/specification/default validity/price/currency/
   * requestable/ownership) pre-fill the form, leaving reference number
   * (serial), purchase date, condition, and notes blank for THIS new
   * physical unit. Mutually exclusive with `item` — this always creates a
   * new row, it never edits `duplicateFrom`.
   */
  duplicateFrom?: EquipmentItem;
  trigger?: React.ReactNode;
};

/** Item 1/4/15/25 — Add/Edit/Duplicate-as-serialized equipment item. Same dialog for both tracking modes; quantity is fixed to 1 and hidden once "Individually tracked" is chosen. Project allocation is a plain company-wide/this-project toggle (safety_flash's nullable-project_id precedent), never a second full project selector — the ONLY project this dialog ever offers is the caller's own active one, per item 3's "no duplicate project selector" rule. */
export function AddEditEquipmentItemDialog({ companyId, projectId, projectName, item, duplicateFrom, trigger }: AddEditEquipmentItemDialogProps) {
  const router = useRouter();
  const isEdit = Boolean(item);
  const template = item ?? duplicateFrom;
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [trackingMode, setTrackingMode] = useState<string>(duplicateFrom ? "serialized" : (item?.tracking_mode ?? "quantity"));
  const [ownership, setOwnership] = useState<"company" | "project">(template ? (template.project_id ? "project" : "company") : "project");
  const [category, setCategory] = useState(template?.category ?? "");
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [referenceNumber, setReferenceNumber] = useState(isEdit ? (item?.reference_number ?? "") : "");
  const [manufacturer, setManufacturer] = useState(template?.manufacturer ?? "");
  const [model, setModel] = useState(template?.model ?? "");
  const [specification, setSpecification] = useState(template?.specification ?? "");
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [condition, setCondition] = useState(item?.condition ?? "new");
  const [location, setLocation] = useState(template?.location ?? "");
  const [notes, setNotes] = useState(isEdit ? (item?.notes ?? "") : "");
  const [defaultValidityDays, setDefaultValidityDays] = useState(template?.default_validity_days ? String(template.default_validity_days) : "");
  const [unitPrice, setUnitPrice] = useState(template?.unit_price != null ? String(template.unit_price) : "");
  const [currency, setCurrency] = useState(template?.currency ?? "EUR");
  const [requestable, setRequestable] = useState(template?.requestable ?? true);
  const [purchaseDate, setPurchaseDate] = useState(isEdit ? (item?.purchase_date ?? "") : "");

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const targetProjectId = ownership === "project" ? projectId : null;
      const result = isEdit
        ? await updateEquipmentItem(companyId, projectId, item!.id, {
            projectId: targetProjectId,
            category,
            name,
            description: description || undefined,
            referenceNumber: referenceNumber || undefined,
            manufacturer: manufacturer || undefined,
            model: model || undefined,
            specification: specification || undefined,
            location: location || undefined,
            notes: notes || undefined,
            defaultValidityDays: defaultValidityDays ? Number(defaultValidityDays) : undefined,
            unitPrice: unitPrice ? Number(unitPrice) : undefined,
            currency: currency || undefined,
            requestable,
            purchaseDate: purchaseDate || undefined,
          })
        : await createEquipmentItem(companyId, projectId, {
            projectId: targetProjectId,
            trackingMode: trackingMode as "serialized" | "quantity",
            category,
            name,
            description: description || undefined,
            referenceNumber: referenceNumber || undefined,
            manufacturer: manufacturer || undefined,
            model: model || undefined,
            specification: specification || undefined,
            quantity: Number(quantity),
            condition: condition as EquipmentItem["condition"],
            location: location || undefined,
            notes: notes || undefined,
            defaultValidityDays: defaultValidityDays ? Number(defaultValidityDays) : undefined,
            unitPrice: unitPrice ? Number(unitPrice) : undefined,
            currency: currency || undefined,
            requestable,
            purchaseDate: purchaseDate || undefined,
          });

      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(isEdit ? "Equipment item updated." : duplicateFrom ? "Serialized item added." : "Equipment item added.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <Button type="button" variant={isEdit ? "ghost" : "default"} size={isEdit ? "sm" : "default"} onClick={() => setOpen(true)}>
          {isEdit ? (
            <>
              <Pencil />
              Edit
            </>
          ) : (
            <>
              <Plus />
              Add Equipment
            </>
          )}
        </Button>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Equipment" : duplicateFrom ? `Add serialized item — ${duplicateFrom.name}` : "Add Equipment"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this item's details."
              : duplicateFrom
                ? "Catalog details are pre-filled from the source item — set this unit's own serial/reference number and any per-unit overrides."
                : "Add a new item to the inventory — an individually tracked asset or a quantity-based item."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {!isEdit && !duplicateFrom && (
            <div className="flex flex-col gap-1.5">
              <Label>Tracking</Label>
              <Select value={trackingMode} onValueChange={(value) => setTrackingMode(value ?? "quantity")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_TRACKING_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {EQUIPMENT_TRACKING_MODE_LABELS[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eq-category">Category</Label>
              <Input id="eq-category" list="equipment-category-suggestions" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. PPE" />
              <datalist id="equipment-category-suggestions">
                {EQUIPMENT_CATEGORY_SUGGESTIONS.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eq-name">Name</Label>
              <Input id="eq-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Safety Gloves" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eq-description">Description</Label>
            <Textarea id="eq-description" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eq-reference">Reference / Asset number</Label>
              <Input id="eq-reference" value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder="Optional" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eq-specification">Size / specification</Label>
              <Input id="eq-specification" value={specification} onChange={(event) => setSpecification(event.target.value)} placeholder="e.g. Size 9" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eq-manufacturer">Manufacturer</Label>
              <Input id="eq-manufacturer" value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eq-model">Model</Label>
              <Input id="eq-model" value={model} onChange={(event) => setModel(event.target.value)} />
            </div>
          </div>

          {!isEdit && trackingMode === "quantity" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="eq-quantity">Quantity</Label>
                <Input id="eq-quantity" type="number" min={0} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Condition</Label>
                <Select value={condition} onValueChange={(value) => setCondition(value ?? "new")}>
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
          )}
          {!isEdit && trackingMode === "serialized" && (
            <div className="flex flex-col gap-1.5">
              <Label>Condition</Label>
              <Select value={condition} onValueChange={(value) => setCondition(value ?? "new")}>
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
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Ownership</Label>
            <Select value={ownership} onValueChange={(value) => setOwnership(value as "company" | "project")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">Allocated to {projectName}</SelectItem>
                <SelectItem value="company">Company-wide inventory</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eq-default-validity">Default validity (days)</Label>
            <Input
              id="eq-default-validity"
              type="number"
              min={1}
              max={36500}
              value={defaultValidityDays}
              onChange={(event) => setDefaultValidityDays(event.target.value)}
              placeholder="Leave blank for no expiry (e.g. 365 for annual PPE)"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eq-unit-price">Unit price</Label>
              <Input id="eq-unit-price" type="number" min={0} step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} placeholder="Leave blank for no price" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eq-currency">Currency</Label>
              <Input id="eq-currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} placeholder="EUR" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eq-purchase-date">Purchase date</Label>
            <Input id="eq-purchase-date" type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="eq-requestable">Requestable</Label>
              <span className="text-xs text-muted-foreground">Employees can self-service request this item.</span>
            </div>
            <Switch id="eq-requestable" checked={requestable} onCheckedChange={setRequestable} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eq-location">Storage / location</Label>
            <Input id="eq-location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Site Store A" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eq-notes">Notes</Label>
            <Textarea id="eq-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending || !name.trim() || !category.trim()}>
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
