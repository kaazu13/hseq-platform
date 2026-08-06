"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UserX } from "lucide-react";
import { toast } from "sonner";
import { endEmployment } from "@/modules/employees/actions";
import { EMPLOYMENT_END_REASONS, EMPLOYMENT_END_REASON_LABELS } from "@/modules/employees/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type EndEmploymentDialogProps = {
  companyId: string;
  employeeId: string;
  employeeName: string;
};

const TODAY = () => new Date().toISOString().slice(0, 10);

/**
 * Closes the employee's current open employment period —
 * modules/employees/actions.ts's `endEmployment`. A form dialog rather
 * than a plain ConfirmDialog: requirement 6 of the Employment Lifecycle
 * milestone needs an end date, a reason, and an optional note collected at
 * the point of action, not just a yes/no confirmation.
 */
export function EndEmploymentDialog({ companyId, employeeId, employeeName }: EndEmploymentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Controlled, not FormData-read, for the same reason employee-roles-tab.tsx's
  // role Select is controlled: Base UI's Select is a custom listbox, not a
  // native <select>, so its value isn't reliably readable via FormData.
  const [endReason, setEndReason] = useState<(typeof EMPLOYMENT_END_REASONS)[number]>("resigned");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await endEmployment(companyId, employeeId, {
        endDate: String(formData.get("endDate") ?? ""),
        endReason,
        endNote: String(formData.get("endNote") ?? ""),
      });
      if (!result.ok) {
        toast.error(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <UserX />
            End employment
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>End {employeeName}&rsquo;s employment?</DialogTitle>
            <DialogDescription>
              Closes their current employment period. The record, roles, and account are kept — this only records that
              they&rsquo;re no longer employed here. They can be rehired later.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" name="endDate" type="date" required defaultValue={TODAY()} aria-invalid={Boolean(fieldErrors.endDate)} />
              {fieldErrors.endDate && <p className="text-sm text-destructive">{fieldErrors.endDate}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endReason">Reason</Label>
              <Select value={endReason} onValueChange={(value) => setEndReason(value as typeof endReason)}>
                <SelectTrigger id="endReason" className="w-full" aria-invalid={Boolean(fieldErrors.endReason)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_END_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {EMPLOYMENT_END_REASON_LABELS[reason]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.endReason && <p className="text-sm text-destructive">{fieldErrors.endReason}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endNote">Note (optional)</Label>
              <Textarea id="endNote" name="endNote" rows={3} aria-invalid={Boolean(fieldErrors.endNote)} />
              {fieldErrors.endNote && <p className="text-sm text-destructive">{fieldErrors.endNote}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? "Ending…" : "End employment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
