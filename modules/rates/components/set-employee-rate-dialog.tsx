"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { setEmployeeHourlyRate } from "@/modules/rates/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SetEmployeeRateDialogProps = {
  companyId: string;
  employeeId: string;
  employeeName: string;
  currentRate: { hourlyRate: number; currency: string } | null;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Part 18 — the Employee Rates section's [Set rate] action: close-then-insert via setEmployeeHourlyRate(), never overwrites history. company_admin/planner/platform_super_admin only — the action itself re-enforces this server-side. */
export function SetEmployeeRateDialog({ companyId, employeeId, employeeName, currentRate }: SetEmployeeRateDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hourlyRate, setHourlyRate] = useState(currentRate ? String(currentRate.hourlyRate) : "");
  const [currency, setCurrency] = useState(currentRate?.currency ?? "EUR");
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [reason, setReason] = useState("");

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await setEmployeeHourlyRate(companyId, employeeId, { hourlyRate: Number(hourlyRate), currency, effectiveFrom, reason: reason || undefined });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(`${employeeName}'s rate updated.`);
      setOpen(false);
      setReason("");
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
        {currentRate ? "Change rate" : "Set rate"}
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set rate — {employeeName}</DialogTitle>
          <DialogDescription>This starts a NEW rate period from the effective date — the prior rate stays in history unchanged.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rate-hourly">Hourly rate</Label>
              <Input id="rate-hourly" type="number" min={0} step="0.01" value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rate-currency">Currency</Label>
              <Input id="rate-currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rate-effective-from">Effective from</Label>
            <Input id="rate-effective-from" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rate-reason">Reason (optional)</Label>
            <Textarea id="rate-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Annual review, promotion" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending || !hourlyRate || !effectiveFrom}>
            {isPending ? "Saving…" : "Save rate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
