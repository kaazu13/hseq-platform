"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { upsertCompanySubscription } from "@/modules/platform-admin/actions";
import { COMPANY_SUBSCRIPTION_STATUS_LABELS, type CompanySubscriptionStatus } from "@/modules/platform-admin/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

const STATUSES: CompanySubscriptionStatus[] = ["trialing", "active", "past_due", "canceled", "paused"];

/**
 * Part 9 foundation, Part 2 UI — create/edit a company's billing record.
 * No payment processing anywhere in this component; upsert_company_subscription()
 * is pure record-keeping (see 20260831091000_billing_usage_foundation.sql's
 * header comment).
 */
export function BillingEditDialog({
  companyId,
  companyName,
  current,
}: {
  companyId: string;
  companyName: string;
  current: { planName: string | null; status: CompanySubscriptionStatus | null; employeeLimit: number | null; projectLimit: number | null; billingRenewalDate?: string | null; notes?: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [planName, setPlanName] = useState(current.planName ?? "");
  const [status, setStatus] = useState<CompanySubscriptionStatus>(current.status ?? "trialing");
  const [employeeLimit, setEmployeeLimit] = useState(current.employeeLimit != null ? String(current.employeeLimit) : "");
  const [projectLimit, setProjectLimit] = useState(current.projectLimit != null ? String(current.projectLimit) : "");
  const [renewalDate, setRenewalDate] = useState(current.billingRenewalDate ?? "");
  const [notes, setNotes] = useState(current.notes ?? "");

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await upsertCompanySubscription(companyId, {
        planName: planName || undefined,
        subscriptionStatus: status,
        employeeLimit: employeeLimit ? Number(employeeLimit) : undefined,
        projectLimit: projectLimit ? Number(projectLimit) : undefined,
        billingRenewalDate: renewalDate || undefined,
        notes: notes || undefined,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success("Billing information saved.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>
        <Pencil />
        Edit plan
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Billing — {companyName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billing-plan-name">Plan name</Label>
            <Input id="billing-plan-name" value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder="e.g. Growth" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billing-status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as CompanySubscriptionStatus)}>
              <SelectTrigger id="billing-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {COMPANY_SUBSCRIPTION_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="billing-employee-limit">Employee limit</Label>
              <Input id="billing-employee-limit" type="number" min={1} value={employeeLimit} onChange={(event) => setEmployeeLimit(event.target.value)} placeholder="No limit" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="billing-project-limit">Project limit</Label>
              <Input id="billing-project-limit" type="number" min={1} value={projectLimit} onChange={(event) => setProjectLimit(event.target.value)} placeholder="No limit" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billing-renewal-date">Renewal date</Label>
            <Input id="billing-renewal-date" type="date" value={renewalDate} onChange={(event) => setRenewalDate(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billing-notes">Notes</Label>
            <Textarea id="billing-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={isPending} onClick={handleSave}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
