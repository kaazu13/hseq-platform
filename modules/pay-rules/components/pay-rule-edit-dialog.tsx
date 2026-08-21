"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { setPayRule } from "@/modules/pay-rules/actions";
import type { PayRule, PayRuleCategory, PayRuleCalculationType } from "@/modules/pay-rules/types";
import { PAY_RULE_CATEGORY_LABELS, PAY_RULE_CALCULATION_TYPE_LABELS } from "@/modules/pay-rules/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const CALCULATION_TYPES: PayRuleCalculationType[] = ["base_only", "percentage_extra", "fixed_extra_per_hour"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Part 10/12/18 — the Pay Rules section's [Edit rules] action per category: close-then-insert via setPayRule(), never rewrites a prior period so historical earnings calculations stay correct. `stackable` only matters for the `sunday` category (Part 12) but is stored/shown uniformly. */
export function PayRuleEditDialog({ companyId, category, currentRule }: { companyId: string; category: PayRuleCategory; currentRule: PayRule | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [calculationType, setCalculationType] = useState<PayRuleCalculationType>(currentRule?.calculation_type ?? (category === "regular" ? "base_only" : "fixed_extra_per_hour"));
  const [value, setValue] = useState(currentRule && currentRule.calculation_type !== "base_only" ? String(currentRule.value) : "");
  const [currency, setCurrency] = useState(currentRule?.currency ?? "EUR");
  const [stackable, setStackable] = useState(currentRule?.stackable ?? true);
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await setPayRule(companyId, {
        category,
        calculationType,
        value: calculationType === "base_only" ? 0 : Number(value),
        currency,
        stackable,
        effectiveFrom,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(`${PAY_RULE_CATEGORY_LABELS[category]} pay rule updated.`);
      setOpen(false);
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
        <Pencil />
        {currentRule ? "Edit rule" : "Set rule"}
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{PAY_RULE_CATEGORY_LABELS[category]} pay rule</DialogTitle>
          <DialogDescription>This starts a NEW rule period from the effective date — historical earnings already calculated stay unchanged, using whatever rule applied on that work date.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Calculation</Label>
            <Select value={calculationType} onValueChange={(v) => setCalculationType((v as PayRuleCalculationType) ?? "base_only")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALCULATION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {PAY_RULE_CALCULATION_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {calculationType !== "base_only" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-rule-value">{calculationType === "percentage_extra" ? "Extra %" : "Extra per hour"}</Label>
                <Input id="pay-rule-value" type="number" min={0} step="0.01" value={value} onChange={(event) => setValue(event.target.value)} placeholder={calculationType === "percentage_extra" ? "e.g. 20" : "e.g. 2.00"} />
              </div>
              {calculationType === "fixed_extra_per_hour" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pay-rule-currency">Currency</Label>
                  <Input id="pay-rule-currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} />
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-rule-effective-from">Effective from</Label>
            <Input id="pay-rule-effective-from" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
          </div>

          {category === "sunday" && (
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="pay-rule-stackable">Stacks with other premiums</Label>
                <span className="text-xs text-muted-foreground">When on, Sunday premium adds on top of overtime/night premiums for the same hour.</span>
              </div>
              <Switch id="pay-rule-stackable" checked={stackable} onCheckedChange={setStackable} />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending || !effectiveFrom || (calculationType !== "base_only" && !value)}>
            {isPending ? "Saving…" : "Save rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
